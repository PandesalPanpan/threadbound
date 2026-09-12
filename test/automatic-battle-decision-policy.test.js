import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTOMATIC_BATTLE_DECISION_RULES,
  createSparseBossDecisionPolicy,
  normalizeSparseBossDecisionPoints,
} from '../src/domain/AutomaticBattleDecisionPolicy.js';

const combatants = [
  { id: 'party', hp: 30, maxHp: 30 },
  { id: 'boss', hp: 20, maxHp: 40 },
];

test('sparse boss decisions accept only bounded allowlisted actions and triggers', () => {
  const normalized = normalizeSparseBossDecisionPoints([
    {
      id: 'brace',
      scope: 'party',
      prompt: 'The boss is charging. Choose the party response.',
      actions: ['continue', 'heal', 'coordinate'],
      afterTurn: 2,
      bossHpRatioAtOrBelow: 0.75,
    },
  ]);

  assert.equal(normalized.length, 1);
  assert.deepEqual(normalized[0].actions.map((action) => action.id), ['continue', 'heal', 'coordinate']);
  assert.equal(normalized[0].bossHpRatioAtOrBelow, 0.75);

  assert.throws(() => normalizeSparseBossDecisionPoints([
    {
      id: 'scripted',
      prompt: 'Run arbitrary behavior.',
      actions: ['execute-script'],
      afterTurn: 1,
    },
  ]), /unsupported decision action/);

  const tooMany = Array.from({ length: AUTOMATIC_BATTLE_DECISION_RULES.maxDecisionPoints + 1 }, (_, index) => ({
    id: `decision-${index}`,
    prompt: `Decision ${index}`,
    actions: ['continue'],
    afterTurn: index + 1,
  }));
  assert.throws(() => normalizeSparseBossDecisionPoints(tooMany), /at most 3 sparse decision points/);
});

test('decision policy pauses only the configured boss activity and only after its trigger', () => {
  const policy = createSparseBossDecisionPolicy({
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
  });

  assert.equal(policy({ turnNumber: 2, combatants, context: { activity: 'hunt' } }), null);
  assert.equal(policy({ turnNumber: 1, combatants, context: { activity: 'boss-phase' } }), null);

  const signal = policy({ turnNumber: 2, combatants, context: { activity: 'boss-phase' } });
  assert.equal(signal.reason, 'boss-decision');
  assert.equal(signal.pendingDecision.id, 'brace');
  assert.equal(signal.pendingDecision.scope, 'party');
  assert.deepEqual(signal.pendingDecision.actions.map((action) => action.id), ['continue', 'heal', 'coordinate']);
});

test('resolved decision ids prevent repeated pauses and allow later sparse decisions', () => {
  const policy = createSparseBossDecisionPolicy({
    bossId: 'boss',
    decisions: [
      {
        id: 'brace',
        prompt: 'Brace together.',
        actions: ['continue', 'coordinate'],
        afterTurn: 2,
      },
      {
        id: 'last-stand',
        prompt: 'The boss is wavering. Choose the final response.',
        actions: ['continue', 'heal'],
        bossHpRatioAtOrBelow: 0.5,
      },
    ],
  });

  const first = policy({ turnNumber: 3, combatants, context: { activity: 'boss-phase' } });
  assert.equal(first.pendingDecision.id, 'brace');

  const second = policy({
    turnNumber: 3,
    combatants,
    context: { activity: 'boss-phase', resolvedDecisionIds: ['brace'] },
  });
  assert.equal(second.pendingDecision.id, 'last-stand');

  const finished = policy({
    turnNumber: 3,
    combatants,
    context: { activity: 'boss-phase', resolvedDecisionIds: ['brace', 'last-stand'] },
  });
  assert.equal(finished, null);
});

test('HP thresholds are evaluated against authoritative boss HP state', () => {
  const policy = createSparseBossDecisionPolicy({
    bossId: 'boss',
    decisions: [
      {
        id: 'half-health',
        prompt: 'The boss changes stance.',
        actions: ['continue', 'use-item'],
        bossHpRatioAtOrBelow: 0.5,
      },
    ],
  });

  assert.equal(policy({
    turnNumber: 1,
    combatants: [combatants[0], { id: 'boss', hp: 21, maxHp: 40 }],
    context: { activity: 'boss-phase' },
  }), null);

  assert.equal(policy({
    turnNumber: 1,
    combatants,
    context: { activity: 'boss-phase' },
  }).pendingDecision.id, 'half-health');
});
