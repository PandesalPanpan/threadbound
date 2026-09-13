import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/application/EventBus.js';
import { QuestService } from '../src/application/QuestService.js';
import { ActivityStreamService } from '../src/application/ActivityStreamService.js';
import { QUEST_CATALOG } from '../src/content/QuestCatalog.js';
import { SQLiteActivityStreamRepository } from '../src/infrastructure/SQLiteActivityStreamRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function fixture() {
  let streamId = 0;
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'quest-card-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'quest-card-user', displayName: 'Quest Adventurer' });
  const eventBus = new EventBus();
  const events = [];
  eventBus.subscribe((event) => events.push(event));
  const questService = new QuestService({ repository, eventBus, questCatalog: QUEST_CATALOG, now: () => new Date('2026-09-13T04:00:00.000Z') });
  const streamRepository = new SQLiteActivityStreamRepository({ database: repository.db, idFactory: () => `quest-stream-${++streamId}` });
  const activityStream = new ActivityStreamService({ streamRepository, gameRepository: repository });
  return { repository, player, eventBus, events, questService, activityStream };
}

test('QuestService projects available, active, claimable, and completed card states from authoritative lifecycle', () => {
  const { repository, player, eventBus, events, questService } = fixture();
  try {
    let browse = questService.browse(player.id);
    assert.equal(browse.quests[0].state, 'available');
    assert.equal(browse.quests[0].objectives[0].label, 'Hunt');

    questService.accept(player.id, 'guild-field-check', '2026-09-13T03:00:00.000Z');
    browse = questService.browse(player.id);
    assert.equal(browse.quests[0].state, 'active');
    assert.equal(browse.quests[0].progress.objectiveProgress[0].current, 0);

    eventBus.publish({ type: 'HuntResolved', playerId: player.id, enemyId: 'thread-wolf', victory: true });
    browse = questService.browse(player.id);
    assert.equal(browse.quests[0].state, 'claimable');
    assert.equal(browse.quests[0].progress.status, 'completed');
    assert.equal(browse.quests[0].progress.objectiveProgress[0].current, 1);

    questService.claim(player.id, 'guild-field-check', '2026-09-13T04:15:00.000Z');
    browse = questService.browse(player.id);
    assert.equal(browse.quests[0].state, 'completed');
    assert.equal(browse.quests[0].progress.status, 'claimed');
    assert.equal(repository.getPlayer(player.id).id, player.id);

    assert.equal(events.filter((event) => event.type === 'QuestAccepted').length, 1);
    assert.equal(events.filter((event) => event.type === 'QuestCompleted').length, 1);
    assert.equal(events.filter((event) => event.type === 'QuestClaimed').length, 1);
    assert.throws(() => questService.claim(player.id, 'guild-field-check'), (error) => error.code === 'quest_already_claimed');
  } finally {
    questService.dispose();
    repository.close();
  }
});

test('Quest claim rejects unfinished progress without mutating lifecycle', () => {
  const { repository, player, questService } = fixture();
  try {
    questService.accept(player.id, 'guild-field-check');
    assert.throws(() => questService.claim(player.id, 'guild-field-check'), (error) => error.code === 'quest_not_complete');
    assert.equal(questService.browse(player.id).quests[0].state, 'active');
  } finally {
    questService.dispose();
    repository.close();
  }
});

test('Quest accept and claim create concise receipts while automatic progress does not multiply stream messages', () => {
  const { repository, player, activityStream } = fixture();
  try {
    const accepted = activityStream.recordDomainEvent({ type: 'QuestAccepted', playerId: player.id, questId: 'guild-field-check', questTitle: 'Guild Field Check', areaNumber: 1 });
    assert.equal(accepted.body, 'Quest Adventurer accepted Quest: Guild Field Check.');
    assert.equal(activityStream.recordDomainEvent({ type: 'QuestProgressed', playerId: player.id, questId: 'guild-field-check' }), null);
    assert.equal(activityStream.recordDomainEvent({ type: 'QuestCompleted', playerId: player.id, questId: 'guild-field-check' }), null);
    const claimed = activityStream.recordDomainEvent({ type: 'QuestClaimed', playerId: player.id, questId: 'guild-field-check', questTitle: 'Guild Field Check', areaNumber: 1 });
    assert.equal(claimed.body, 'Quest Adventurer completed Quest: Guild Field Check.');
    assert.equal(activityStream.recent().length, 2);
  } finally {
    repository.close();
  }
});
