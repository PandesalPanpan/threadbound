import test from 'node:test';
import assert from 'node:assert/strict';
import { AutomaticBattleSimulator } from '../src/domain/AutomaticBattleSimulator.js';
import {
  AUTOMATIC_BASIC_ATTACK_RULES,
  createAutomaticBasicAttackResolver,
  resolveAutomaticBasicAttack,
} from '../src/domain/AutomaticBattleActionPolicy.js';

test('canonical basic attack subtracts Defense from Attack with a one-damage floor', () => {
  const normal = resolveAutomaticBasicAttack({
    actor: { attack: 12, critChance: 0 },
    target: { defense: 5 },
    random: () => 0.9,
  });
  assert.equal(normal.targetDamage, 7);
  assert.deepEqual(normal.metadata, {
    kind: 'basic-attack',
    attack: 12,
    defense: 5,
    baseDamage: 7,
    critical: false,
    critChance: 0,
    critRoll: 0.9,
    critMultiplier: 2,
  });

  const armored = resolveAutomaticBasicAttack({
    actor: { attack: 3, critChance: 0 },
    target: { defense: 99 },
    random: () => 0.5,
  });
  assert.equal(armored.targetDamage, AUTOMATIC_BASIC_ATTACK_RULES.minimumDamage);
  assert.equal(armored.metadata.baseDamage, 1);
});

test('Crit Chance uses injected deterministic RNG and canonical multiplier', () => {
  const rolls = [0.24, 0.25];
  const resolver = createAutomaticBasicAttackResolver({ random: () => rolls.shift() });
  const actor = { attack: 10, critChance: 0.25 };
  const target = { defense: 2 };

  const critical = resolver({ actor, target });
  const normal = resolver({ actor, target });

  assert.equal(critical.metadata.critical, true);
  assert.equal(critical.targetDamage, 16);
  assert.equal(normal.metadata.critical, false);
  assert.equal(normal.targetDamage, 8);
});

test('Crit Chance is bounded to the canonical probability range', () => {
  const guaranteed = resolveAutomaticBasicAttack({
    actor: { attack: 4, critChance: 10 },
    target: { defense: 1 },
    random: () => 0.999,
  });
  const impossible = resolveAutomaticBasicAttack({
    actor: { attack: 4, critChance: -2 },
    target: { defense: 1 },
    random: () => 0,
  });

  assert.equal(guaranteed.metadata.critChance, 1);
  assert.equal(guaranteed.metadata.critical, true);
  assert.equal(impossible.metadata.critChance, 0);
  assert.equal(impossible.metadata.critical, false);
});

test('invalid RNG output fails rather than silently corrupting authoritative battle resolution', () => {
  assert.throws(
    () => resolveAutomaticBasicAttack({
      actor: { attack: 5, critChance: 0.5 },
      target: { defense: 1 },
      random: () => 1,
    }),
    /RNG must return a finite value in \[0, 1\)/,
  );
});

test('canonical action policy plugs into the shared simulator and HP remains simulator-owned', () => {
  const original = [
    { id: 'hero', hp: 20, maxHp: 20, attack: 8, defense: 2, critChance: 0 },
    { id: 'slime', hp: 9, maxHp: 9, attack: 4, defense: 3, critChance: 0 },
  ];
  const simulator = new AutomaticBattleSimulator({
    resolveAction: createAutomaticBasicAttackResolver({ random: () => 0.99 }),
  });

  const result = simulator.simulate({ combatants: original, context: { activity: 'hunt' } });

  assert.equal(result.outcome, 'victory');
  assert.equal(result.winnerId, 'hero');
  assert.deepEqual(result.turns.map((turn) => turn.targetDamage), [5, 2, 5]);
  assert.deepEqual(result.turns.map((turn) => turn.metadata.kind), ['basic-attack', 'basic-attack', 'basic-attack']);
  assert.equal(result.combatants.find((entry) => entry.id === 'hero').hp, 18);
  assert.equal(result.combatants.find((entry) => entry.id === 'slime').hp, 0);
  assert.equal(original[0].hp, 20);
  assert.equal(original[1].hp, 9);
});
