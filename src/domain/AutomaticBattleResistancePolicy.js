import {
  AUTOMATIC_BATTLE_EFFECT_TYPES,
  normalizeAutomaticBattleEffect,
} from './AutomaticBattleEffectPolicy.js';

export const AUTOMATIC_BATTLE_RESISTANCE_LEVELS = Object.freeze([
  'normal',
  'resistant',
  'high-resistant',
  'immune',
]);

export const AUTOMATIC_BATTLE_RESISTANCE_RULES = Object.freeze({
  normalMultiplier: 1,
  resistantMultiplier: 0.5,
  highResistantMultiplier: 0.25,
});

const EFFECT_TYPE_SET = new Set(AUTOMATIC_BATTLE_EFFECT_TYPES);
const RESISTANCE_LEVEL_SET = new Set(AUTOMATIC_BATTLE_RESISTANCE_LEVELS);

function normalizeResistanceLevel(value) {
  const level = String(value || 'normal').trim().toLowerCase();
  if (!RESISTANCE_LEVEL_SET.has(level)) {
    throw new Error(`Unsupported automatic battle resistance level: ${level || '(empty)'}.`);
  }
  return level;
}

export function normalizeAutomaticBattleResistances(resistances = {}) {
  if (resistances == null) return Object.freeze({});
  if (typeof resistances !== 'object' || Array.isArray(resistances)) {
    throw new Error('Automatic battle resistances must be an object.');
  }

  const normalized = {};
  for (const [rawType, rawLevel] of Object.entries(resistances)) {
    const type = String(rawType || '').trim().toLowerCase();
    if (!EFFECT_TYPE_SET.has(type)) {
      throw new Error(`Unsupported automatic battle resistance effect type: ${type || '(empty)'}.`);
    }
    const level = normalizeResistanceLevel(rawLevel);
    if (level !== 'normal') normalized[type] = level;
  }

  return Object.freeze(normalized);
}

export function resistanceLevelForEffect(combatant = {}, effectType) {
  const type = String(effectType || '').trim().toLowerCase();
  if (!EFFECT_TYPE_SET.has(type)) {
    throw new Error(`Unsupported automatic battle resistance effect type: ${type || '(empty)'}.`);
  }
  const resistances = normalizeAutomaticBattleResistances(combatant.resistances || {});
  return resistances[type] || 'normal';
}

function potencyMultiplier(level) {
  if (level === 'resistant') return AUTOMATIC_BATTLE_RESISTANCE_RULES.resistantMultiplier;
  if (level === 'high-resistant') return AUTOMATIC_BATTLE_RESISTANCE_RULES.highResistantMultiplier;
  return AUTOMATIC_BATTLE_RESISTANCE_RULES.normalMultiplier;
}

/**
 * Resolves one incoming allowlisted status effect against target resistance.
 *
 * Resistance is deterministic and modifies effect potency only. Duration and
 * Poison stack count retain their validated values so the engine has one clear
 * axis for resistance strength. Immunity blocks the effect entirely.
 */
export function resolveAutomaticBattleEffectResistance({ target = {}, effect } = {}) {
  const incoming = normalizeAutomaticBattleEffect(effect);
  const resistanceLevel = resistanceLevelForEffect(target, incoming.type);

  if (resistanceLevel === 'immune') {
    return Object.freeze({
      applied: false,
      blocked: true,
      resistanceLevel,
      incomingEffect: incoming,
      effect: null,
      potencyMultiplier: 0,
    });
  }

  const multiplier = potencyMultiplier(resistanceLevel);
  const adjustedPotency = resistanceLevel === 'normal'
    ? incoming.potency
    : Math.max(1, Math.floor(incoming.potency * multiplier));
  const adjusted = normalizeAutomaticBattleEffect({
    ...incoming,
    potency: adjustedPotency,
  });

  return Object.freeze({
    applied: true,
    blocked: false,
    resistanceLevel,
    incomingEffect: incoming,
    effect: adjusted,
    potencyMultiplier: multiplier,
  });
}
