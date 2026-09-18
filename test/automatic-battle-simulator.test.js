import test from 'node:test';
import assert from 'node:assert/strict';
import { createSparseBossDecisionPolicy } from '../src/domain/AutomaticBattleDecisionPolicy.js';
import { AutomaticBattleSimulator, simulateAutomaticBattle } from '../src/domain/AutomaticBattleSimulator.js';

function fixedDamagePolicy({ actor }) {
  return {
    targetDamage: actor.damage,
    metadata: { kind: 'basic-attack' },
  };
}

test('automatic battle owns HP mutation, turn history, and terminal victory', () => {
  const original = [
    { id: 'hero', hp: 12, maxHp: 12, damage: 4 },
    { id: 'wolf', hp: 7, maxHp: 7, damage: 2 },
  ];

  const result = simulateAutomaticBattle(
    { resolveAction: fixedDamagePolicy },
    { combatants: original, context: { activity: 'hunt' } },
  );

  assert.equal(result.outcome, 'victory');
  assert.equal(result.winnerId, 'hero');
  assert.equal(result.loserId, 'wolf');
  assert.equal(result.context.activity, 'hunt');
  assert.deepEqual(result.turns.map((turn) => [turn.actorId, turn.targetId, turn.targetDamage]), [
    ['hero', 'wolf', 4],
    ['wolf', 'hero', 2],
    ['hero', 'wolf', 4],
  ]);
  assert.equal(result.combatants.find((entry) => entry.id === 'hero').hp, 10);
  assert.equal(result.combatants.find((entry) => entry.id === 'wolf').hp, 0);

  assert.equal(original[0].hp, 12, 'simulation must not mutate caller-owned combatant state');
  assert.equal(original[1].hp, 7, 'simulation must not mutate caller-owned combatant state');
});

test('one simulator contract is activity-agnostic for Hunt, Adventure, Duel, and boss phases', () => {
  for (const activity of ['hunt', 'adventure', 'duel', 'boss-phase']) {
    const result = simulateAutomaticBattle(
      { resolveAction: () => ({ targetDamage: 5 }) },
      {
        combatants: [
          { id: `${activity}-a`, hp: 10, maxHp: 10 },
          { id: `${activity}-b`, hp: 5, maxHp: 5 },
        ],
        context: { activity },
      },
    );

    assert.equal(result.outcome, 'victory');
    assert.equal(result.winnerId, `${activity}-a`);
    assert.equal(result.context.activity, activity);
  }
});

test('boss-compatible phase policy can pause the automatic loop at a domain-owned decision point', () => {
  const simulator = new AutomaticBattleSimulator({
    resolveAction: () => ({ targetDamage: 2 }),
    shouldStop: ({ turnNumber }) => (turnNumber === 2 ? 'decision-point' : null),
  });

  const result = simulator.simulate({
    combatants: [
      { id: 'party', hp: 20, maxHp: 20 },
      { id: 'boss', hp: 20, maxHp: 20 },
    ],
    context: { activity: 'boss-phase' },
  });

  assert.equal(result.outcome, 'paused');
  assert.equal(result.stopReason, 'decision-point');
  assert.equal(result.pendingDecision, null);
  assert.equal(result.winnerId, null);
  assert.equal(result.turns.length, 2);
});

test('structured boss decision pauses can resume without resetting battle history or initiative', () => {
  const simulator = new AutomaticBattleSimulator({
    resolveAction: ({ actor }) => ({ targetDamage: actor.id === 'party' ? 4 : 2 }),
    shouldStop: createSparseBossDecisionPolicy({
      bossId: 'boss',
      decisions: [
        {
          id: 'brace',
          scope: 'party',
          prompt: 'The boss is charging. Choose the party response.',
          actions: ['continue', 'heal', 'coordinate'],
          afterTurn: 2,
        },
      ],
    }),
    maxTurns: 10,
  });

  const paused = simulator.simulate({
    combatants: [
      { id: 'party', hp: 20, maxHp: 20, speed: 10 },
      { id: 'boss', hp: 10, maxHp: 10, speed: 10 },
    ],
    context: { activity: 'boss-phase' },
  });

  assert.equal(paused.outcome, 'paused');
  assert.equal(paused.stopReason, 'boss-decision');
  assert.equal(paused.pendingDecision.id, 'brace');
  assert.equal(paused.pendingDecision.scope, 'party');
  assert.deepEqual(paused.turns.map((turn) => turn.actorId), ['party', 'boss']);

  const resumed = simulator.simulate({
    combatants: paused.combatants,
    priorTurns: paused.turns,
    context: { activity: 'boss-phase', resolvedDecisionIds: ['brace'] },
  });

  assert.equal(resumed.outcome, 'victory');
  assert.equal(resumed.winnerId, 'party');
  assert.equal(resumed.pendingDecision, null);
  assert.deepEqual(resumed.turns.map((turn) => turn.turnNumber), [1, 2, 3, 4, 5]);
  assert.deepEqual(resumed.turns.map((turn) => turn.actorId), ['party', 'boss', 'party', 'boss', 'party']);
  assert.equal(resumed.combatants.find((entry) => entry.id === 'party').hp, 16);
});

