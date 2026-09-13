import test from 'node:test';
import assert from 'node:assert/strict';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { SQLiteSimulatedAdventurerRepository } from '../src/infrastructure/SQLiteSimulatedAdventurerRepository.js';
import { SimulatedAdventurer } from '../src/domain/SimulatedAdventurer.js';
import {
  planSimulatedAdventurerProgression,
  publicSimulatedAdventurerSimulationCadence,
} from '../src/domain/SimulatedAdventurerSimulationPolicy.js';
import { SimulatedAdventurerSimulationService } from '../src/application/SimulatedAdventurerSimulationService.js';

function fixture({ activityProfile = 'dedicated', lastSimulatedAt = null } = {}) {
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:' });
  const repository = new SQLiteSimulatedAdventurerRepository({ database: gameRepository.db });
  repository.save(new SimulatedAdventurer({
    id: 'bot-rin',
    name: 'Rin',
    activityProfile,
  }), { lastSimulatedAt });
  return {
    gameRepository,
    repository,
    service: new SimulatedAdventurerSimulationService({ repository }),
  };
}

test('activity profiles map to bounded cadences and never unlimited catch-up', () => {
  assert.deepEqual(publicSimulatedAdventurerSimulationCadence(), [
    { profileId: 'casual', intervalHours: 8, maxActionsPerRun: 2 },
    { profileId: 'steady', intervalHours: 4, maxActionsPerRun: 3 },
    { profileId: 'dedicated', intervalHours: 2, maxActionsPerRun: 4 },
  ]);

  const plan = planSimulatedAdventurerProgression({
    activityProfile: 'dedicated',
    lastSimulatedAt: '2026-09-10T00:00:00.000Z',
    now: '2026-09-11T00:00:00.000Z',
  });
  assert.equal(plan.actions.length, 4);
  assert.equal(plan.discardedBacklogActions, 8);
  assert.deepEqual(plan.actions.map((action) => action.actionType), ['hunt', 'hunt', 'hunt', 'adventure']);
  assert.deepEqual(plan.actions.map((action) => action.experienceAward), [12, 12, 12, 20]);
});

test('first scheduler observation establishes a cursor without retroactive progression', () => {
  const { gameRepository, repository, service } = fixture();
  try {
    const result = service.simulate({ adventurerId: 'bot-rin', now: '2026-09-11T00:00:00.000Z' });
    assert.equal(result.initialized, true);
    assert.equal(result.appliedActions, 0);
    assert.equal(result.adventurer.experience, 0);
    assert.equal(result.lastSimulatedAt, '2026-09-11T00:00:00.000Z');
    assert.deepEqual(repository.listTicks('bot-rin'), []);
  } finally {
    gameRepository.close();
  }
});

test('offline progression applies only the capped latest batch and advances the cursor', () => {
  const { gameRepository, repository, service } = fixture({ lastSimulatedAt: '2026-09-10T00:00:00.000Z' });
  try {
    const result = service.simulate({ adventurerId: 'bot-rin', now: '2026-09-11T00:00:00.000Z' });
    assert.equal(result.appliedActions, 4);
    assert.equal(result.discardedBacklogActions, 8);
    assert.equal(result.adventurer.experience, 56);
    assert.equal(result.adventurer.huntCount, 3);
    assert.equal(result.adventurer.adventureCount, 1);
    assert.equal(result.lastSimulatedAt, '2026-09-11T00:00:00.000Z');
    assert.equal(repository.listTicks('bot-rin').length, 4);

    const immediateRetry = service.simulate({ adventurerId: 'bot-rin', now: '2026-09-11T00:00:00.000Z' });
    assert.equal(immediateRetry.appliedActions, 0);
    assert.equal(immediateRetry.adventurer.experience, 56);
    assert.equal(repository.listTicks('bot-rin').length, 4);
  } finally {
    gameRepository.close();
  }
});

test('tick identity and cursor compare-and-swap make stale retries harmless', () => {
  const { gameRepository, repository } = fixture({ lastSimulatedAt: '2026-09-10T20:00:00.000Z' });
  try {
    const plan = planSimulatedAdventurerProgression({
      activityProfile: 'dedicated',
      lastSimulatedAt: '2026-09-10T20:00:00.000Z',
      now: '2026-09-11T00:00:00.000Z',
    });
    const first = repository.applySimulationBatch({
      adventurerId: 'bot-rin',
      expectedLastSimulatedAt: '2026-09-10T20:00:00.000Z',
      cursorAt: plan.cursorAt,
      actions: plan.actions,
    });
    assert.equal(first.status, 'applied');
    assert.equal(first.applied, 2);

    const staleRetry = repository.applySimulationBatch({
      adventurerId: 'bot-rin',
      expectedLastSimulatedAt: '2026-09-10T20:00:00.000Z',
      cursorAt: plan.cursorAt,
      actions: plan.actions,
    });
    assert.deepEqual(staleRetry, { status: 'stale', applied: 0, replayed: 0 });
    assert.equal(repository.get('bot-rin').adventurer.experience, 32);
    assert.equal(repository.listTicks('bot-rin').length, 2);
  } finally {
    gameRepository.close();
  }
});

test('clock regression fails closed rather than minting progression from invalid schedule input', () => {
  assert.throws(
    () => planSimulatedAdventurerProgression({
      activityProfile: 'steady',
      lastSimulatedAt: '2026-09-11T00:00:00.000Z',
      now: '2026-09-10T23:59:59.000Z',
    }),
    (error) => error.code === 'simulated_adventurer_clock_regressed',
  );
});
