import test from 'node:test';
import assert from 'node:assert/strict';
import { Quest, QuestProgress, QUEST_PROGRESS_STATUSES } from '../src/domain/Quest.js';
import { QuestService } from '../src/application/QuestService.js';
import { AreaProgression } from '../src/domain/AreaProgression.js';
import { SQLiteAreaRepository } from '../src/infrastructure/SQLiteAreaRepository.js';
import { SQLiteQuestRepository } from '../src/infrastructure/SQLiteQuestRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

const QUEST = new Quest({
  id: 'first-errand',
  title: 'First Errand',
  description: 'A neutral foundation Quest used to prove lifecycle boundaries.',
  areaNumber: 1,
  townId: 'area-1-town',
  npcId: 'area-1-shopkeeper',
});

const AREA_TWO_QUEST = new Quest({
  id: 'second-errand',
  title: 'Second Errand',
  areaNumber: 2,
});

test('Quest definitions are immutable world references without objective behavior', () => {
  assert.deepEqual(QUEST.toJSON(), {
    id: 'first-errand',
    title: 'First Errand',
    description: 'A neutral foundation Quest used to prove lifecycle boundaries.',
    area: { id: 'area-1', number: 1, name: 'Area 1' },
    areaNumber: 1,
    townId: 'area-1-town',
    npcId: 'area-1-shopkeeper',
  });
  assert.equal(Object.isFrozen(QUEST), true);
  assert.deepEqual(QUEST_PROGRESS_STATUSES, ['active', 'completed', 'claimed']);
  assert.throws(() => new Quest({ id: 'bad quest', title: 'Bad', areaNumber: 1 }), /stable kebab-case/i);
  assert.throws(() => new Quest({ id: 'bad-quest', title: 'Bad', areaNumber: 1, npcId: 'npc' }), /requires a Town id/i);
});

test('QuestProgress owns durable lifecycle transitions and rejects invalid state', () => {
  const active = new QuestProgress({ questId: QUEST.id, acceptedAt: '2026-09-13T00:00:00.000Z' });
  const completed = active.complete('2026-09-13T00:05:00.000Z');
  const claimed = completed.claim('2026-09-13T00:06:00.000Z');
  assert.equal(active.status, 'active');
  assert.equal(completed.status, 'completed');
  assert.equal(claimed.status, 'claimed');
  assert.equal(claimed.claimedAt, '2026-09-13T00:06:00.000Z');
  assert.equal(claimed.claim(), claimed);
  assert.throws(() => active.claim(), /Only a completed Quest/i);
  assert.throws(() => new QuestProgress({ questId: QUEST.id, status: 'completed' }), /requires completedAt/i);
});

function fixture() {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'quest-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'quest-user', displayName: 'Quest Adventurer' });
  const areaRepository = new SQLiteAreaRepository({ database: repository.db });
  const questRepository = new SQLiteQuestRepository({ database: repository.db });
  return { repository, player, areaRepository, questRepository };
}

test('SQLiteQuestRepository persists one lifecycle row per player and Quest', () => {
  const { repository, player, questRepository } = fixture();
  try {
    const accepted = questRepository.accept(player.id, QUEST.id, '2026-09-13T00:00:00.000Z');
    assert.equal(accepted.created, true);
    assert.equal(questRepository.accept(player.id, QUEST.id).created, false);
    const completed = accepted.progress.complete('2026-09-13T00:05:00.000Z');
    assert.equal(questRepository.save(player.id, completed).status, 'completed');
    const claimed = completed.claim('2026-09-13T00:06:00.000Z');
    assert.equal(questRepository.save(player.id, claimed).status, 'claimed');
    assert.deepEqual(questRepository.list(player.id).map((entry) => entry.questId), [QUEST.id]);
  } finally {
    repository.close();
  }
});

test('QuestService derives available state from authoritative Area and persists acceptance exactly once', () => {
  const events = [];
  const { repository, player, areaRepository, questRepository } = fixture();
  const service = new QuestService({
    repository,
    areaRepository,
    questRepository,
    eventBus: { publish: (event) => events.push(event) },
    questCatalog: [QUEST, AREA_TWO_QUEST],
  });
  try {
    const areaOne = service.browse(player.id);
    assert.equal(areaOne.currentArea.id, 'area-1');
    assert.deepEqual(areaOne.quests.map((quest) => [quest.id, quest.state]), [['first-errand', 'available']]);

    const result = service.accept(player.id, QUEST.id, '2026-09-13T00:00:00.000Z');
    assert.equal(result.progress.status, 'active');
    assert.equal(service.browse(player.id).quests[0].state, 'active');
    assert.deepEqual(events, [{ type: 'QuestAccepted', playerId: player.id, questId: QUEST.id, areaNumber: 1 }]);
    assert.throws(() => service.accept(player.id, QUEST.id), (error) => error.code === 'quest_already_accepted');
    assert.equal(events.length, 1);

    areaRepository.save(player.id, new AreaProgression().withHighestUnlockedArea(2).withCurrentArea(2));
    assert.deepEqual(service.browse(player.id).quests.map((quest) => quest.id), ['second-errand']);
    assert.throws(() => service.accept(player.id, QUEST.id), (error) => error.code === 'quest_unavailable');
  } finally {
    repository.close();
  }
});
