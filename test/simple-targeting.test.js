import test from 'node:test';
import assert from 'node:assert/strict';
import { selectEnemyTarget, TARGETING_PROFILES } from '../src/domain/SimpleEncounterBattle.js';

const party = [
  { playerId: 'threat', hp: 40, maxHp: 40, threat: 20 },
  { playerId: 'wounded', hp: 8, maxHp: 40, threat: 0 },
  { playerId: 'steady', hp: 30, maxHp: 40, threat: 4 },
];

function sample(profile, overrides = {}, count = 500) {
  const counts = Object.fromEntries(party.map((participant) => [participant.playerId, 0]));
  for (let index = 0; index < count; index += 1) {
    const result = selectEnemyTarget({
      enemy: { combatantId: `enemy-${profile}`, targetingProfile: profile, ...overrides },
      participants: party,
      runId: `targeting-${index}`,
      roomIndex: 1,
      roundIndex: 2,
      actionIndex: index,
      recentAttackerId: overrides.recentAttackerId || null,
    });
    counts[result.target.playerId] += 1;
  }
  return counts;
}

test('targeting profiles are constrained and deterministic', () => {
  assert.deepEqual(TARGETING_PROFILES, ['random', 'feral', 'bruiser', 'hunter', 'tactical']);
  const args = {
    enemy: { combatantId: 'enemy', targetingProfile: 'tactical' },
    participants: party,
    runId: 'stable',
    roomIndex: 1,
    roundIndex: 2,
    actionIndex: 3,
    recentAttackerId: 'steady',
  };
  assert.deepEqual(selectEnemyTarget(args), selectEnemyTarget(args));
});

test('random spreads targets while hunter strongly favors the vulnerable Weaver', () => {
  const random = sample('random');
  const hunter = sample('hunter');
  assert.ok(random.threat > 0 && random.wounded > 0 && random.steady > 0);
  assert.ok(hunter.wounded > hunter.threat);
  assert.ok(hunter.wounded > hunter.steady);
});

test('bruiser favors threat and feral responds to the recent attacker', () => {
  const bruiser = sample('bruiser');
  const feral = sample('feral', { recentAttackerId: 'steady' });
  assert.ok(bruiser.threat > bruiser.wounded);
  assert.ok(feral.steady > feral.wounded);
});

test('dead participants never receive a deterministic enemy target', () => {
  const result = selectEnemyTarget({
    enemy: { combatantId: 'enemy', targetingProfile: 'random' },
    participants: [{ playerId: 'dead', hp: 0, maxHp: 40, threat: 100 }, { playerId: 'alive', hp: 1, maxHp: 40, threat: 0 }],
    runId: 'dead-filter',
  });
  assert.equal(result.target.playerId, 'alive');
  assert.ok(result.weights.every((entry) => entry.playerId !== 'dead'));
});
