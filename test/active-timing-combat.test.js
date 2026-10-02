import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVE_TIMING_CONFIG as CONFIG } from '../frontend/src/battle/activeTimingConfig.js';
import {
  ACTIVE_TIMING_PHASE as PHASE,
  activeTimingReducer,
  attackDamage,
  combatSummary,
  createInitialCombatState,
  defenseDamage,
  defenseGrade,
  gradeTimingOffset,
} from '../frontend/src/battle/activeTimingCombat.js';

function reduce(state, type, now = 0, extra = {}) {
  return activeTimingReducer(state, { type, now, ...extra });
}

function started(now = 0) {
  return reduce(createInitialCombatState(), 'START_FIGHT', now);
}

function finishPerfectEnemyTurn(state, now) {
  const pattern = state.currentPattern;
  state = reduce(state, 'ENEMY_TELEGRAPH_DONE', now + pattern.telegraphMs);
  let timingStartedAt = now + pattern.telegraphMs;
  for (let index = 0; index < pattern.hits.length; index += 1) {
    const hit = pattern.hits[index];
    const tappedAt = timingStartedAt + hit.targetMs;
    state = reduce(state, 'DEFENSE_TAP', tappedAt);
    const pause = pattern.hits.length > 1 ? CONFIG.feedback.doubleHitPauseMs : CONFIG.feedback.enemyImpactMs;
    timingStartedAt = tappedAt + pause;
    state = reduce(state, 'ENEMY_IMPACT_DONE', timingStartedAt);
  }
  return state.phase === PHASE.NEXT_TURN
    ? reduce(state, 'NEXT_TURN_DONE', timingStartedAt + CONFIG.feedback.nextTurnMs)
    : state;
}

function finishMissedEnemyTurn(state, now) {
  const pattern = state.currentPattern;
  state = reduce(state, 'ENEMY_TELEGRAPH_DONE', now + pattern.telegraphMs);
  let timingStartedAt = now + pattern.telegraphMs;
  for (let index = 0; index < pattern.hits.length; index += 1) {
    timingStartedAt += pattern.timingDurationMs;
    state = reduce(state, 'DEFENSE_TIMEOUT', timingStartedAt);
    const pause = pattern.hits.length > 1 ? CONFIG.feedback.doubleHitPauseMs : CONFIG.feedback.enemyImpactMs;
    timingStartedAt += pause;
    state = reduce(state, 'ENEMY_IMPACT_DONE', timingStartedAt);
  }
  return state.phase === PHASE.NEXT_TURN
    ? reduce(state, 'NEXT_TURN_DONE', timingStartedAt + CONFIG.feedback.nextTurnMs)
    : state;
}

test('attack timing grade boundaries include both edges of every window', () => {
  const { windows } = CONFIG.attack;
  assert.equal(gradeTimingOffset(0, windows), 'PERFECT');
  assert.equal(gradeTimingOffset(-windows.perfectMs, windows), 'PERFECT');
  assert.equal(gradeTimingOffset(windows.perfectMs + 1, windows), 'GOOD');
  assert.equal(gradeTimingOffset(windows.goodMs, windows), 'GOOD');
  assert.equal(gradeTimingOffset(windows.goodMs + 1, windows), 'NORMAL');
  assert.equal(gradeTimingOffset(windows.normalMs, windows), 'NORMAL');
  assert.equal(gradeTimingOffset(windows.normalMs + 1, windows), 'MISS');
  assert.equal(gradeTimingOffset(-windows.normalMs - 1, windows), 'MISS');
});

test('attack multipliers keep a poor hit damaging and reward better timing', () => {
  const base = 20;
  assert.equal(attackDamage(base, 'PERFECT'), 27);
  assert.equal(attackDamage(base, 'GOOD'), 23);
  assert.equal(attackDamage(base, 'NORMAL'), 20);
  assert.equal(attackDamage(base, 'MISS'), 15);
  assert.ok(attackDamage(base, 'MISS') > 0);
  assert.equal(attackDamage(CONFIG.skill.damage, 'PERFECT', 'SKILL'), 25);
  assert.equal(attackDamage(CONFIG.skill.damage, 'POOR', 'SKILL'), 12);
});

test('defense grade boundaries, reductions, guard bonus, and guard action are distinct', () => {
  assert.equal(defenseGrade(CONFIG.defense.perfectMs), 'PERFECT_GUARD');
  assert.equal(defenseGrade(CONFIG.defense.perfectMs + 1), 'GUARD');
  assert.equal(defenseGrade(CONFIG.defense.guardMs), 'GUARD');
  assert.equal(defenseGrade(CONFIG.defense.guardMs + 1), 'MISS');
  assert.equal(defenseGrade(CONFIG.defense.guardMs + 40, 75), 'GUARD');
  assert.equal(defenseDamage(18, 'PERFECT_GUARD'), 4);
  assert.equal(defenseDamage(18, 'GUARD'), 10);
  assert.equal(defenseDamage(18, 'MISS'), 18);
  assert.equal(defenseDamage(18, 'MISS', true), 13);
});

