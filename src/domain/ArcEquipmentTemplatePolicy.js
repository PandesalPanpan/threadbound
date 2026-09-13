import { EQUIPMENT_SLOTS, normalizeEquipmentSlot } from './EquipmentSlotPolicy.js';
import { EQUIPMENT_BATTLE_EFFECT_RULES, EQUIPMENT_EFFECT_CATALOG } from './EquipmentBattleEffectPolicy.js';
import { ITEM_RARITIES, ITEM_RARITY_IDS } from './ItemRarityPolicy.js';

export const ARC_EQUIPMENT_STAT_KEYS = Object.freeze([
  'attackBonus',
  'defenseBonus',
  'maxHpBonus',
  'speedBonus',
  'critChanceBonus',
]);

export const ARC_EQUIPMENT_TEMPLATE_FIELDS = Object.freeze([
  'id',
  'namePattern',
  'slot',
  'rarity',
  'attackBonus',
  'stats',
  'effects',
  'requiredLevel',
  'areaNumber',
  'visualAssetId',
]);

export const ARC_EQUIPMENT_TEMPLATE_RULES = Object.freeze({
  maxRequiredLevel: 100,
  maxAreaNumber: 100,
  maxEffectsPerItem: EQUIPMENT_BATTLE_EFFECT_RULES.maxEffectsPerItem,
  maxCritChanceBonus: 1,
  levelsPerBudgetPoint: 10,
  statWeights: Object.freeze({
    attackBonus: 1,
    defenseBonus: 1,
    maxHpBonus: 0.25,
    speedBonus: 1,
    critChanceBonus: 100,
  }),
});

const FIELD_SET = new Set(ARC_EQUIPMENT_TEMPLATE_FIELDS);
const STAT_SET = new Set(ARC_EQUIPMENT_STAT_KEYS);
const RARITY_SET = new Set(ITEM_RARITY_IDS);
const EFFECT_SET = new Set(Object.keys(EQUIPMENT_EFFECT_CATALOG));

