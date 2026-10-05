import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARENA_COMBAT_RULES,
  simulateArenaCombat,
} from '../src/domain/ArenaCombatEngine.js';
import { arenaSpeedProfile, defaultArenaFormation } from '../src/domain/ArenaCombatPolicy.js';

function roster() {
  return {
    players: [{
      id: 'player-1', name: 'Ari', hp: 42, maxHp: 42, attack: 12, defense: 2,
      speed: 10, mana: 30, maxMana: 100, critChance: 0.1, skills: ['thornwake'],
      equipment: { weapon: { id: 'weapon-1', effectCode: 'ember_edge' } },
    }],
    enemies: [{
      id: 'enemy-1', name: 'Burrower', hp: 34, maxHp: 34, attack: 8, defense: 1,
      speed: 8, targetingProfile: 'hunter', visualAssetId: 'mob.burrower.v1',
    }],
  };
}

test('arena Speed maps to bounded, independent action and movement clocks', () => {
  assert.deepEqual(arenaSpeedProfile(10), {
    sourceSpeed: 10,
    effectiveAttackSpeed: 10,
    attacksPerSecond: 1,
    tilesPerSecond: 1.65,
  });
  assert.equal(arenaSpeedProfile(100, { slowestSpeed: 10 }).attacksPerSecond, 2);
  assert.equal(arenaSpeedProfile(100).attacksPerSecond, ARENA_COMBAT_RULES.maxAttackSpeed);
  assert.equal(arenaSpeedProfile(100).tilesPerSecond, ARENA_COMBAT_RULES.maxMovementSpeed);
  assert.throws(() => arenaSpeedProfile(0), /Speed must be an integer/);
});

test('arena combat uses the supplied roster and produces deterministic replay with immutable start state', () => {
  const input = roster();
  const before = structuredClone(input);
  const options = { ...input, context: { activity: 'hunt', battleId: 'hunt-42' }, durationMs: 12_000 };
  const first = simulateArenaCombat(options);
  const second = simulateArenaCombat(options);

  assert.deepEqual(input, before, 'domain simulation must not mutate caller-owned participants');
  assert.equal(first.outcome, 'victory');
  assert.equal(first.replay.version, ARENA_COMBAT_RULES.version);
  assert.deepEqual(first.replay, second.replay);
  assert.deepEqual(first.replay.combatants.map(({ id, hp, x, y }) => ({ id, hp, x, y })), [
    { id: 'player-1', hp: 42, x: 3, y: 5 },
    { id: 'enemy-1', hp: 34, x: 3, y: 2 },
  ]);
  assert.ok(first.replay.finalCombatants.find((unit) => unit.id === 'enemy-1').hp < 34);
  assert.ok(first.replay.events.some((event) => event.kind === 'move'));
  assert.ok(first.replay.events.some((event) => event.kind === 'action' && event.damageEvents.length));
  assert.equal(first.replay.finalCombatants.find((unit) => unit.id === 'player-1').team, 'players');
});

test('formation is stable by role and keeps real units on their side', () => {
  const players = [
    { id: 'support', combatRole: 'support' },
    { id: 'guard', combatRole: 'frontline' },
    { id: 'archer', weaponFamily: 'bow' },
  ];
  const enemies = [
    { id: 'boss', combatRole: 'frontline' },
    { id: 'add', combatRole: 'ranged', targetingProfile: 'tactical' },
  ];
  const formation = defaultArenaFormation(players, enemies);
  assert.ok(formation.guard.y < formation.archer.y);
  assert.ok(formation.archer.y < formation.support.y);
  assert.ok(formation.boss.y > formation.add.y);
  const battle = simulateArenaCombat({
    players: players.map((unit) => ({ ...unit, hp: 20, maxHp: 20, attack: 1, speed: 10 })),
    enemies: enemies.map((unit) => ({ ...unit, hp: 20, maxHp: 20, attack: 1, speed: 10 })),
    durationMs: 50,
  });
  assert.equal(battle.outcome, 'draw');
  assert.equal(battle.frames, undefined);
});

test('arena validates rosters, placements, stats, context, and duration before simulation', () => {
  const input = roster();
  assert.throws(() => simulateArenaCombat({ ...input, players: [] }), /requires 1 to 4 players/);
  assert.throws(() => simulateArenaCombat({ ...input, durationMs: 51 }), /multiple of 50 ms/);
  assert.throws(() => simulateArenaCombat({
    ...input,
    placements: { 'player-1': { x: 3, y: 2 } },
  }), /must be placed on its side/);
  assert.throws(() => simulateArenaCombat({
    ...input,
    players: [{ ...input.players[0], mana: 101 }],
  }), /Mana cannot exceed maxMana/);
  assert.throws(() => simulateArenaCombat({ ...input, context: { runId: 1n } }), /JSON-safe/);
});

test('arena lab frames are opt-in and stop at the recorded duration', () => {
  const input = roster();
  const result = simulateArenaCombat({ ...input, durationMs: 100, includeFrames: true });
  assert.equal(result.outcome, 'draw');
  assert.equal(result.durationMs, 100);
  assert.equal(result.frames.length, 3);
  assert.deepEqual(result.frames.map((frame) => frame.timeMs), [0, 50, 100]);
});
