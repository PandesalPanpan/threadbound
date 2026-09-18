import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/application/EventBus.js';
import { QuestService } from '../src/application/QuestService.js';
import { Quest } from '../src/domain/Quest.js';
import { QUEST_OBJECTIVE_TYPES, describeQuestObjective } from '../src/domain/QuestObjective.js';
import { SQLiteAreaRepository } from '../src/infrastructure/SQLiteAreaRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { SQLiteQuestRepository } from '../src/infrastructure/SQLiteQuestRepository.js';

const OBJECTIVE_QUEST = new Quest({
  id: 'guild-trial',
  title: 'Guild Trial',
  areaNumber: 1,
  objectives: [
    { id: 'wolves', type: 'kill', targetId: 'thread-wolf', targetLabel: 'Thread Wolf', count: 2 },
    { id: 'hunts', type: 'hunt', count: 2 },
    { id: 'adventures', type: 'adventure', count: 1 },
    { id: 'token', type: 'collect', targetId: 'guild-token', targetLabel: 'Guild Token', count: 1 },
    { id: 'boss', type: 'boss', targetId: 'progression-area-1', targetLabel: 'Frayed Hollow guardian', count: 1 },
    { id: 'visit', type: 'visit', targetId: 'area-1-blacksmith', targetLabel: 'Blacksmith', count: 1 },
    { id: 'speak', type: 'speak', targetId: 'area-1-blacksmith', targetLabel: 'Blacksmith', count: 1 },
  ],
});

function fixture() {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'objective-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'objective-user', displayName: 'Objective Adventurer' });
  const questRepository = new SQLiteQuestRepository({ database: repository.db });
  const areaRepository = new SQLiteAreaRepository({ database: repository.db });
  const eventBus = new EventBus();
  const events = [];
  eventBus.subscribe((event) => events.push(event));
  const service = new QuestService({
    repository,
    questRepository,
    areaRepository,
    eventBus,
    questCatalog: [OBJECTIVE_QUEST],
    now: () => new Date('2026-09-13T03:00:00.000Z'),
  });
  return { repository, player, questRepository, eventBus, events, service };
}

test('Quest objective vocabulary is constrained and projects readable labels', () => {
  assert.deepEqual(QUEST_OBJECTIVE_TYPES, ['kill', 'hunt', 'adventure', 'collect', 'boss', 'visit', 'speak']);
  assert.equal(describeQuestObjective(OBJECTIVE_QUEST.objectives[0]), 'Defeat Thread Wolf ×2');
  assert.equal(describeQuestObjective(OBJECTIVE_QUEST.objectives[1]), 'Hunt ×2');
  assert.equal(describeQuestObjective(OBJECTIVE_QUEST.objectives[2]), 'Adventure');
  assert.equal(describeQuestObjective(OBJECTIVE_QUEST.objectives[3]), 'Collect Guild Token');
  assert.equal(describeQuestObjective(OBJECTIVE_QUEST.objectives[4]), 'Defeat boss Frayed Hollow guardian');
  assert.equal(describeQuestObjective(OBJECTIVE_QUEST.objectives[5]), 'Visit Blacksmith');
  assert.equal(describeQuestObjective(OBJECTIVE_QUEST.objectives[6]), 'Speak to Blacksmith');
  assert.throws(() => new Quest({ id: 'bad-objective', title: 'Bad', areaNumber: 1, objectives: [{ type: 'script', count: 1 }] }), /Unsupported Quest objective type/i);
});

