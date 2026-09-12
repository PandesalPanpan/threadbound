import test from 'node:test';
import assert from 'node:assert/strict';
import { SQLiteAreaRepository } from '../src/infrastructure/SQLiteAreaRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function reward(id, playerId) {
  return {
    id,
    playerId,
    definitionId: `reward-${id}`,
    name: `Reward ${id}`,
    slot: 'Weapon',
    rarity: 'Common',
    attackBonus: 1,
    effectCode: 'none',
    effect: {},
    visualAssetId: null,
    source: 'progression-area-1',
  };
}

function completedState({ id, participants, rewardsGranted = true }) {
  return {
    id,
    ownerType: 'player',
    ownerId: participants[0].playerId,
    startedByPlayerId: participants[0].playerId,
    dungeonId: 'progression-area-1',
    dungeonDefinition: { progressionAdventure: true, unlocksAreaNumber: 2 },
    phase: 'complete',
    participants,
    rewardsGranted,
    createdAt: new Date(0).toISOString(),
    version: 0,
  };
}

test('progression completion atomically unlocks configured next Area for every participant exactly once', () => {
  let nextPlayer = 0;
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => `area-unlock-player-${++nextPlayer}` });
  const areas = new SQLiteAreaRepository({ database: repository.db });
  const first = repository.getOrCreatePlayer({ threadedUserId: 'unlock:first', displayName: 'First' });
  const second = repository.getOrCreatePlayer({ threadedUserId: 'unlock:second', displayName: 'Second' });
  const participants = [{ playerId: first.id }, { playerId: second.id }];
  const state = completedState({ id: 'progression-clear-1', participants });
  const persisted = repository.createRun({ ...state, rewardsGranted: false });
  const completionState = { ...state, version: persisted.version };

  const completion = repository.completeRunWithRewards(completionState, {
    [first.id]: reward('one', first.id),
    [second.id]: reward('two', second.id),
  }, {
    threadDust: 15,
    worldProgressKey: 'test:progression-area-1:clears',
    areaUnlockNumber: 2,
  });

  assert.equal(completion.applied, true);
  assert.deepEqual(completion.areaUnlocks.map(({ playerId, areaNumber }) => ({ playerId, areaNumber })).sort((a, b) => a.playerId.localeCompare(b.playerId)), [
    { playerId: first.id, areaNumber: 2 },
    { playerId: second.id, areaNumber: 2 },
  ].sort((a, b) => a.playerId.localeCompare(b.playerId)));
  assert.equal(areas.get(first.id).highestUnlockedAreaNumber, 2);
  assert.equal(areas.get(second.id).highestUnlockedAreaNumber, 2);

  const retry = repository.completeRunWithRewards(completionState, {}, {
    worldProgressKey: 'test:progression-area-1:clears',
    areaUnlockNumber: 2,
  });
  assert.equal(retry.applied, false);
  assert.deepEqual(retry.areaUnlocks, []);
  assert.equal(areas.get(first.id).highestUnlockedAreaNumber, 2);
  assert.equal(areas.get(second.id).highestUnlockedAreaNumber, 2);
});

test('re-clearing Area 1 never skips ahead and ordinary completions do not unlock Areas', () => {
  let nextPlayer = 0;
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => `area-repeat-player-${++nextPlayer}` });
  const areas = new SQLiteAreaRepository({ database: repository.db });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'unlock:repeat', displayName: 'Repeat' });
  const participants = [{ playerId: player.id }];

  for (const runId of ['clear-a', 'clear-b']) {
    const state = completedState({ id: runId, participants });
    const persisted = repository.createRun({ ...state, rewardsGranted: false });
    repository.completeRunWithRewards({ ...state, version: persisted.version }, {
      [player.id]: reward(`reward-${runId}`, player.id),
    }, {
      worldProgressKey: 'test:repeat-clears',
      areaUnlockNumber: 2,
    });
  }
  assert.equal(areas.get(player.id).highestUnlockedAreaNumber, 2);

  const ordinary = completedState({ id: 'ordinary-clear', participants });
  const persistedOrdinary = repository.createRun({ ...ordinary, dungeonId: 'frayed-hollow', rewardsGranted: false });
  repository.completeRunWithRewards({ ...ordinary, dungeonId: 'frayed-hollow', version: persistedOrdinary.version }, {
    [player.id]: reward('ordinary-reward', player.id),
  }, {
    worldProgressKey: 'test:ordinary-clears',
  });
  assert.equal(areas.get(player.id).highestUnlockedAreaNumber, 2);
});
