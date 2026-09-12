import test from 'node:test';
import assert from 'node:assert/strict';
import { projectAutomaticBattleResult } from '../src/application/AutomaticBattleReadModel.js';

test('paused boss decisions project one concise stream prompt plus constrained actions', () => {
  const result = {
    outcome: 'paused',
    winnerId: null,
    loserId: null,
    stopReason: 'boss-decision',
    pendingDecision: {
      id: 'brace',
      scope: 'party',
      prompt: 'The boss is charging. Choose the party response.',
      actions: [
        { id: 'continue', label: 'Continue' },
        { id: 'heal', label: 'Heal' },
        { id: 'coordinate', label: 'Coordinate' },
      ],
    },
    combatants: [
      { id: 'party', name: 'Party', hp: 18, maxHp: 20 },
      { id: 'boss', name: 'Clockwork Wyrm', hp: 12, maxHp: 20 },
    ],
    turns: [
      {
        turnNumber: 1,
        actorId: 'party',
        targetId: 'boss',
        targetDamage: 4,
        selfHealing: 0,
        effectDamage: 0,
        actorHpBefore: 20,
        actorHpAfterEffects: 20,
        actorHpAfter: 20,
        targetHpBefore: 16,
        targetHpAfter: 12,
        metadata: { effectEvents: [], effectApplications: [] },
      },
      {
        turnNumber: 2,
        actorId: 'boss',
        targetId: 'party',
        targetDamage: 2,
        selfHealing: 0,
        effectDamage: 0,
        actorHpBefore: 12,
        actorHpAfterEffects: 12,
        actorHpAfter: 12,
        targetHpBefore: 20,
        targetHpAfter: 18,
        metadata: { effectEvents: [], effectApplications: [] },
      },
    ],
  };

  const model = projectAutomaticBattleResult(result, { viewerId: 'party' });

  assert.equal(model.receipt.outcomeLabel, 'Paused');
  assert.equal(model.receipt.headline, 'Paused · The boss is charging. Choose the party response.');
  assert.match(model.receipt.text, /HP 20 → 18\/20 · 2 turns$/);
  assert.equal(model.receipt.pendingDecision.id, 'brace');
  assert.equal(model.receipt.pendingDecision.scope, 'party');
  assert.deepEqual(model.receipt.pendingDecision.actions.map((action) => action.id), ['continue', 'heal', 'coordinate']);
  assert.equal(model.details.pendingDecision, model.receipt.pendingDecision);
  assert.equal(model.details.turns.length, 2, 'turn details remain separate from the concise pause receipt');
});

test('read model rejects malformed pending decisions rather than inventing tactical actions', () => {
  assert.throws(() => projectAutomaticBattleResult({
    outcome: 'paused',
    stopReason: 'boss-decision',
    pendingDecision: { id: 'broken', scope: 'party', prompt: '', actions: [] },
    combatants: [
      { id: 'party', hp: 10, maxHp: 10 },
      { id: 'boss', hp: 10, maxHp: 10 },
    ],
    turns: [],
  }), /pending decision is incomplete/);
});
