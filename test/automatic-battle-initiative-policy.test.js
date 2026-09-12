import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTOMATIC_BATTLE_INITIATIVE_RULES,
  normalizeBattleSpeed,
  selectActorBySpeed,
  speedInitiativeState,
} from '../src/domain/AutomaticBattleInitiativePolicy.js';
import { AutomaticBattleSimulator } from '../src/domain/AutomaticBattleSimulator.js';

test('equal Speed alternates actions deterministically in combatant order', () => {
  const combatants = [
    { id: 'hero', speed: 10 },
    { id: 'wolf', speed: 10 },
  ];
  const turns = [];
  for (let turnNumber = 1; turnNumber <= 6; turnNumber += 1) {
    const actorId = selectActorBySpeed({ combatants, turns });
    turns.push({ turnNumber, actorId });
  }
  assert.deepEqual(turns.map((turn) => turn.actorId), ['hero', 'wolf', 'hero', 'wolf', 'hero', 'wolf']);
});

test('sufficient Speed advantage grants extra actions before the slower combatant acts again', () => {
  const combatants = [
    { id: 'fast', speed: 20 },
    { id: 'slow', speed: 10 },
  ];
  const turns = [];
  for (let turnNumber = 1; turnNumber <= 6; turnNumber += 1) {
    const actorId = selectActorBySpeed({ combatants, turns });
    turns.push({ turnNumber, actorId });
  }
  assert.deepEqual(turns.map((turn) => turn.actorId), ['fast', 'fast', 'slow', 'fast', 'fast', 'slow']);
});

test('extreme Speed is capped to a bounded two-to-one action frequency', () => {
  const state = speedInitiativeState({
    combatants: [
      { id: 'extreme', speed: 9999 },
      { id: 'baseline', speed: 10 },
    ],
  });
  const extreme = state.find((entry) => entry.id === 'extreme');
  const baseline = state.find((entry) => entry.id === 'baseline');
  assert.equal(AUTOMATIC_BATTLE_INITIATIVE_RULES.maxActionFrequencyMultiplier, 2);
  assert.equal(extreme.effectiveSpeed, 20);
  assert.equal(baseline.effectiveSpeed, 10);

  const turns = [];
  for (let turnNumber = 1; turnNumber <= 9; turnNumber += 1) {
    turns.push({ turnNumber, actorId: selectActorBySpeed({ combatants: [
      { id: 'extreme', speed: 9999 },
      { id: 'baseline', speed: 10 },
    ], turns }) });
  }
  assert.equal(turns.filter((turn) => turn.actorId === 'extreme').length, 6);
  assert.equal(turns.filter((turn) => turn.actorId === 'baseline').length, 3);
});

test('moderate Speed advantage creates occasional extra actions without forcing a fixed ratio', () => {
  const combatants = [
    { id: 'quick', speed: 15 },
    { id: 'steady', speed: 10 },
  ];
  const turns = [];
  for (let turnNumber = 1; turnNumber <= 10; turnNumber += 1) {
    const actorId = selectActorBySpeed({ combatants, turns });
    turns.push({ turnNumber, actorId });
  }
  assert.deepEqual(turns.map((turn) => turn.actorId), [
    'quick', 'steady', 'quick', 'quick', 'steady', 'quick', 'steady', 'quick', 'quick', 'steady',
  ]);
});

test('Speed normalization is safe for missing, malformed, fractional, and non-positive values', () => {
  assert.equal(normalizeBattleSpeed(undefined), 1);
  assert.equal(normalizeBattleSpeed('not-a-number'), 1);
  assert.equal(normalizeBattleSpeed(0), 1);
  assert.equal(normalizeBattleSpeed(-8), 1);
  assert.equal(normalizeBattleSpeed(12.9), 12);
});

test('AutomaticBattleSimulator uses Speed initiative by default while preserving custom selector injection', () => {
  const simulator = new AutomaticBattleSimulator({
    resolveAction: () => ({ targetDamage: 1 }),
    maxTurns: 6,
  });
  const result = simulator.simulate({
    combatants: [
      { id: 'fast', hp: 20, maxHp: 20, speed: 20 },
      { id: 'slow', hp: 20, maxHp: 20, speed: 10 },
    ],
  });
  assert.deepEqual(result.turns.map((turn) => turn.actorId), ['fast', 'fast', 'slow', 'fast', 'fast', 'slow']);

  const custom = new AutomaticBattleSimulator({
    resolveAction: () => ({ targetDamage: 1 }),
    selectActor: ({ turnNumber }) => (turnNumber % 2 ? 'slow' : 'fast'),
    maxTurns: 4,
  }).simulate({
    combatants: [
      { id: 'fast', hp: 20, maxHp: 20, speed: 999 },
      { id: 'slow', hp: 20, maxHp: 20, speed: 1 },
    ],
  });
  assert.deepEqual(custom.turns.map((turn) => turn.actorId), ['slow', 'fast', 'slow', 'fast']);
});
