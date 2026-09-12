import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/application/EventBus.js';
import { SimpleDungeonService, AREA_ONE_PROGRESSION_DUNGEON_ID } from '../src/application/SimpleDungeonService.js';
import { applyProgressionBossEnrage, progressionBossEnrage } from '../src/domain/ProgressionBossEnragePolicy.js';
import { DUNGEONS } from '../src/domain/AdventureRun.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { SQLiteProgressionBossEnrageRepository } from '../src/infrastructure/SQLiteProgressionBossEnrageRepository.js';

test('progression boss enrage is capped and scales only the boss modestly', () => {
  const base = { ...DUNGEONS['frayed-hollow'], progressionAdventure: true };
  const enraged = applyProgressionBossEnrage(base, 3);
  assert.deepEqual(progressionBossEnrage(99), { stack: 4, cap: 4, step: 0.1, multiplier: 1.4, percentIncrease: 40 });
  assert.equal(enraged.progressionEnrage.stack, 3);
  assert.equal(enraged.boss.hp, Math.ceil(base.boss.hp * 1.3));
  assert.equal(enraged.boss.retaliation, Math.ceil(base.boss.retaliation * 1.3));
  assert.equal(enraged.encounters[0].hp, base.encounters[0].hp);
});

test('failure increments once per run, caps at four, and victory resets durably', () => {
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:' });
  const repository = new SQLiteProgressionBossEnrageRepository({ database: gameRepository.db });
  assert.equal(repository.get(AREA_ONE_PROGRESSION_DUNGEON_ID), 0);
  assert.equal(repository.recordFailure(AREA_ONE_PROGRESSION_DUNGEON_ID, 'run-1'), 1);
  assert.equal(repository.recordFailure(AREA_ONE_PROGRESSION_DUNGEON_ID, 'run-1'), 1);
  repository.recordFailure(AREA_ONE_PROGRESSION_DUNGEON_ID, 'run-2');
  repository.recordFailure(AREA_ONE_PROGRESSION_DUNGEON_ID, 'run-3');
  assert.equal(repository.recordFailure(AREA_ONE_PROGRESSION_DUNGEON_ID, 'run-4'), 4);
  assert.equal(repository.recordFailure(AREA_ONE_PROGRESSION_DUNGEON_ID, 'run-5'), 4);
  assert.equal(repository.recordVictory(AREA_ONE_PROGRESSION_DUNGEON_ID, 'run-win'), 0);
  assert.equal(repository.get(AREA_ONE_PROGRESSION_DUNGEON_ID), 0);
  gameRepository.close();
});

test('progression service projects persisted enrage into the next authoritative definition and resets on completion', () => {
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:' });
  const eventBus = new EventBus();
  const service = new SimpleDungeonService({ repository: gameRepository, eventBus });
  eventBus.publish({ type: 'DungeonFailed', dungeonId: AREA_ONE_PROGRESSION_DUNGEON_ID, runId: 'failed-1', participantIds: ['a', 'b'] });
  const afterFailure = service.definition(AREA_ONE_PROGRESSION_DUNGEON_ID);
  assert.equal(afterFailure.progressionEnrage.stack, 1);
  assert.equal(afterFailure.boss.hp, Math.ceil(DUNGEONS['frayed-hollow'].boss.hp * 1.1));
  eventBus.publish({ type: 'DungeonCompleted', dungeonId: AREA_ONE_PROGRESSION_DUNGEON_ID, runId: 'win-1', participantIds: ['a', 'b'] });
  assert.equal(service.definition(AREA_ONE_PROGRESSION_DUNGEON_ID).progressionEnrage.stack, 0);
  gameRepository.close();
});
