import test from 'node:test';
import assert from 'node:assert/strict';
import { projectAutomaticBattleResult } from '../src/application/AutomaticBattleReadModel.js';
import { createAutomaticBasicAttackResolver } from '../src/domain/AutomaticBattleActionPolicy.js';
import { simulateAutomaticBattle } from '../src/domain/AutomaticBattleSimulator.js';

test('projects a concise viewer-relative main receipt without flooding it with turns', () => {
  const result = simulateAutomaticBattle(
    { resolveAction: createAutomaticBasicAttackResolver({ random: () => 0.99 }) },
    {
      combatants: [
        { id: 'hero', name: 'Mira', hp: 20, maxHp: 20, attack: 7, defense: 1, speed: 10, critChance: 0 },
        { id: 'wolf', name: 'Forest Wolf', hp: 9, maxHp: 9, attack: 4, defense: 1, speed: 10, critChance: 0 },
      ],
      context: { activity: 'hunt' },
    },
  );

  const model = projectAutomaticBattleResult(result, { viewerId: 'hero' });

  assert.equal(model.receipt.outcomeLabel, 'Victory');
  assert.equal(model.receipt.headline, 'Victory · Defeated Forest Wolf');
  assert.match(model.receipt.text, /^Victory · Defeated Forest Wolf · HP 20 → 17\/20 · 3 turns$/);
  assert.equal(model.receipt.turnCount, 3);
  assert.equal(model.receipt.detailsAvailable, true);
  assert.equal(model.details.turns.length, 3);
  assert.equal(model.receipt.text.includes('critically hit'), false, 'turn narration stays out of the concise receipt');
});

test('detailed turn read model exposes crits, Speed extra actions, effects, and resistance outcomes', () => {
  const result = {
    outcome: 'victory',
    winnerId: 'hero',
    loserId: 'slime',
    stopReason: null,
    combatants: [
      { id: 'hero', name: 'Mira', hp: 13, maxHp: 20 },
      { id: 'slime', name: 'Ember Slime', hp: 0, maxHp: 18 },
    ],
    turns: [
      {
        turnNumber: 1,
        actorId: 'hero',
        targetId: 'slime',
        targetDamage: 6,
        selfHealing: 0,
        effectDamage: 0,
        actorHpBefore: 20,
        actorHpAfterEffects: 20,
        actorHpAfter: 20,
        targetHpBefore: 18,
        targetHpAfter: 12,
        metadata: {
          critical: true,
          effectEvents: [],
          effectApplications: [
            { type: 'fire', resistanceLevel: 'resistant', applied: true, blocked: false, incomingPotency: 2, appliedPotency: 1 },
          ],
        },
      },
      {
        turnNumber: 2,
        actorId: 'hero',
        targetId: 'slime',
        targetDamage: 4,
        selfHealing: 0,
        effectDamage: 0,
        actorHpBefore: 20,
        actorHpAfterEffects: 20,
        actorHpAfter: 20,
        targetHpBefore: 12,
        targetHpAfter: 8,
        metadata: {
          critical: false,
          effectEvents: [],
          effectApplications: [
            { type: 'psychic', resistanceLevel: 'immune', applied: false, blocked: true, incomingPotency: 2, appliedPotency: 0 },
          ],
        },
      },
      {
        turnNumber: 3,
        actorId: 'slime',
        targetId: 'hero',
        targetDamage: 7,
        selfHealing: 0,
        effectDamage: 1,
        actorHpBefore: 8,
        actorHpAfterEffects: 7,
        actorHpAfter: 7,
        targetHpBefore: 20,
        targetHpAfter: 13,
        metadata: {
          critical: false,
          effectEvents: [
            { type: 'fire', damage: 1 },
            { type: 'fire', expired: true },
          ],
          effectApplications: [],
        },
      },
      {
        turnNumber: 4,
        actorId: 'hero',
        targetId: 'slime',
        targetDamage: 8,
        selfHealing: 0,
        effectDamage: 0,
        actorHpBefore: 13,
        actorHpAfterEffects: 13,
        actorHpAfter: 13,
        targetHpBefore: 7,
        targetHpAfter: 0,
        metadata: { critical: false, effectEvents: [], effectApplications: [] },
      },
    ],
  };

  const model = projectAutomaticBattleResult(result, { viewerId: 'hero' });

  assert.equal(model.details.turns[0].critical, true);
  assert.match(model.details.turns[0].summary, /critically hit Ember Slime for 6 damage/);
  assert.deepEqual(model.details.turns[0].events[0], {
    kind: 'effect-applied',
    effect: 'fire',
    resistanceLevel: 'resistant',
    incomingPotency: 2,
    appliedPotency: 1,
    blocked: false,
  });

  assert.equal(model.details.turns[1].consecutiveAction, true);
  assert.match(model.details.turns[1].summary, /extra action from Speed/);
  assert.equal(model.details.turns[1].events[0].kind, 'effect-blocked');
  assert.match(model.details.turns[1].summary, /resisted psychic \(immune\)/);

  assert.equal(model.details.turns[2].effectDamage, 1);
  assert.deepEqual(model.details.turns[2].events, [
    { kind: 'effect-damage', effect: 'fire', damage: 1, stacks: null },
    { kind: 'effect-expired', effect: 'fire' },
  ]);
  assert.equal(model.receipt.hp.find((entry) => entry.id === 'hero').initialHp, 20);
  assert.equal(model.receipt.hp.find((entry) => entry.id === 'hero').finalHp, 13);
});

test('effect-only defeat remains representable when a defeated actor never receives a target action', () => {
  const model = projectAutomaticBattleResult({
    outcome: 'victory',
    winnerId: 'mage',
    loserId: 'bandit',
    combatants: [
      { id: 'mage', name: 'Mage', hp: 10, maxHp: 10 },
      { id: 'bandit', name: 'Bandit', hp: 0, maxHp: 5 },
    ],
    turns: [
      {
        turnNumber: 1,
        actorId: 'bandit',
        targetId: null,
        targetDamage: 0,
        selfHealing: 0,
        effectDamage: 5,
        actorHpBefore: 5,
        actorHpAfterEffects: 0,
        actorHpAfter: 0,
        targetHpBefore: null,
        targetHpAfter: null,
        metadata: { kind: 'effect-tick', effectEvents: [{ type: 'poison', damage: 5, stacks: 5 }], effectApplications: [] },
      },
    ],
  }, { viewerId: 'mage' });

  assert.equal(model.receipt.text, 'Victory · Defeated Bandit · HP 10 → 10/10 · 1 turn');
  assert.equal(model.details.turns[0].target, null);
  assert.match(model.details.turns[0].summary, /Bandit took 5 effect damage/);
  assert.match(model.details.turns[0].summary, /defeated by an effect/);
});

test('read model rejects incomplete battle results instead of inventing presentation state', () => {
  assert.throws(() => projectAutomaticBattleResult(null), /requires a battle result/);
  assert.throws(() => projectAutomaticBattleResult({ combatants: [] }), /requires turns/);
  assert.throws(() => projectAutomaticBattleResult({ turns: [] }), /requires combatants/);
});
