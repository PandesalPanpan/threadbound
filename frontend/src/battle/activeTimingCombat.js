import { ACTIVE_TIMING_CONFIG as CONFIG } from './activeTimingConfig.js';

export const ACTIVE_TIMING_PHASE = Object.freeze({
  READY: 'READY',
  PLAYER_CHOICE: 'PLAYER_CHOICE',
  PLAYER_TIMING: 'PLAYER_TIMING',
  PLAYER_IMPACT: 'PLAYER_IMPACT',
  ENEMY_TELEGRAPH: 'ENEMY_TELEGRAPH',
  ENEMY_TIMING: 'ENEMY_TIMING',
  ENEMY_IMPACT: 'ENEMY_IMPACT',
  NEXT_TURN: 'NEXT_TURN',
  RESULT: 'RESULT',
});

function freshTelemetry() {
  return {
    turns: 1,
    attacksAttempted: 0,
    skillsAttempted: 0,
    perfect: 0,
    good: 0,
    normal: 0,
    miss: 0,
    poor: 0,
    perfectGuards: 0,
    guards: 0,
    missedDefenses: 0,
    timingOffsetTotalMs: 0,
    timingSamples: 0,
    damageDealt: 0,
    damageReceived: 0,
    itemsUsed: 0,
    guardActions: 0,
  };
}

export function createInitialCombatState() {
  return {
    phase: ACTIVE_TIMING_PHASE.READY,
    turn: 0,
    player: { hp: CONFIG.player.maxHp, maxHp: CONFIG.player.maxHp, potions: CONFIG.player.potionCount },
    enemy: { hp: CONFIG.enemy.maxHp, maxHp: CONFIG.enemy.maxHp },
    action: null,
    timingStartedAt: null,
    timingTargetMs: null,
    telegraphStartedAt: null,
    currentPattern: null,
    defenseIndex: 0,
    guardReady: false,
    feedback: null,
    outcome: null,
    fightStartedAt: null,
    fightEndedAt: null,
    telemetry: freshTelemetry(),
  };
}

export function gradeTimingOffset(offsetMs, windows, labels = {}) {
  const offset = Number(offsetMs);
  const absolute = Math.abs(Number.isFinite(offset) ? offset : Number.POSITIVE_INFINITY);
  if (absolute <= windows.perfectMs) return labels.perfect || 'PERFECT';
  if (absolute <= windows.goodMs) return labels.good || 'GOOD';
  if (absolute <= windows.normalMs) return labels.normal || 'NORMAL';
  return labels.miss || 'MISS';
}

export function attackDamage(baseDamage, grade, action = 'ATTACK') {
  const table = action === 'SKILL' ? CONFIG.skill.multipliers : CONFIG.attack.multipliers;
  const multiplier = Number(table[grade] ?? table.MISS ?? 0.75);
  return Math.max(1, Math.round(Number(baseDamage) * multiplier));
}

export function defenseGrade(offsetMs, windowBonusMs = 0) {
  const absolute = Math.abs(Number(offsetMs));
  if (absolute <= CONFIG.defense.perfectMs + windowBonusMs) return 'PERFECT_GUARD';
  if (absolute <= CONFIG.defense.guardMs + windowBonusMs) return 'GUARD';
  return 'MISS';
}

export function defenseDamage(baseDamage, grade, guardReady = false) {
  const multiplier = grade === 'PERFECT_GUARD'
    ? CONFIG.defense.perfectDamageMultiplier
    : grade === 'GUARD'
      ? CONFIG.defense.guardDamageMultiplier
      : CONFIG.defense.missDamageMultiplier;
  const guardMultiplier = guardReady ? CONFIG.defense.guardActionDamageMultiplier : 1;
  return Math.max(1, Math.round(Number(baseDamage) * multiplier * guardMultiplier));
}

function addTimingOffset(telemetry, offsetMs) {
  return {
    ...telemetry,
    timingOffsetTotalMs: telemetry.timingOffsetTotalMs + Math.abs(offsetMs),
    timingSamples: telemetry.timingSamples + 1,
  };
}

function addGrade(telemetry, grade) {
  const key = grade.toLowerCase();
  return { ...telemetry, [key]: Number(telemetry[key] || 0) + 1 };
}

function finish(state, outcome, now) {
  return { ...state, phase: ACTIVE_TIMING_PHASE.RESULT, outcome, fightEndedAt: now, timingStartedAt: null };
}

function beginEnemyTelegraph(state, now, { feedback = null } = {}) {
  const patterns = CONFIG.enemyPatterns;
  const currentPattern = patterns[(Math.max(1, state.turn) - 1) % patterns.length];
  return {
    ...state,
    phase: ACTIVE_TIMING_PHASE.ENEMY_TELEGRAPH,
    action: null,
    timingStartedAt: null,
    timingTargetMs: null,
    telegraphStartedAt: now,
    currentPattern,
    defenseIndex: 0,
    feedback,
  };
}

