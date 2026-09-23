import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/application/EventBus.js';
import { QuestService } from '../src/application/QuestService.js';
import { Quest } from '../src/domain/Quest.js';
import { SQLitePlayerProgressionRepository } from '../src/infrastructure/SQLitePlayerProgressionRepository.js';
import { SQLiteQuestRepository } from '../src/infrastructure/SQLiteQuestRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function fixture() {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'quest-reward-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'quest-reward-user', displayName: 'Quest Reward Adventurer' });
  const questRepository = new SQLiteQuestRepository({ database: repository.db });
  const progressionRepository = new SQLitePlayerProgressionRepository({ database: repository.db });
  const eventBus = new EventBus();
  const events = [];
  eventBus.subscribe((event) => events.push(event));
  return { repository, player, questRepository, progressionRepository, eventBus, events };
}

const REPEATABLE_QUEST = new Quest({
  id: 'repeatable-field-check',
  title: 'Repeatable Field Check',
  areaNumber: 1,
  townId: 'area-1-town',
  reward: { gold: 21, experience: 50 },
  objectives: [{ id: 'complete-hunt', type: 'hunt', count: 1 }],
});

test('Quest claims atomically award Gold and XP, project level growth, and issue a stable renewal', () => {
  const { repository, player, questRepository, progressionRepository, eventBus, events } = fixture();
  const service = new QuestService({
    repository,
    questRepository,
    progressionRepository,
    eventBus,
    catalog: [REPEATABLE_QUEST],
    questCatalog: [],
    now: () => new Date('2026-09-23T00:10:00.000Z'),
  });
  try {
    service.accept(player.id, REPEATABLE_QUEST.id, '2026-09-23T00:00:00.000Z');
    assert.deepEqual(service.browse(player.id).quests.map((quest) => [quest.id, quest.state]), [
      [REPEATABLE_QUEST.id, 'active'],
    ]);
    eventBus.publish({ type: 'HuntResolved', playerId: player.id, enemyId: 'any-enemy', victory: true });
    const claimed = service.claim(player.id, REPEATABLE_QUEST.id, '2026-09-23T00:10:00.000Z');

    assert.equal(claimed.goldAwarded, 21);
    assert.equal(claimed.experienceAwarded, 50);
    assert.equal(claimed.levelsGained, 1);
    assert.equal(claimed.maxHealthIncrease, 3);
    assert.equal(claimed.maxHealth, 43);
    assert.equal(claimed.currentHealth, 43);
    assert.equal(repository.getPlayer(player.id).threadDust, 21);
    assert.equal(progressionRepository.get(player.id).experience, 50);
    assert.equal(questRepository.get(player.id, REPEATABLE_QUEST.id).status, 'claimed');
    assert.deepEqual(events.filter((event) => event.type === 'QuestClaimed').map((event) => ({
      questId: event.questId,
      goldAwarded: event.goldAwarded,
      experienceAwarded: event.experienceAwarded,
      levelsGained: event.levelsGained,
      maxHealthIncrease: event.maxHealthIncrease,
      maxHealth: event.maxHealth,
      currentHealth: event.currentHealth,
    })), [{
      questId: REPEATABLE_QUEST.id,
      goldAwarded: 21,
      experienceAwarded: 50,
      levelsGained: 1,
      maxHealthIncrease: 3,
      maxHealth: 43,
      currentHealth: 43,
    }]);

    assert.throws(() => service.claim(player.id, REPEATABLE_QUEST.id), (error) => error.code === 'quest_already_claimed');
    assert.equal(repository.getPlayer(player.id).threadDust, 21);
    assert.equal(progressionRepository.get(player.id).experience, 50);
    const renewal = service.browse(player.id).quests;
    assert.equal(renewal[0].id, REPEATABLE_QUEST.id);
    assert.equal(renewal[0].state, 'completed');
    assert.equal(renewal[1].id, 'repeatable-field-check-again-1');
    assert.equal(renewal[1].state, 'available');
  } finally {
    service.dispose();
    repository.close();
  }
});