test('QuestService advances kill, Hunt, Adventure, collect, boss, and visit/speak objectives from authoritative events', () => {
  const { repository, player, questRepository, eventBus, events, service } = fixture();
  try {
    const accepted = service.accept(player.id, OBJECTIVE_QUEST.id, '2026-09-13T02:00:00.000Z');
    assert.equal(accepted.progress.objectiveProgress.length, 7);
    assert.ok(accepted.progress.objectiveProgress.every((row) => row.current === 0));

    eventBus.publish({ type: 'HuntResolved', playerId: player.id, enemyId: 'other-enemy', victory: true });
    let progress = questRepository.get(player.id, OBJECTIVE_QUEST.id);
    assert.equal(progress.objectiveProgress.find((row) => row.objectiveId === 'hunts').current, 1);
    assert.equal(progress.objectiveProgress.find((row) => row.objectiveId === 'wolves').current, 0);

    eventBus.publish({ type: 'HuntResolved', playerId: player.id, enemyId: 'thread-wolf', victory: true });
    eventBus.publish({ type: 'HuntResolved', playerId: player.id, enemyId: 'thread-wolf', victory: true });
    eventBus.publish({ type: 'AdventureResolved', playerId: player.id, enemyId: 'thread-wolf', victory: false });
    eventBus.publish({ type: 'ItemGenerated', playerId: player.id, itemId: 'guild-token', source: 'quest-test' });
    eventBus.publish({ type: 'DungeonCompleted', playerId: player.id, dungeonId: 'progression-area-1', runId: 'quest-run-1' });

    progress = questRepository.get(player.id, OBJECTIVE_QUEST.id);
    assert.equal(progress.status, 'active');
    assert.equal(progress.objectiveProgress.find((row) => row.objectiveId === 'wolves').current, 2);
    assert.equal(progress.objectiveProgress.find((row) => row.objectiveId === 'hunts').current, 2);
    assert.equal(progress.objectiveProgress.find((row) => row.objectiveId === 'adventures').current, 1);
    assert.equal(progress.objectiveProgress.find((row) => row.objectiveId === 'token').current, 1);
    assert.equal(progress.objectiveProgress.find((row) => row.objectiveId === 'boss').current, 1);

    eventBus.publish({ type: 'NpcInteracted', playerId: player.id, townId: 'area-1-town', npcId: 'area-1-blacksmith' });
    progress = questRepository.get(player.id, OBJECTIVE_QUEST.id);
    assert.equal(progress.status, 'completed');
    assert.equal(progress.completedAt, '2026-09-13T03:00:00.000Z');
    assert.ok(progress.objectiveProgress.every((row) => row.complete));

    const completedEvents = events.filter((event) => event.type === 'QuestCompleted' && event.questId === OBJECTIVE_QUEST.id);
    assert.equal(completedEvents.length, 1);

    eventBus.publish({ type: 'NpcInteracted', playerId: player.id, townId: 'area-1-town', npcId: 'area-1-blacksmith' });
    assert.equal(events.filter((event) => event.type === 'QuestCompleted' && event.questId === OBJECTIVE_QUEST.id).length, 1);
  } finally {
    service.dispose();
    repository.close();
  }
});

test('QuestService projects persisted Hunt counters onto objective cards after reload', () => {
  const { repository, player, eventBus, service } = fixture();
  try {
    service.accept(player.id, OBJECTIVE_QUEST.id, '2026-09-13T02:00:00.000Z');
    let quest = service.browse(player.id).quests[0];
    assert.equal(quest.objectives.find((objective) => objective.id === 'hunts').current, 0);
    assert.equal(quest.objectives.find((objective) => objective.id === 'hunts').target, 2);

    eventBus.publish({ type: 'HuntResolved', playerId: player.id, enemyId: 'thread-wolf', victory: true });
    quest = service.browse(player.id).quests[0];
    const huntObjective = quest.objectives.find((objective) => objective.id === 'hunts');
    assert.deepEqual({ current: huntObjective.current, target: huntObjective.target, complete: huntObjective.complete }, {
      current: 1,
      target: 2,
      complete: false,
    });

    const reconstructed = new QuestService({
      repository,
      questRepository: new SQLiteQuestRepository({ database: repository.db }),
      areaRepository: new SQLiteAreaRepository({ database: repository.db }),
      questCatalog: [OBJECTIVE_QUEST],
    });
    try {
      const afterReload = reconstructed.browse(player.id).quests[0].objectives.find((objective) => objective.id === 'hunts');
      assert.equal(afterReload.current, 1);
      assert.equal(afterReload.target, 2);
    } finally {
      reconstructed.dispose();
    }
  } finally {
    service.dispose();
    repository.close();
  }
});

test('Quest objective progress survives repository reconstruction', () => {
  const { repository, player, questRepository, eventBus, service } = fixture();
  try {
    service.accept(player.id, OBJECTIVE_QUEST.id, '2026-09-13T02:00:00.000Z');
    eventBus.publish({ type: 'HuntResolved', playerId: player.id, enemyId: 'thread-wolf', victory: true });
    const reconstructed = new SQLiteQuestRepository({ database: repository.db });
    const stored = reconstructed.get(player.id, OBJECTIVE_QUEST.id);
    assert.equal(stored.objectiveProgress.find((row) => row.objectiveId === 'wolves').current, 1);
    assert.equal(stored.objectiveProgress.find((row) => row.objectiveId === 'hunts').current, 1);
  } finally {
    service.dispose();
    repository.close();
  }
});
