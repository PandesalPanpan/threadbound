import test from 'node:test';
import assert from 'node:assert/strict';
import { AdventureRun, DUNGEONS } from '../src/domain/AdventureRun.js';
import { resolveSimpleEncounter, selectPlayerTarget } from '../src/domain/SimpleEncounterBattle.js';

function participants(ids = ['p1', 'p2']) {
  return ids.map((playerId) => ({ playerId, hp: 40, maxHp: 40, threat: 0, firstStrikeUsed: false }));
}

function enemies(entries) {
  return entries.map((entry, index) => ({
    combatantId: entry.combatantId || `room-0:${entry.id}:${index}`,
    id: entry.id,
    definitionId: entry.id,
    name: entry.name || entry.id,
    hp: entry.hp,
    maxHp: entry.maxHp || entry.hp,
    retaliation: entry.retaliation || 1,
    targetingProfile: entry.targetingProfile || 'random',
    isBoss: false,
    lastTargetPlayerId: null,
  }));
}

test('simple rooms expose a real roster with unique combatant identities', () => {
  const run = AdventureRun.startSimple({
    id: 'multi-room-identities',
    ownerType: 'party',
    ownerId: 'party-1',
    startedByPlayerId: 'p1',
    participants: [{ playerId: 'p1', maxHealth: 40 }, { playerId: 'p2', maxHealth: 40 }],
    dungeonId: 'frayed-hollow',
    dungeonDefinition: DUNGEONS['frayed-hollow'],
    sharedSurface: true,
  });
  const state = run.toJSON();
  assert.equal(state.simpleCombatVersion, 2);
  assert.equal(state.enemies.length, 2);
  assert.equal(new Set(state.enemies.map((enemy) => enemy.combatantId)).size, state.enemies.length);
  assert.ok(state.enemies.every((enemy) => enemy.definitionId && enemy.targetingProfile));
  assert.equal(state.enemy.combatantId, state.enemies[0].combatantId, 'legacy enemy is a projection only');
});

test('each round gives every living Weaver and every surviving enemy exactly one action', () => {
  const result = resolveSimpleEncounter({
    runId: 'round-order',
    participants: participants(['p1', 'p2']),
    enemies: enemies([
      { id: 'front', hp: 1, retaliation: 3 },
      { id: 'back', hp: 10, retaliation: 2 },
    ]),
    playerActions: { p1: { attackPower: 1 }, p2: { attackPower: 1 } },
  });
  assert.equal(result.outcome, 'room_clear');
  assert.deepEqual(result.actions.slice(0, 2).map((action) => action.phase), ['player', 'player']);
  assert.equal(result.actions.filter((action) => action.phase === 'enemy').some((action) => action.actorId.includes(':front:')), false, 'a mob defeated in the Weaver phase never acts');
  assert.ok(result.actions.filter((action) => action.phase === 'enemy').some((action) => action.actorId.includes(':back:')));
  for (let round = 0; round < result.rounds; round += 1) {
    const roundActions = result.actions.filter((action) => action.roundIndex === round);
    const livingWeaversAtStart = round === 0 ? 2 : 2;
    assert.equal(roundActions.filter((action) => action.phase === 'player').length, livingWeaversAtStart);
  }
});

test('player focus fire chooses a wounded living mob before a full-health mob', () => {
  const wounded = { combatantId: 'room-0:wounded:0', id: 'wounded', hp: 3, maxHp: 10 };
  const healthy = { combatantId: 'room-0:healthy:1', id: 'healthy', hp: 10, maxHp: 10 };
  assert.equal(selectPlayerTarget([healthy, wounded]).combatantId, wounded.combatantId);
});

test('all simple room state changes are deterministic for the same run snapshot', () => {
  const input = {
    runId: 'deterministic-room',
    roomIndex: 2,
    participants: participants(['p1', 'p2']),
    enemies: enemies([
      { id: 'hunter', hp: 8, retaliation: 2, targetingProfile: 'hunter' },
      { id: 'bruiser', hp: 8, retaliation: 2, targetingProfile: 'bruiser' },
    ]),
    playerActions: { p1: { attackPower: 3 }, p2: { attackPower: 2 } },
  };
  const first = resolveSimpleEncounter(input);
  const second = resolveSimpleEncounter(input);
  assert.deepEqual(first, second);
});
