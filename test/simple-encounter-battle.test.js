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
  assert.deepEqual(state.participants.map(({ mana, maxMana }) => [mana, maxMana]), [[100, 100], [100, 100]]);
});

test('a persisted version-1 simple run hydrates and keeps its singleton combat semantics', () => {
  const original = AdventureRun.startSimple({
    id: 'legacy-singleton-run',
    ownerType: 'player',
    ownerId: 'legacy-player',
    startedByPlayerId: 'legacy-player',
    participants: [{ playerId: 'legacy-player', maxHealth: 40 }],
    dungeonId: 'frayed-hollow',
    dungeonDefinition: DUNGEONS['frayed-hollow'],
    sharedSurface: false,
  }).toJSON();
  delete original.enemies;
  delete original.simpleCombatVersion;
  delete original.enemy.combatantId;

  const hydrated = new AdventureRun(original);
  assert.equal(hydrated.toJSON().simpleCombatVersion, 1);
  assert.equal(hydrated.toJSON().enemies.length, 1);
  assert.match(hydrated.toJSON().enemies[0].combatantId, /^legacy-room-0:/);

  const beforeEnemyHp = hydrated.toJSON().enemy.hp;
  const result = hydrated.attack({ playerId: 'legacy-player', attackPower: 1, now: '2026-09-23T00:00:00.000Z' });
  assert.equal(result.simpleCombat, true);
  assert.equal(result.state.simpleCombatVersion, 1);
  assert.equal(result.state.enemies.length, 1);
  assert.ok(result.state.enemy.hp < beforeEnemyHp);
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

test('signature skills resolve against the actual four-player, three-enemy Dungeon roster', () => {
  const party = participants(['p1', 'p2', 'p3', 'p4']).map((participant) => ({
    ...participant,
    hp: 1000,
    maxHp: 1000,
    mana: 100,
    maxMana: 100,
  }));
  const foeRoster = enemies([
    { id: 'mob-a', hp: 200, retaliation: 1 },
    { id: 'mob-b', hp: 200, retaliation: 1 },
    { id: 'mob-c', hp: 200, retaliation: 1 },
  ]).map((enemy) => ({ ...enemy, hp: 200, maxHp: 200, mana: 100, skillCode: 'thornwake' }));
  const result = resolveSimpleEncounter({
    runId: 'real-roster-skills',
    participants: party,
    enemies: foeRoster,
    signatureSkills: true,
    playerActions: {
      p1: { attackPower: 10, skillCode: 'ember-burst' },
      p2: { attackPower: 10, skillCode: 'shield-break' },
      p3: { attackPower: 10, skillCode: 'blood-pact' },
      p4: { attackPower: 10, skillCode: 'mending-chorus' },
    },
  });

  assert.equal(result.participants.length, 4);
  assert.equal(result.enemies.length, 3);
  assert.deepEqual(result.participants.map((participant) => participant.playerId), ['p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(result.enemies.map((enemy) => enemy.id), ['mob-a', 'mob-b', 'mob-c']);
  const burst = result.actions.find((action) => action.actorId === 'p1' && action.skillId === 'ember-burst');
  assert.ok(burst);
  assert.equal(burst.damageEvents.length, 3, 'the allowlisted area skill hits each actual living enemy');
  assert.deepEqual(new Set(result.actions.filter((action) => action.actionType === 'skill').map((action) => action.skillId)), new Set([
    'ember-burst', 'shield-break', 'blood-pact', 'mending-chorus', 'thornwake',
  ]));
  assert.ok(result.actions.every((action) => !['p5', 'room-0:mob-d:0'].includes(action.actorId)));
});

test('an unarmed Dungeon player uses the safe default signature skill', () => {
  const result = resolveSimpleEncounter({
    runId: 'unarmed-default-skill',
    participants: [{ playerId: 'unarmed', hp: 40, maxHp: 40, mana: 100 }],
    enemies: [{ combatantId: 'room-0:foe:0', id: 'foe', name: 'Foe', hp: 100, maxHp: 100, retaliation: 1 }],
    playerActions: { unarmed: { attackPower: 5 } },
    signatureSkills: true,
  });

  assert.equal(result.actions[0].actorId, 'unarmed');
  assert.equal(result.actions[0].skillId, 'threadsong');
  assert.equal(result.actions[0].skillName, 'Threadsong');
  assert.equal(result.actions[0].manaBefore, 100);
  assert.equal(result.actions[0].manaAfter, 0);
});