test('a player attack changes the enemy, then advances through telegraph and timed defense', () => {
  let state = started(100);
  assert.equal(state.phase, PHASE.PLAYER_CHOICE);
  state = reduce(state, 'CHOOSE_ACTION', 150, { action: 'ATTACK' });
  assert.equal(state.phase, PHASE.PLAYER_TIMING);
  state = reduce(state, 'ATTACK_TAP', 150 + CONFIG.attack.targetMs);
  assert.equal(state.phase, PHASE.PLAYER_IMPACT);
  assert.equal(state.feedback.grade, 'PERFECT');
  assert.equal(state.feedback.damage, 19);
  assert.equal(state.enemy.hp, CONFIG.enemy.maxHp - 19);

  const impactDoneAt = 150 + CONFIG.attack.targetMs + CONFIG.feedback.playerImpactMs;
  state = reduce(state, 'PLAYER_IMPACT_DONE', impactDoneAt);
  assert.equal(state.phase, PHASE.ENEMY_TELEGRAPH);
  assert.equal(state.currentPattern.id, 'quick-strike');
  state = reduce(state, 'ENEMY_TELEGRAPH_DONE', impactDoneAt + state.currentPattern.telegraphMs);
  assert.equal(state.phase, PHASE.ENEMY_TIMING);
  const defenseStart = impactDoneAt + state.currentPattern.telegraphMs;
  state = reduce(state, 'DEFENSE_TAP', defenseStart + state.currentPattern.hits[0].targetMs);
  assert.equal(state.phase, PHASE.ENEMY_IMPACT);
  assert.equal(state.feedback.grade, 'PERFECT_GUARD');
  assert.equal(state.feedback.damage, 2);
  state = reduce(state, 'ENEMY_IMPACT_DONE', defenseStart + state.currentPattern.hits[0].targetMs + CONFIG.feedback.enemyImpactMs);
  assert.equal(state.phase, PHASE.NEXT_TURN);
  state = reduce(state, 'NEXT_TURN_DONE', 5000);
  assert.equal(state.phase, PHASE.PLAYER_CHOICE);
  assert.equal(state.turn, 2);
});

test('Skill is a hold-release move with its own timing grade and damage', () => {
  let state = started();
  state = reduce(state, 'CHOOSE_ACTION', 100, { action: 'SKILL' });
  assert.equal(state.phase, PHASE.PLAYER_TIMING);
  assert.equal(state.action, 'SKILL');
  assert.equal(state.timingStartedAt, null);
  state = reduce(state, 'SKILL_HOLD_START', 700);
  state = reduce(state, 'SKILL_HOLD_RELEASE', 700 + CONFIG.skill.targetHoldMs);
  assert.equal(state.phase, PHASE.PLAYER_IMPACT);
  assert.equal(state.feedback.grade, 'PERFECT');
  assert.equal(state.feedback.damage, 25);
  assert.equal(state.telemetry.skillsAttempted, 1);
});

test('Item is local, heals once, and Guard reduces and widens the next defense', () => {
  let state = started();
  state = { ...state, player: { ...state.player, hp: 40 } };
  state = reduce(state, 'CHOOSE_ACTION', 100, { action: 'ITEM' });
  assert.equal(state.phase, PHASE.ENEMY_TELEGRAPH);
  assert.equal(state.player.hp, 40 + CONFIG.player.potionHeal);
  assert.equal(state.player.potions, 0);
  assert.equal(state.telemetry.itemsUsed, 1);
  assert.equal(state.feedback.kind, 'item');

  state = finishPerfectEnemyTurn(state, 500);
  assert.equal(state.phase, PHASE.PLAYER_CHOICE);
  const unchanged = reduce(state, 'CHOOSE_ACTION', 8000, { action: 'ITEM' });
  assert.equal(unchanged, state);

  // The next turn's predictable Heavy Slam can be anticipated with Guard.
  state = reduce(state, 'CHOOSE_ACTION', 9000, { action: 'GUARD' });
  assert.equal(state.phase, PHASE.ENEMY_TELEGRAPH);
  assert.equal(state.guardReady, true);
  assert.equal(state.telemetry.guardActions, 1);
  state = reduce(state, 'ENEMY_TELEGRAPH_DONE', 15000 + state.currentPattern.telegraphMs);
  assert.equal(state.currentPattern.id, 'heavy-slam');
  const hpBefore = state.player.hp;
  const defenseStartedAt = state.timingStartedAt;
  // This offset misses the normal window but lands inside the Guard action bonus.
  state = reduce(state, 'DEFENSE_TAP', defenseStartedAt + state.currentPattern.hits[0].targetMs + CONFIG.defense.guardMs + 40);
  assert.equal(state.feedback.grade, 'GUARD');
  assert.ok(hpBefore - state.player.hp < state.currentPattern.hits[0].damage);
});