function resolvePlayerTiming(state, now, timedOut = false) {
  if (state.phase !== ACTIVE_TIMING_PHASE.PLAYER_TIMING || !state.action) return state;
  if (state.action === 'SKILL' && state.timingStartedAt == null) return state;

  const windows = state.action === 'SKILL' ? CONFIG.skill.windows : CONFIG.attack.windows;
  const targetMs = state.action === 'SKILL' ? CONFIG.skill.targetHoldMs : CONFIG.attack.targetMs;
  const durationMs = state.action === 'SKILL' ? CONFIG.skill.durationMs : CONFIG.attack.durationMs;
  const elapsedMs = timedOut ? durationMs : Math.max(0, now - state.timingStartedAt);
  const offsetMs = elapsedMs - targetMs;
  const grade = gradeTimingOffset(offsetMs, windows, state.action === 'SKILL' ? { miss: 'POOR' } : {});
  const baseDamage = state.action === 'SKILL' ? CONFIG.skill.damage : CONFIG.player.attackDamage;
  const damage = attackDamage(baseDamage, grade, state.action);
  const actualDamage = Math.min(state.enemy.hp, damage);
  const telemetry = addGrade(state.telemetry, grade);
  const timedTelemetry = timedOut ? telemetry : addTimingOffset(telemetry, offsetMs);
  const signedTiming = offsetMs < 0 ? 'EARLY' : 'LATE';
  return {
    ...state,
    phase: ACTIVE_TIMING_PHASE.PLAYER_IMPACT,
    enemy: { ...state.enemy, hp: Math.max(0, state.enemy.hp - actualDamage) },
    timingStartedAt: null,
    telemetry: { ...timedTelemetry, damageDealt: timedTelemetry.damageDealt + actualDamage },
    feedback: {
      kind: 'player',
      grade,
      label: grade === 'MISS' || grade === 'POOR' ? signedTiming : grade,
      damage: actualDamage,
      offsetMs: timedOut ? null : offsetMs,
      action: state.action,
    },
  };
}

function resolveDefense(state, now, timedOut = false) {
  if (state.phase !== ACTIVE_TIMING_PHASE.ENEMY_TIMING) return state;
  const hit = state.currentPattern?.hits?.[state.defenseIndex];
  if (!hit) return state;
  const elapsedMs = timedOut ? state.currentPattern.timingDurationMs : Math.max(0, now - state.timingStartedAt);
  const offsetMs = elapsedMs - hit.targetMs;
  const bonus = state.guardReady ? CONFIG.defense.guardWindowBonusMs : 0;
  const grade = timedOut ? 'MISS' : defenseGrade(offsetMs, bonus);
  const damage = defenseDamage(hit.damage, grade, state.guardReady);
  const actualDamage = Math.min(state.player.hp, damage);
  let telemetry = { ...state.telemetry, damageReceived: state.telemetry.damageReceived + actualDamage };
  if (timedOut || grade === 'MISS') telemetry.missedDefenses += 1;
  else if (grade === 'PERFECT_GUARD') telemetry.perfectGuards += 1;
  else telemetry.guards += 1;
  if (!timedOut) telemetry = addTimingOffset(telemetry, offsetMs);
  return {
    ...state,
    phase: ACTIVE_TIMING_PHASE.ENEMY_IMPACT,
    player: { ...state.player, hp: Math.max(0, state.player.hp - actualDamage) },
    timingStartedAt: null,
    telemetry,
    feedback: {
      kind: 'enemy',
      grade,
      label: grade === 'PERFECT_GUARD' ? 'PERFECT GUARD' : grade,
      damage: actualDamage,
      offsetMs: timedOut ? null : offsetMs,
      hitLabel: hit.label,
    },
  };
}

