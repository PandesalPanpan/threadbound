import { selectActorBySpeed } from './AutomaticBattleInitiativePolicy.js';
import {
  mergeAutomaticBattleEffect,
  normalizeAutomaticBattleEffects,
  resolveAutomaticEffectTurnStart,
} from './AutomaticBattleEffectPolicy.js';
import {
  normalizeAutomaticBattleResistances,
  resolveAutomaticBattleEffectResistance,
} from './AutomaticBattleResistancePolicy.js';

function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function requireNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}

function normalizeCombatant(combatant, index) {
  if (!combatant || typeof combatant !== 'object') {
    throw new Error(`Combatant ${index + 1} is required.`);
  }

  const id = String(combatant.id || '').trim();
  if (!id) throw new Error(`Combatant ${index + 1} requires an id.`);

  const maxHp = requirePositiveInteger(combatant.maxHp, `${id} maxHp`);
  const hp = requirePositiveInteger(combatant.hp ?? maxHp, `${id} hp`);
  if (hp > maxHp) throw new Error(`${id} hp cannot exceed maxHp.`);

  return {
    ...combatant,
    id,
    hp,
    maxHp,
    effects: [...normalizeAutomaticBattleEffects(combatant.effects || [])],
    resistances: { ...normalizeAutomaticBattleResistances(combatant.resistances || {}) },
  };
}

function cloneCombatant(combatant) {
  return {
    ...combatant,
    effects: Array.isArray(combatant.effects) ? combatant.effects.map((effect) => ({ ...effect })) : [],
    resistances: { ...(combatant.resistances || {}) },
  };
}

function cloneCombatants(combatants) {
  return combatants.map(cloneCombatant);
}

function defaultTargetSelector({ actor, combatants }) {
  return combatants.find((combatant) => combatant.id !== actor.id)?.id || null;
}

function livingCombatants(combatants) {
  return combatants.filter((combatant) => combatant.hp > 0);
}

function finalizeResult({ combatants, turns, outcome, context, stopReason = null }) {
  const living = livingCombatants(combatants);
  const defeated = combatants.filter((combatant) => combatant.hp <= 0);

  return {
    outcome,
    winnerId: outcome === 'victory' && living.length === 1 ? living[0].id : null,
    loserId: outcome === 'victory' && defeated.length === 1 ? defeated[0].id : null,
    stopReason,
    combatants: cloneCombatants(combatants),
    turns: turns.map((turn) => ({ ...turn })),
    context,
  };
}

function applyTargetEffects(target, targetEffects = []) {
  if (targetEffects == null) return [];
  if (!Array.isArray(targetEffects)) throw new Error('Automatic battle targetEffects must be an array.');

  const applications = [];
  for (const incomingEffect of targetEffects) {
    const resolution = resolveAutomaticBattleEffectResistance({ target, effect: incomingEffect });
    if (resolution.applied) {
      target.effects = [...mergeAutomaticBattleEffect(target.effects, resolution.effect)];
    }
    applications.push({
      type: resolution.incomingEffect.type,
      resistanceLevel: resolution.resistanceLevel,
      applied: resolution.applied,
      blocked: resolution.blocked,
      incomingPotency: resolution.incomingEffect.potency,
      appliedPotency: resolution.effect?.potency ?? 0,
      potencyMultiplier: resolution.potencyMultiplier,
    });
  }
  return applications;
}

/**
 * Activity-agnostic automatic battle loop.
 *
 * The simulator owns authoritative battle lifecycle state: HP mutation,
 * termination, turn history, constrained periodic effect ticks, resistance-aware
 * effect application, and optional phase pausing. Stat formulas, RNG, initiative
 * frequency, effect vocabulary, and resistance semantics remain domain policies
 * so Hunt, Adventure, Duel, and bosses reuse one lifecycle.
 */
export class AutomaticBattleSimulator {
  constructor({
    resolveAction,
    selectActor = selectActorBySpeed,
    selectTarget = defaultTargetSelector,
    shouldStop = null,
    maxTurns = 200,
  } = {}) {
    if (typeof resolveAction !== 'function') {
      throw new Error('AutomaticBattleSimulator requires a resolveAction domain policy.');
    }
    if (typeof selectActor !== 'function') throw new Error('selectActor must be a function.');
    if (typeof selectTarget !== 'function') throw new Error('selectTarget must be a function.');
    if (shouldStop !== null && typeof shouldStop !== 'function') throw new Error('shouldStop must be a function when provided.');

    this.resolveAction = resolveAction;
    this.selectActor = selectActor;
    this.selectTarget = selectTarget;
    this.shouldStop = shouldStop;
    this.maxTurns = requirePositiveInteger(maxTurns, 'maxTurns');
  }