test('continuation rejects discontinuous prior turn history', () => {
  const simulator = new AutomaticBattleSimulator({ resolveAction: () => ({ targetDamage: 1 }) });
  assert.throws(() => simulator.simulate({
    combatants: [
      { id: 'a', hp: 5, maxHp: 5 },
      { id: 'b', hp: 5, maxHp: 5 },
    ],
    priorTurns: [{ turnNumber: 2, actorId: 'a' }],
  }), /priorTurns must be contiguous/);
});

test('turn policy is replaceable without moving battle state ownership out of the simulator', () => {
  const simulator = new AutomaticBattleSimulator({
    resolveAction: ({ actor }) => ({ targetDamage: actor.id === 'fast' ? 3 : 1 }),
    selectActor: ({ turnNumber }) => (turnNumber <= 2 ? 'fast' : 'slow'),
    maxTurns: 4,
  });

  const result = simulator.simulate({
    combatants: [
      { id: 'fast', hp: 5, maxHp: 5 },
      { id: 'slow', hp: 5, maxHp: 5 },
    ],
  });

  assert.equal(result.outcome, 'victory');
  assert.equal(result.winnerId, 'fast');
  assert.deepEqual(result.turns.map((turn) => turn.actorId), ['fast', 'fast']);
});

test('max-turn bound prevents a non-progressing policy from looping forever', () => {
  const result = simulateAutomaticBattle(
    { resolveAction: () => ({ targetDamage: 0 }), maxTurns: 3 },
    {
      combatants: [
        { id: 'a', hp: 5, maxHp: 5 },
        { id: 'b', hp: 5, maxHp: 5 },
      ],
    },
  );

  assert.equal(result.outcome, 'draw');
  assert.equal(result.stopReason, 'max-turns');
  assert.equal(result.turns.length, 3);
});

test('one shared simulator resolves every 1-to-3 party and enemy collection size', () => {
  for (let playerCount = 1; playerCount <= 3; playerCount += 1) {
    for (let enemyCount = 1; enemyCount <= 3; enemyCount += 1) {
      const result = simulateAutomaticBattle(
        { resolveAction: () => ({ targetDamage: 1 }) },
        {
          players: Array.from({ length: playerCount }, (_, index) => ({
            id: `player-${playerCount}-${index}`,
            hp: 20,
            maxHp: 20,
            speed: 10,
          })),
          enemies: Array.from({ length: enemyCount }, (_, index) => ({
            id: `enemy-${enemyCount}-${index}`,
            hp: 1,
            maxHp: 1,
            speed: 1,
          })),
          context: { activity: 'party-preview', playerCount, enemyCount },
        },
      );

      assert.equal(result.outcome, 'victory');
      assert.equal(result.players.length, playerCount);
      assert.equal(result.enemies.length, enemyCount);
      assert.equal(result.winnerTeam, 'players');
      assert.equal(result.winnerIds.length, playerCount);
      assert.equal(result.loserIds.length, enemyCount);
    }
  }
});

test('automatic teams retarget a defeated target deterministically and never let defeated actors act', () => {
  const result = simulateAutomaticBattle(
    {
      selectTarget: () => 'enemy-a',
      resolveAction: ({ actor }) => ({ targetDamage: actor.id === 'player-a' ? 2 : 0 }),
    },
    {
      players: [
        { id: 'player-a', hp: 20, maxHp: 20, speed: 10 },
        { id: 'player-b', hp: 20, maxHp: 20, speed: 9 },
      ],
      enemies: [
        { id: 'enemy-a', hp: 1, maxHp: 1, speed: 1 },
        { id: 'enemy-b', hp: 1, maxHp: 1, speed: 1 },
      ],
    },
  );

  assert.equal(result.outcome, 'victory');
  const targetIds = result.turns.filter((turn) => turn.targetId).map((turn) => turn.targetId);
  assert.deepEqual([...new Set(targetIds)], ['enemy-a', 'enemy-b']);
  assert.ok(targetIds.slice(1).every((targetId) => targetId === 'enemy-b'));
  assert.ok(result.events.some((event) => event.type === 'TargetRetargeted' && event.targetId === 'enemy-b'));
  assert.ok(result.turns.every((turn) => !['enemy-a', 'enemy-b'].includes(turn.actorId)));
});

test('Mana thresholds auto-cast the first ready skill and expose authoritative skill events', () => {
  const result = simulateAutomaticBattle(
    {
      resolveAction: ({ actionType }) => ({ targetDamage: actionType === 'skill' ? 4 : 1 }),
    },
    {
      players: [{
        id: 'bard',
        hp: 20,
        maxHp: 20,
        speed: 10,
        mana: 90,
        maxMana: 100,
        manaGain: 10,
        skills: [{ id: 'threadsong', name: 'Threadsong', manaCost: 100 }],
      }],
      enemies: [{ id: 'toad', hp: 20, maxHp: 20, speed: 1 }],
    },
  );

  assert.equal(result.outcome, 'victory');
  assert.ok(result.events.some((event) => event.type === 'SkillReady' && event.combatantId === 'bard'));
  assert.ok(result.events.some((event) => event.type === 'SkillCast' && event.skillId === 'threadsong'));
  assert.equal(result.turns.find((turn) => turn.metadata.actionType === 'skill').actorManaAfter, 0);
  assert.ok(result.events.some((event) => event.type === 'ManaChanged' && event.reason === 'skill-cast'));
});
