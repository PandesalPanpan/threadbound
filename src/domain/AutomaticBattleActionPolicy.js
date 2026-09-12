import { projectCombatantWithAutomaticEffects } from './AutomaticBattleEffectPolicy.js';

const DEFAULT_CRIT_MULTIPLIER = 2;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeAttack(value) {
  return Math.max(1, Math.floor(finiteNumber(value, 1)));
}

function normalizeDefense(value) {
  return Math.max(0, Math.floor(finiteNumber(value, 0)));
}

function normalizeCritChance(value) {
  return Math.max(0, Math.min(1, finiteNumber(value, 0)));
}

function requireRandomRoll(value) {
  const roll = Number(value);
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
    throw new Error('Automatic battle RNG must return a finite value in [0, 1).');
  }
  return roll;
}

/**
 * Canonical basic-attack semantics for the automatic battle engine.
 *
 * Attack and Defense resolve to at least one point of damage so ordinary fights
 * cannot deadlock solely because Defense meets/exceeds Attack. Crit Chance is a
 * bounded fraction in [0, 1]. RNG is injected so authoritative simulations are
 * deterministic in tests and can later be seeded by an application/domain
 * boundary without putting randomness in the browser. Psychic stat pressure is
 * projected by the constrained effect policy before damage is calculated.
 */
export function resolveAutomaticBasicAttack({ actor, target, random = Math.random, critMultiplier = DEFAULT_CRIT_MULTIPLIER } = {}) {
  if (!actor || typeof actor !== 'object') throw new Error('Basic attack requires an actor.');
  if (!target || typeof target !== 'object') throw new Error('Basic attack requires a target.');
  if (typeof random !== 'function') throw new Error('Basic attack random source must be a function.');

  const projectedActor = projectCombatantWithAutomaticEffects(actor);
  const projectedTarget = projectCombatantWithAutomaticEffects(target);
  const attack = normalizeAttack(projectedActor.attack);
  const defense = normalizeDefense(projectedTarget.defense);
  const critChance = normalizeCritChance(projectedActor.critChance);
  const multiplier = Math.max(1, finiteNumber(critMultiplier, DEFAULT_CRIT_MULTIPLIER));
  const baseDamage = Math.max(1, attack - defense);
  const critRoll = requireRandomRoll(random());
  const critical = critChance > 0 && critRoll < critChance;
  const targetDamage = critical
    ? Math.max(baseDamage + 1, Math.floor(baseDamage * multiplier))
    : baseDamage;

  return {
    targetDamage,
    metadata: Object.freeze({
      kind: 'basic-attack',
      attack,
      defense,
      baseDamage,
      critical,
      critChance,
      critRoll,
      critMultiplier: multiplier,
    }),
  };
}

export function createAutomaticBasicAttackResolver({ random = Math.random, critMultiplier = DEFAULT_CRIT_MULTIPLIER } = {}) {
  if (typeof random !== 'function') throw new Error('Basic attack random source must be a function.');

  return ({ actor, target }) => resolveAutomaticBasicAttack({
    actor,
    target,
    random,
    critMultiplier,
  });
}

export const AUTOMATIC_BASIC_ATTACK_RULES = Object.freeze({
  minimumDamage: 1,
  critMultiplier: DEFAULT_CRIT_MULTIPLIER,
});