  simulate({ combatants, context = null } = {}) {
    if (!Array.isArray(combatants) || combatants.length !== 2) {
      throw new Error('Automatic battles currently require exactly two combatants.');
    }

    const state = combatants.map(normalizeCombatant);
    if (new Set(state.map((combatant) => combatant.id)).size !== state.length) {
      throw new Error('Automatic battle combatant ids must be unique.');
    }

    const turns = [];

    for (let turnNumber = 1; turnNumber <= this.maxTurns; turnNumber += 1) {
      if (livingCombatants(state).length <= 1) {
        return finalizeResult({ combatants: state, turns, outcome: 'victory', context });
      }

      const actorId = this.selectActor({
        turnNumber,
        combatants: cloneCombatants(state),
        turns: turns.map((turn) => ({ ...turn })),
        context,
      });
      const actor = state.find((combatant) => combatant.id === actorId && combatant.hp > 0);
      if (!actor) throw new Error(`Turn ${turnNumber} selected an invalid or defeated actor.`);

      const actorHpBefore = actor.hp;
      const effectStart = resolveAutomaticEffectTurnStart(actor);
      actor.hp = Math.max(0, actor.hp - effectStart.periodicDamage);

      if (actor.hp <= 0) {
        turns.push({
          turnNumber,
          actorId: actor.id,
          targetId: null,
          targetDamage: 0,
          selfHealing: 0,
          effectDamage: effectStart.periodicDamage,
          actorHpBefore,
          actorHpAfterEffects: actor.hp,
          actorHpAfter: actor.hp,
          targetHpBefore: null,
          targetHpAfter: null,
          metadata: {
            kind: 'effect-tick',
            effectEvents: effectStart.events.map((event) => ({ ...event })),
            effectApplications: [],
          },
        });
        actor.effects = [...effectStart.remainingEffects];
        return finalizeResult({ combatants: state, turns, outcome: 'victory', context });
      }

      const targetId = this.selectTarget({
        turnNumber,
        actor: cloneCombatant(actor),
        combatants: cloneCombatants(state),
        turns: turns.map((turn) => ({ ...turn })),
        context,
      });
      const target = state.find((combatant) => combatant.id === targetId && combatant.id !== actor.id && combatant.hp > 0);
      if (!target) throw new Error(`Turn ${turnNumber} selected an invalid or defeated target.`);

      const action = this.resolveAction({
        turnNumber,
        actor: cloneCombatant(actor),
        target: cloneCombatant(target),
        combatants: cloneCombatants(state),
        turns: turns.map((turn) => ({ ...turn })),
        context,
      });
      if (!action || typeof action !== 'object') throw new Error(`Turn ${turnNumber} action policy must return an object.`);

      const targetDamage = requireNonNegativeInteger(action.targetDamage ?? 0, `Turn ${turnNumber} targetDamage`);
      const selfHealing = requireNonNegativeInteger(action.selfHealing ?? 0, `Turn ${turnNumber} selfHealing`);
      const targetHpBefore = target.hp;
      const actorHpAfterEffects = actor.hp;

      target.hp = Math.max(0, target.hp - targetDamage);
      actor.hp = Math.min(actor.maxHp, actor.hp + selfHealing);
      actor.effects = [...effectStart.remainingEffects];
      const effectApplications = applyTargetEffects(target, action.targetEffects ?? []);

      const turn = {
        turnNumber,
        actorId: actor.id,
        targetId: target.id,
        targetDamage,
        selfHealing,
        effectDamage: effectStart.periodicDamage,
        actorHpBefore,
        actorHpAfterEffects,
        actorHpAfter: actor.hp,
        targetHpBefore,
        targetHpAfter: target.hp,
        metadata: {
          ...(action.metadata ?? {}),
          effectEvents: effectStart.events.map((event) => ({ ...event })),
          effectApplications,
        },
      };
      turns.push(turn);

      if (target.hp <= 0) {
        return finalizeResult({ combatants: state, turns, outcome: 'victory', context });
      }

      if (this.shouldStop) {
        const stopReason = this.shouldStop({
          turnNumber,
          combatants: cloneCombatants(state),
          turns: turns.map((entry) => ({ ...entry })),
          lastTurn: { ...turn },
          context,
        });
        if (stopReason) {
          return finalizeResult({ combatants: state, turns, outcome: 'paused', context, stopReason: String(stopReason) });
        }
      }
    }

    return finalizeResult({ combatants: state, turns, outcome: 'draw', context, stopReason: 'max-turns' });
  }
}

export function simulateAutomaticBattle(options, battle) {
  return new AutomaticBattleSimulator(options).simulate(battle);
}