function object(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedInteger(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}.`);
  }
  return number;
}

function nonNegativeInteger(value, label) {
  const number = Number(value ?? 0);
  if (!Number.isInteger(number) || number < 0) throw new Error(`${label} must be a non-negative integer.`);
  return number;
}

function boundedNumber(value, label, minimum, maximum) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`${label} must be a number between ${minimum} and ${maximum}.`);
  }
  return number;
}

export function isExtendedArcEquipmentTemplate(template = {}) {
  return ['slot', 'stats', 'requiredLevel', 'areaNumber'].some((field) => Object.hasOwn(template || {}, field));
}

function normalizeStats(template, slot, extended) {
  const raw = extended ? template.stats : { attackBonus: template.attackBonus ?? 0 };
  if (!object(raw)) throw new Error('Equipment template stats must be an object.');
  for (const field of Object.keys(raw)) {
    if (!STAT_SET.has(field)) throw new Error(`Unsupported equipment stat field: ${field}.`);
  }

  const stats = Object.freeze({
    attackBonus: nonNegativeInteger(raw.attackBonus, 'Equipment Attack bonus'),
    defenseBonus: nonNegativeInteger(raw.defenseBonus, 'Equipment Defense bonus'),
    maxHpBonus: nonNegativeInteger(raw.maxHpBonus, 'Equipment Max HP bonus'),
    speedBonus: nonNegativeInteger(raw.speedBonus, 'Equipment Speed bonus'),
    critChanceBonus: boundedNumber(raw.critChanceBonus, 'Equipment Crit Chance bonus', 0, ARC_EQUIPMENT_TEMPLATE_RULES.maxCritChanceBonus),
  });

  if (slot !== 'weapon' && stats.attackBonus > 0) {
    throw new Error('Only Weapon templates may currently grant Attack bonus because canonical Attack reads the equipped Weapon.');
  }
  if (extended && Object.hasOwn(template, 'attackBonus') && Number(template.attackBonus) !== stats.attackBonus) {
    throw new Error('Extended equipment template attackBonus must match stats.attackBonus for migration compatibility.');
  }
  return stats;
}

function normalizeEffects(effects) {
  if (!Array.isArray(effects)) throw new Error('Equipment template effects must be an array.');
  if (effects.length > ARC_EQUIPMENT_TEMPLATE_RULES.maxEffectsPerItem) {
    throw new Error(`Equipment template may contain at most ${ARC_EQUIPMENT_TEMPLATE_RULES.maxEffectsPerItem} effects.`);
  }
  const normalized = effects.map((value) => String(value || '').trim().toLowerCase());
  if (new Set(normalized).size !== normalized.length) throw new Error('Equipment template effects must be unique.');
  for (const effect of normalized) {
    if (!EFFECT_SET.has(effect)) throw new Error(`Unsupported equipment effect code: ${effect || '(empty)'}.`);
  }
  if (normalized.includes('none') && normalized.length > 1) throw new Error('The none equipment effect cannot be combined with another effect.');
  return Object.freeze(normalized);
}

export function arcEquipmentBudgetLimit({ rarity, requiredLevel, areaNumber }) {
  const rarityModel = ITEM_RARITIES[rarity];
  if (!rarityModel) throw new Error(`Unsupported equipment rarity: ${rarity || '(empty)'}.`);
  return rarityModel.maxAttack
    + Math.max(0, areaNumber - 1)
    + Math.floor(Math.max(0, requiredLevel - 1) / ARC_EQUIPMENT_TEMPLATE_RULES.levelsPerBudgetPoint);
}

export function arcEquipmentBudgetUsed({ stats, effects }) {
  const weights = ARC_EQUIPMENT_TEMPLATE_RULES.statWeights;
  const nonPlainEffects = effects.filter((effect) => effect !== 'none').length;
  const used = (stats.attackBonus * weights.attackBonus)
    + (stats.defenseBonus * weights.defenseBonus)
    + (stats.maxHpBonus * weights.maxHpBonus)
    + (stats.speedBonus * weights.speedBonus)
    + (stats.critChanceBonus * weights.critChanceBonus)
    + nonPlainEffects;
  return Math.round(used * 1000) / 1000;
}

export function normalizeArcEquipmentTemplate(template = {}) {
  if (!object(template)) throw new Error('Equipment template must be an object.');
  for (const field of Object.keys(template)) {
    if (!FIELD_SET.has(field)) throw new Error(`Unsupported equipment template field: ${field}.`);
  }

  const extended = isExtendedArcEquipmentTemplate(template);
  if (extended) {
    for (const field of ['slot', 'stats', 'requiredLevel', 'areaNumber']) {
      if (!Object.hasOwn(template, field)) throw new Error(`Extended equipment template requires ${field}.`);
    }
  }

  const slot = normalizeEquipmentSlot(extended ? template.slot : 'weapon');
  const rarity = String(template.rarity || '').trim().toLowerCase();
  if (!RARITY_SET.has(rarity)) throw new Error(`Unsupported equipment rarity: ${rarity || '(empty)'}.`);
  const requiredLevel = extended
    ? boundedInteger(template.requiredLevel, 'Equipment requiredLevel', 1, ARC_EQUIPMENT_TEMPLATE_RULES.maxRequiredLevel)
    : 1;
  const areaNumber = extended
    ? boundedInteger(template.areaNumber, 'Equipment areaNumber', 1, ARC_EQUIPMENT_TEMPLATE_RULES.maxAreaNumber)
    : 1;
  const stats = normalizeStats(template, slot, extended);
  const effects = normalizeEffects(template.effects);
  const budgetLimit = arcEquipmentBudgetLimit({ rarity, requiredLevel, areaNumber });
  const budgetUsed = arcEquipmentBudgetUsed({ stats, effects });
  if (budgetUsed > budgetLimit) {
    throw new Error(`Equipment template power budget ${budgetUsed} exceeds ${budgetLimit} for ${rarity}, level ${requiredLevel}, Area ${areaNumber}.`);
  }

  return Object.freeze({
    extended,
    slot,
    rarity,
    requiredLevel,
    areaNumber,
    stats,
    effects,
    budget: Object.freeze({ used: budgetUsed, limit: budgetLimit }),
  });
}

export function publicArcEquipmentTemplateContract() {
  return Object.freeze({
    slots: Object.freeze([...EQUIPMENT_SLOTS]),
    rarities: Object.freeze([...ITEM_RARITY_IDS]),
    statKeys: Object.freeze([...ARC_EQUIPMENT_STAT_KEYS]),
    effectCodes: Object.freeze(Object.keys(EQUIPMENT_EFFECT_CATALOG)),
    rules: ARC_EQUIPMENT_TEMPLATE_RULES,
    budget: 'rarity.maxAttack + (Area - 1) + floor((requiredLevel - 1) / 10); weighted stats plus non-plain effects must fit the result',
  });
}