export function activeTimingReducer(state, action) {
  const now = Number(action.now ?? 0);
  switch (action.type) {
    case 'START_FIGHT':
      if (![ACTIVE_TIMING_PHASE.READY, ACTIVE_TIMING_PHASE.RESULT].includes(state.phase)) return state;
      return {
        ...createInitialCombatState(),
        phase: ACTIVE_TIMING_PHASE.PLAYER_CHOICE,
        turn: 1,
        fightStartedAt: now,
      };

    case 'CHOOSE_ACTION': {
      if (state.phase !== ACTIVE_TIMING_PHASE.PLAYER_CHOICE) return state;
      const choice = String(action.action || '').toUpperCase();
      if (choice === 'ATTACK') {
        return {
          ...state,
          phase: ACTIVE_TIMING_PHASE.PLAYER_TIMING,
          action: 'ATTACK',
          timingStartedAt: now,
          timingTargetMs: CONFIG.attack.targetMs,
          telemetry: { ...state.telemetry, attacksAttempted: state.telemetry.attacksAttempted + 1 },
          feedback: null,
        };
      }
      if (choice === 'SKILL') {
        return {
          ...state,
          phase: ACTIVE_TIMING_PHASE.PLAYER_TIMING,
          action: 'SKILL',
          timingStartedAt: null,
          timingTargetMs: CONFIG.skill.targetHoldMs,
          telemetry: { ...state.telemetry, skillsAttempted: state.telemetry.skillsAttempted + 1 },
          feedback: null,
        };
      }
      if (choice === 'ITEM') {
        if (state.player.potions <= 0 || state.player.hp >= state.player.maxHp) return state;
        const healing = Math.min(state.player.maxHp - state.player.hp, CONFIG.player.potionHeal);
        return beginEnemyTelegraph({
          ...state,
          player: { ...state.player, hp: state.player.hp + healing, potions: state.player.potions - 1 },
          telemetry: { ...state.telemetry, itemsUsed: state.telemetry.itemsUsed + 1 },
          feedback: { kind: 'item', label: 'POTION', healing },
        }, now, { feedback: { kind: 'item', label: 'POTION', healing } });
      }
      if (choice === 'GUARD') {
        return beginEnemyTelegraph({
          ...state,
          guardReady: true,
          telemetry: { ...state.telemetry, guardActions: state.telemetry.guardActions + 1 },
          feedback: { kind: 'guard', label: 'GUARD UP' },
        }, now, { feedback: { kind: 'guard', label: 'GUARD UP' } });
      }
      return state;
    }

    case 'ATTACK_TAP':
      if (state.action !== 'ATTACK') return state;
      return resolvePlayerTiming(state, now);

    case 'SKILL_HOLD_START':
      if (state.phase !== ACTIVE_TIMING_PHASE.PLAYER_TIMING || state.action !== 'SKILL' || state.timingStartedAt != null) return state;
      return { ...state, timingStartedAt: now };

    case 'SKILL_HOLD_RELEASE':
      if (state.action !== 'SKILL' || state.timingStartedAt == null) return state;
      return resolvePlayerTiming(state, now);

    case 'PLAYER_TIMING_TIMEOUT':
      if (state.action !== 'ATTACK') return state;
      return resolvePlayerTiming(state, now, true);

    case 'PLAYER_IMPACT_DONE':
      if (state.phase !== ACTIVE_TIMING_PHASE.PLAYER_IMPACT) return state;
      if (state.enemy.hp <= 0) return finish(state, 'VICTORY', now);
      return beginEnemyTelegraph(state, now);

    case 'ENEMY_TELEGRAPH_DONE':
      if (state.phase !== ACTIVE_TIMING_PHASE.ENEMY_TELEGRAPH) return state;
      return {
        ...state,
        phase: ACTIVE_TIMING_PHASE.ENEMY_TIMING,
        timingStartedAt: now,
        timingTargetMs: state.currentPattern?.hits?.[0]?.targetMs ?? null,
        feedback: null,
      };

    case 'DEFENSE_TAP':
      return resolveDefense(state, now);

    case 'DEFENSE_TIMEOUT':
      return resolveDefense(state, now, true);

    case 'ENEMY_IMPACT_DONE': {
      if (state.phase !== ACTIVE_TIMING_PHASE.ENEMY_IMPACT) return state;
      if (state.player.hp <= 0) return finish(state, 'DEFEAT', now);
      const nextDefenseIndex = state.defenseIndex + 1;
      if (nextDefenseIndex < (state.currentPattern?.hits?.length || 0)) {
        const nextHit = state.currentPattern.hits[nextDefenseIndex];
        return {
          ...state,
          phase: ACTIVE_TIMING_PHASE.ENEMY_TIMING,
          defenseIndex: nextDefenseIndex,
          timingStartedAt: now,
          timingTargetMs: nextHit.targetMs,
          feedback: { kind: 'warning', label: 'AGAIN', hitLabel: nextHit.label },
        };
      }
      return { ...state, phase: ACTIVE_TIMING_PHASE.NEXT_TURN, timingTargetMs: null, timingStartedAt: null, guardReady: false };
    }

    case 'NEXT_TURN_DONE':
      if (state.phase !== ACTIVE_TIMING_PHASE.NEXT_TURN) return state;
      return {
        ...state,
        phase: ACTIVE_TIMING_PHASE.PLAYER_CHOICE,
        turn: state.turn + 1,
        telemetry: { ...state.telemetry, turns: state.telemetry.turns + 1 },
        currentPattern: null,
        telegraphStartedAt: null,
        defenseIndex: 0,
        feedback: null,
      };

    default:
      return state;
  }
}

export function combatSummary(state) {
  const telemetry = state.telemetry;
  return {
    outcome: state.outcome,
    durationMs: Math.max(0, (state.fightEndedAt ?? 0) - (state.fightStartedAt ?? 0)),
    turns: telemetry.turns,
    attacksAttempted: telemetry.attacksAttempted,
    skillsAttempted: telemetry.skillsAttempted,
    perfect: telemetry.perfect,
    good: telemetry.good,
    normal: telemetry.normal,
    miss: telemetry.miss,
    poor: telemetry.poor,
    perfectGuards: telemetry.perfectGuards,
    guards: telemetry.guards,
    missedDefenses: telemetry.missedDefenses,
    averageAbsTimingOffsetMs: telemetry.timingSamples ? Math.round(telemetry.timingOffsetTotalMs / telemetry.timingSamples) : 0,
    damageDealt: telemetry.damageDealt,
    damageReceived: telemetry.damageReceived,
    itemsUsed: telemetry.itemsUsed,
    guardActions: telemetry.guardActions,
  };
}