test('a leveling Quest claim preserves HP regenerated since the last persisted health write', () => {
  const { repository, player, questRepository, progressionRepository, eventBus } = fixture();
  const service = new QuestService({
    repository,
    questRepository,
    progressionRepository,
    eventBus,
    catalog: [REPEATABLE_QUEST],
  });
  try {
    const staleHealthAt = new Date(Date.now() - 5 * 60_000).toISOString();
    repository.setPlayerHealth(player.id, 20, staleHealthAt);
    assert.equal(repository.getPlayer(player.id).currentHealth, 25);

    service.accept(player.id, REPEATABLE_QUEST.id);
    eventBus.publish({ type: 'HuntResolved', playerId: player.id, enemyId: 'any-enemy', victory: true });
    const claimed = service.claim(player.id, REPEATABLE_QUEST.id);

    assert.equal(claimed.maxHealthIncrease, 3);
    assert.equal(claimed.currentHealth, 28);
    assert.equal(repository.db.prepare('SELECT current_health FROM players WHERE id = ?').get(player.id).current_health, 28);
    assert.equal(repository.getPlayer(player.id).currentHealth, 28);
  } finally {
    service.dispose();
    repository.close();
  }
});

test('an accepted Quest definition and its reward survive catalog rotation and repository reload', () => {
  const { repository, player, questRepository, progressionRepository, eventBus } = fixture();
  const original = new Quest({
    id: 'catalog-rotation-quest',
    title: 'Original Field Note',
    areaNumber: 1,
    reward: { gold: 9, experience: 11 },
    objectives: [{ id: 'defeat-target', type: 'kill', targetId: 'old-target', targetLabel: 'Old Target' }],
  });
  const replacement = new Quest({
    id: original.id,
    title: 'Replacement Field Note',
    areaNumber: 1,
    reward: { gold: 99, experience: 99 },
    objectives: [{ id: 'defeat-target', type: 'kill', targetId: 'new-target', targetLabel: 'New Target' }],
  });
  const first = new QuestService({ repository, eventBus, catalog: [original], now: () => new Date('2026-09-23T01:00:00.000Z') });
  first.accept(player.id, original.id, '2026-09-23T00:00:00.000Z');
  first.dispose();

  const afterRotation = new QuestService({
    repository,
    questRepository: new SQLiteQuestRepository({ database: repository.db }),
    progressionRepository: new SQLitePlayerProgressionRepository({ database: repository.db }),
    eventBus,
    catalog: [replacement],
    now: () => new Date('2026-09-23T01:00:00.000Z'),
  });
  try {
    assert.equal(afterRotation.browse(player.id).quests[0].title, 'Original Field Note');
    eventBus.publish({ type: 'HuntResolved', playerId: player.id, enemyId: 'old-target', victory: true });
    assert.equal(questRepository.get(player.id, original.id).status, 'completed');
    const claimed = afterRotation.claim(player.id, original.id, '2026-09-23T01:00:00.000Z');
    assert.equal(claimed.quest.title, 'Original Field Note');
    assert.equal(claimed.goldAwarded, 9);
    assert.equal(claimed.experienceAwarded, 11);
    assert.equal(repository.getPlayer(player.id).threadDust, 9);
    assert.equal(progressionRepository.get(player.id).experience, 11);
  } finally {
    afterRotation.dispose();
    repository.close();
  }
});

test('Quest reward failure rolls the lifecycle CAS and Gold back with the shared SQLite transaction', () => {
  const { repository, player, questRepository, eventBus } = fixture();
  const failingProgressionRepository = {
    db: repository.db,
    grantExperienceInTransaction() { throw new Error('simulated XP persistence failure'); },
  };
  const service = new QuestService({
    repository,
    questRepository,
    progressionRepository: failingProgressionRepository,
    eventBus,
    catalog: [REPEATABLE_QUEST],
  });
  try {
    service.accept(player.id, REPEATABLE_QUEST.id);
    eventBus.publish({ type: 'HuntResolved', playerId: player.id, enemyId: 'any-enemy', victory: true });
    assert.throws(() => service.claim(player.id, REPEATABLE_QUEST.id), /simulated XP persistence failure/);
    assert.equal(questRepository.get(player.id, REPEATABLE_QUEST.id).status, 'completed');
    assert.equal(repository.getPlayer(player.id).threadDust, 0);
  } finally {
    service.dispose();
    repository.close();
  }
});
