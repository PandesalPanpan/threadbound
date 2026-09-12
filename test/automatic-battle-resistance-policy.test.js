import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTOMATIC_BATTLE_RESISTANCE_LEVELS,
  AUTOMATIC_BATTLE_RESISTANCE_RULES,
  normalizeAutomaticBattleResistances,
  resistanceLevelForEffect,
  resolveAutomaticBattleEffectResistance,
} from '../src/domain/AutomaticBattleResistancePolicy.js';
import { simulateAutomaticBattle } from '../src/domain/AutomaticBattleSimulator.js';

test('resistance vocabulary is constrained to normal, resistant, high-resistant, and immune', () => {
  assert.deepEqual(AUTOMATIC_BATTLE_RESISTANCE_LEVELS, [
    'normal',
    'resistant',
    'high-resistant',
    'immune',
  ]);

  assert.deepEqual(normalizeAutomaticBattleResistances({
    fire: 'resistant',
    poison: 'high-resistant',
    ice: 'immune',
    psychic: 'normal',
  }), {
    fire: 'resistant',
    poison: 'high-resistant',
    ice: 'immune',
  });

  assert.throws(
    () => normalizeAutomaticBattleResistances({ bleed: 'resistant' }),
    /Unsupported automatic battle resistance effect type/,
  );
  assert.throws(
    () => normalizeAutomaticBattleResistances({ fire: 'reflect' }),
    /Unsupported automatic battle resistance level/,
  );
});

test('normal targets receive the validated effect unchanged', () => {
  const result = resolveAutomaticBattleEffectResistance({
    target: {},
    effect: { type: 'fire', potency: 8, remainingTurns: 3 },
  });

  assert.equal(result.applied, true);
  assert.equal(result.blocked, false);
  assert.equal(result.resistanceLevel, 'normal');
  assert.equal(result.potencyMultiplier, AUTOMATIC_BATTLE_RESISTANCE_RULES.normalMultiplier);
  assert.deepEqual(result.effect, { type: 'fire', potency: 8, remainingTurns: 3 });
});

test('resistance and high resistance deterministically reduce effect potency', () => {
  const resistant = resolveAutomaticBattleEffectResistance({
    target: { resistances: { poison: 'resistant' } },
    effect: { type: 'poison', potency: 8, remainingTurns: 4, stacks: 2 },
  });
  assert.equal(resistant.resistanceLevel, 'resistant');
  assert.equal(resistant.effect.potency, 4);
  assert.equal(resistant.effect.remainingTurns, 4);
  assert.equal(resistant.effect.stacks, 2);

  const highResistant = resolveAutomaticBattleEffectResistance({
    target: { resistances: { psychic: 'high-resistant' } },
    effect: { type: 'psychic', potency: 8, remainingTurns: 4 },
  });
  assert.equal(highResistant.resistanceLevel, 'high-resistant');
  assert.equal(highResistant.effect.potency, 2);

  const minimum = resolveAutomaticBattleEffectResistance({
    target: { resistances: { ice: 'high-resistant' } },
    effect: { type: 'ice', potency: 1, remainingTurns: 2 },
  });
  assert.equal(minimum.effect.potency, 1, 'non-immune resistance should not silently become immunity');
});

test('immunity blocks an incoming effect entirely', () => {
  const result = resolveAutomaticBattleEffectResistance({
    target: { resistances: { fire: 'immune' } },
    effect: { type: 'fire', potency: 10, remainingTurns: 5 },
  });

  assert.equal(result.applied, false);
  assert.equal(result.blocked, true);
  assert.equal(result.resistanceLevel, 'immune');
  assert.equal(result.effect, null);
  assert.equal(result.potencyMultiplier, 0);
  assert.equal(resistanceLevelForEffect({ resistances: { fire: 'immune' } }, 'fire'), 'immune');
});

test('automatic simulator applies target effects through resistance policy and records inspectable outcomes', () => {
  const result = simulateAutomaticBattle(
    {
      maxTurns: 2,
      resolveAction: ({ actor }) => ({
        targetDamage: 0,
        targetEffects: actor.id === 'caster'
          ? [
              { type: 'fire', potency: 8, remainingTurns: 3 },
              { type: 'ice', potency: 8, remainingTurns: 3 },
            ]
          : [],
      }),
    },
    {
      combatants: [
        { id: 'caster', hp: 20, maxHp: 20, speed: 10 },
        {
          id: 'target',
          hp: 20,
          maxHp: 20,
          speed: 10,
          resistances: { fire: 'resistant', ice: 'immune' },
        },
      ],
    },
  );

  const firstTurn = result.turns[0];
  assert.deepEqual(firstTurn.metadata.effectApplications, [
    {
      type: 'fire',
      resistanceLevel: 'resistant',
      applied: true,
      blocked: false,
      incomingPotency: 8,
      appliedPotency: 4,
      potencyMultiplier: 0.5,
    },
    {
      type: 'ice',
      resistanceLevel: 'immune',
      applied: false,
      blocked: true,
      incomingPotency: 8,
      appliedPotency: 0,
      potencyMultiplier: 0,
    },
  ]);

  const target = result.combatants.find((combatant) => combatant.id === 'target');
  assert.deepEqual(target.effects, [{ type: 'fire', potency: 4, remainingTurns: 2 }]);
  assert.deepEqual(target.resistances, { fire: 'resistant', ice: 'immune' });
  assert.equal(result.turns[1].effectDamage, 4, 'resisted Fire should tick at reduced authoritative potency');
});

test('simulator rejects unvalidated resistance data at the authoritative boundary', () => {
  assert.throws(() => simulateAutomaticBattle(
    { resolveAction: () => ({ targetDamage: 1 }) },
    {
      combatants: [
        { id: 'a', hp: 5, maxHp: 5, resistances: { fire: 'reflect' } },
        { id: 'b', hp: 5, maxHp: 5 },
      ],
    },
  ), /Unsupported automatic battle resistance level/);
});
