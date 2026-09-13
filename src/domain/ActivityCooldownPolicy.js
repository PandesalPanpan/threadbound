import { ACTIVITY_COOLDOWN_FIGHT_BUFF_CODES, fightBuffCooldownModifier } from './FightBuffPolicy.js';

export const ACTIVITY_COOLDOWN_RULES = Object.freeze({
  maxReductionPercent: 50,
  minimumCooldownSeconds: 1,
});

const EQUIPMENT_COOLDOWN_EFFECTS = Object.freeze({
  quick_hunt: Object.freeze({ activity: 'hunt', reductionPercent: 20 }),
});

function normalizeBaseCooldownSeconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error('Base activity cooldown must be a non-negative number.');
  return Math.floor(number);
}

function effectCodesForItem(item) {
  if (!item || typeof item !== 'object') return [];
  const values = Array.isArray(item.effectCodes)
    ? item.effectCodes
    : Array.isArray(item.effect?.equipmentTemplate?.effectCodes)
      ? item.effect.equipmentTemplate.effectCodes
      : [item.effectCode];
  return values.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
}

function equippedEffectCodes(equipment = {}) {
  if (!equipment || typeof equipment !== 'object' || Array.isArray(equipment)) return [];
  const codes = [];
  const seenItems = new Set();
  for (const item of Object.values(equipment)) {
    if (!item || typeof item !== 'object') continue;
    const identity = item.id || item;
    if (seenItems.has(identity)) continue;
    seenItems.add(identity);
    codes.push(...effectCodesForItem(item));
  }
  return codes;
}

function modifierForEquipmentCode(code, activity) {
  const definition = EQUIPMENT_COOLDOWN_EFFECTS[code];
  if (!definition || definition.activity !== activity) return null;
  return Object.freeze({ source: 'equipment', code, reductionPercent: definition.reductionPercent });
}

/**
 * Domain policy for bounded activity cooldown reductions.
 *
 * Persisted/generated equipment is trusted only through stable allowlisted
 * effect codes. Active cooking buffs share the central FightBuffPolicy allowlist,
 * so a stat-only buff is accepted but simply contributes no cooldown modifier.
 */
export function resolveActivityCooldown({
  activity,
  baseCooldownSeconds,
  equipment = {},
  buffCodes = [],
} = {}) {
  const normalizedActivity = String(activity || '').trim().toLowerCase();
  if (!normalizedActivity) throw new Error('Activity cooldown requires an activity.');
  const baseSeconds = normalizeBaseCooldownSeconds(baseCooldownSeconds);
  if (!Array.isArray(buffCodes)) throw new Error('Activity cooldown buffCodes must be an array.');

  const modifiers = [];
  for (const code of equippedEffectCodes(equipment)) {
    const modifier = modifierForEquipmentCode(code, normalizedActivity);
    if (modifier) modifiers.push(modifier);
  }
  for (const rawCode of buffCodes) {
    const modifier = fightBuffCooldownModifier(rawCode, normalizedActivity);
    if (modifier) modifiers.push(modifier);
  }

  const requestedReductionPercent = modifiers.reduce((total, modifier) => total + modifier.reductionPercent, 0);
  const appliedReductionPercent = Math.min(ACTIVITY_COOLDOWN_RULES.maxReductionPercent, requestedReductionPercent);
  const effectiveCooldownSeconds = baseSeconds === 0
    ? 0
    : Math.max(
      ACTIVITY_COOLDOWN_RULES.minimumCooldownSeconds,
      Math.ceil(baseSeconds * (1 - appliedReductionPercent / 100)),
    );

  return Object.freeze({
    activity: normalizedActivity,
    baseCooldownSeconds: baseSeconds,
    effectiveCooldownSeconds,
    requestedReductionPercent,
    appliedReductionPercent,
    capped: requestedReductionPercent > appliedReductionPercent,
    modifiers: Object.freeze(modifiers),
  });
}

export const ACTIVITY_COOLDOWN_EQUIPMENT_EFFECT_CODES = Object.freeze(Object.keys(EQUIPMENT_COOLDOWN_EFFECTS));
export const ACTIVITY_COOLDOWN_BUFF_CODES = ACTIVITY_COOLDOWN_FIGHT_BUFF_CODES;