test('the double-bounce telegraph requires two defensive taps', () => {
  let state = started();
  state = { ...state, turn: 3 };
  state = reduce(state, 'CHOOSE_ACTION', 100, { action: 'GUARD' });
  state = reduce(state, 'ENEMY_TELEGRAPH_DONE', 100 + state.currentPattern.telegraphMs);
  assert.equal(state.currentPattern.id, 'double-bounce');
  const firstStart = state.timingStartedAt;
  state = reduce(state, 'DEFENSE_TAP', firstStart + state.currentPattern.hits[0].targetMs);
  state = reduce(state, 'ENEMY_IMPACT_DONE', firstStart + state.currentPattern.hits[0].targetMs + CONFIG.feedback.doubleHitPauseMs);
  assert.equal(state.phase, PHASE.ENEMY_TIMING);
  assert.equal(state.defenseIndex, 1);
  const secondStart = state.timingStartedAt;
  state = reduce(state, 'DEFENSE_TAP', secondStart + state.currentPattern.hits[1].targetMs);
  assert.equal(state.phase, PHASE.ENEMY_IMPACT);
  assert.equal(state.telemetry.perfectGuards, 2);
});

test('Potion and Guard each cost the offensive action for the turn', () => {
  let state = started();
  state = { ...state, player: { ...state.player, hp: 50 } };
  state = reduce(state, 'CHOOSE_ACTION', 10, { action: 'ITEM' });
  assert.equal(state.enemy.hp, CONFIG.enemy.maxHp);
  assert.equal(state.phase, PHASE.ENEMY_TELEGRAPH);
  state = finishPerfectEnemyTurn(state, 1000);
  state = reduce(state, 'CHOOSE_ACTION', 5000, { action: 'GUARD' });
  assert.equal(state.enemy.hp, CONFIG.enemy.maxHp);
  assert.equal(state.phase, PHASE.ENEMY_TELEGRAPH);
});

test('perfect Skills can win naturally and Fight Again resets all local run state', () => {
  let state = started(100);
  let now = 100;
  for (let attempt = 0; attempt < 8 && state.phase !== PHASE.RESULT; attempt += 1) {
    state = reduce(state, 'CHOOSE_ACTION', now, { action: 'SKILL' });
    now += 20;
    state = reduce(state, 'SKILL_HOLD_START', now);
    now += CONFIG.skill.targetHoldMs;
    state = reduce(state, 'SKILL_HOLD_RELEASE', now);
    now += CONFIG.feedback.playerImpactMs;
    state = reduce(state, 'PLAYER_IMPACT_DONE', now);
    if (state.phase === PHASE.ENEMY_TELEGRAPH) {
      state = finishPerfectEnemyTurn(state, now);
      now += 3000;
    }
  }
  assert.equal(state.phase, PHASE.RESULT);
  assert.equal(state.outcome, 'VICTORY');
  assert.ok(state.telemetry.damageDealt >= CONFIG.enemy.maxHp);
  assert.equal(combatSummary(state).outcome, 'VICTORY');

  state = reduce(state, 'START_FIGHT', now + 1);
  assert.equal(state.phase, PHASE.PLAYER_CHOICE);
  assert.equal(state.turn, 1);
  assert.deepEqual(state.player, { hp: CONFIG.player.maxHp, maxHp: CONFIG.player.maxHp, potions: CONFIG.player.potionCount });
  assert.equal(state.enemy.hp, CONFIG.enemy.maxHp);
  assert.equal(state.telemetry.skillsAttempted, 0);
});

test('repeated missed defenses can produce a normal defeat', () => {
  let state = started(0);
  let now = 0;
  for (let turn = 0; turn < 9 && state.phase !== PHASE.RESULT; turn += 1) {
    state = reduce(state, 'CHOOSE_ACTION', now, { action: 'ATTACK' });
    now += CONFIG.attack.durationMs;
    state = reduce(state, 'PLAYER_TIMING_TIMEOUT', now);
    now += CONFIG.feedback.playerImpactMs;
    state = reduce(state, 'PLAYER_IMPACT_DONE', now);
    if (state.phase === PHASE.ENEMY_TELEGRAPH) {
      state = finishMissedEnemyTurn(state, now);
      now += 3000;
    }
  }
  assert.equal(state.phase, PHASE.RESULT);
  assert.equal(state.outcome, 'DEFEAT');
  assert.ok(state.telemetry.missedDefenses >= 6);
  assert.equal(state.enemy.hp, Math.max(0, CONFIG.enemy.maxHp - 11 * state.telemetry.attacksAttempted));
});
