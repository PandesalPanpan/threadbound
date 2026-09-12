import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTOMATIC_BATTLE_EFFECT_RULES,
  AUTOMATIC_BATTLE_EFFECT_TYPES,
  isAutomaticBattleEffectType,
  mergeAutomaticBattleEffect,
  normalizeAutomaticBattleEffect,
  projectCombatantWithAutomaticEffects,
  resolveAutomaticEffectTurnStart,
} from '../src/domain/AutomaticBattleEffectPolicy.js';
import { resolveAutomaticBasicAttack } from '../src/domain/AutomaticBattleActionPolicy.js';
import { speedInitiativeState } from '../src/domain/AutomaticBattleInitiativePolicy.js';
import { simulateAutomaticBattle } from '../src/domain/AutomaticBattleSimulator.js';

test('effect vocabulary is exactly Fire, Poison, Ice, and Psychic', () => {
  assert.deepEqual(AUTOMATIC_BATTLE_EFFECT_TYPES, ['fire', 'poison', 'ice', 'psychic']);
  for (const type of AUTOMATIC_BATTLE_EFFECT_TYPES) assert.equal(isAutomaticBattleEffectType(type), true);
  assert.equal(isAutomaticBattleEffectType('bleed'), false);
  assert.throws(() => normalizeAutomaticBattleEffect({ type: 'arbitrary-script' }), /Unsupported automatic battle effect type/);
});

test('effect data is bounded and cannot carry executable mechanics', () => {
  const effect = normalizeAutomaticBattleEffect({
    type: 'poison',
    potency: 99999,
    remainingTurns: 99999,
    stacks: 99999,
    execute: 'process.exit()',
  });

  assert.deepEqual(effect, {
    type: 'poison',
    potency: AUTOMATIC_BATTLE_EFFECT_RULES.maxPotency,
    remainingTurns: AUTOMATIC_BATTLE_EFFECT_RULES.maxDurationTurns,
    stacks: AUTOMATIC_BATTLE_EFFECT_RULES.maxPoisonStacks,
  });
  assert.equal('execute' in effect, false);
});

test('Fire deals bounded periodic damage and expires by actor turns', () => {
  const start = resolveAutomaticEffectTurnStart({
    effects: [{ type: 'fire', potency: 3, remainingTurns: 2 }],
  });

  assert.equal(start.periodicDamage, 3);
  assert.deepEqual(start.events, [{ type: 'fire', damage: 3 }]);
  assert.deepEqual(start.remainingEffects, [{ type: 'fire', potency: 3, remainingTurns: 1 }]);
});

test('Poison stacks pressure with an explicit bounded stack cap', () => {
  const merged = mergeAutomaticBattleEffect(
    [{ type: 'poison', potency: 2, remainingTurns: 3, stacks: 4 }],
    { type: 'poison', potency: 2, remainingTurns: 2, stacks: 4 },
  );
  assert.equal(merged[0].stacks, AUTOMATIC_BATTLE_EFFECT_RULES.maxPoisonStacks);

  const start = resolveAutomaticEffectTurnStart({ effects: merged });
  assert.equal(start.periodicDamage, 2 * AUTOMATIC_BATTLE_EFFECT_RULES.maxPoisonStacks);
  assert.deepEqual(start.events, [{ type: 'poison', damage: 10, stacks: 5 }]);
});

test('Ice reduces effective Speed and therefore initiative without rewriting raw Speed', () => {
  const combatants = [
    { id: 'iced', speed: 12, effects: [{ type: 'ice', potency: 7, remainingTurns: 2 }] },
    { id: 'steady', speed: 8 },
  ];

  const projected = projectCombatantWithAutomaticEffects(combatants[0]);
  assert.equal(projected.speed, 5);
  assert.equal(combatants[0].speed, 12);

  const initiative = speedInitiativeState({ combatants });
  assert.equal(initiative.find((entry) => entry.id === 'iced').speed, 5);
  assert.equal(initiative.find((entry) => entry.id === 'steady').speed, 8);
});

test('Psychic reduces offensive and defensive effectiveness with safe floors', () => {
  const projected = projectCombatantWithAutomaticEffects({
    id: 'hero',
    attack: 10,
    defense: 6,
    speed: 10,
    effects: [{ type: 'psychic', potency: 4, remainingTurns: 2 }],
  });
  assert.equal(projected.attack, 6);
  assert.equal(projected.defense, 2);

  const action = resolveAutomaticBasicAttack({
    actor: { attack: 10, critChance: 0, effects: [{ type: 'psychic', potency: 4, remainingTurns: 2 }] },
    target: { defense: 3 },
    random: () => 0.5,
  });
  assert.equal(action.metadata.attack, 6);
  assert.equal(action.targetDamage, 3);
});

test('automatic simulator resolves periodic effects inside the authoritative lifecycle', () => {
  const result = simulateAutomaticBattle(
    { resolveAction: () => ({ targetDamage: 1 }), maxTurns: 3 },
    {
      combatants: [
        { id: 'burning', hp: 4, maxHp: 4, speed: 10, effects: [{ type: 'fire', potency: 2, remainingTurns: 2 }] },
        { id: 'opponent', hp: 10, maxHp: 10, speed: 1 },
      ],
    },
  );

  assert.equal(result.outcome, 'victory');
  assert.equal(result.winnerId, 'opponent');
  assert.deepEqual(result.turns.map((turn) => turn.effectDamage), [2, 2]);
  assert.equal(result.turns[1].targetId, null, 'lethal Fire should end the battle before another attack resolves');
  assert.equal(result.turns[1].metadata.kind, 'effect-tick');
});
