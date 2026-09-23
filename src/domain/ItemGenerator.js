import { randomUUID } from 'node:crypto';
import { arcEquipmentBudgetLimit, arcEquipmentBudgetUsed, normalizeArcEquipmentTemplate } from './ArcEquipmentTemplatePolicy.js';
import { EQUIPMENT_SLOTS } from './EquipmentSlotPolicy.js';
import { EQUIPMENT_EFFECT_CATALOG } from './EquipmentBattleEffectPolicy.js';
import { ITEM_RARITIES, rarityFromWeightedRoll } from './ItemRarityPolicy.js';

export { ITEM_RARITIES } from './ItemRarityPolicy.js';

// Compatibility export for existing Arc validation, services, and persisted items.
// Mechanics are authoritative only when resolved through EquipmentBattleEffectPolicy
// by effectCode; serialized item.effect data is never executable.
export const ITEM_EFFECTS = EQUIPMENT_EFFECT_CATALOG;

const RARITY_PREFIXES = Object.freeze({
  common: 'Worn',
  uncommon: 'Sturdy',
  rare: 'Gleaming',
  epic: 'Runed',
  legendary: 'Royal',
  mythic: 'Mythic',
});
const EFFECT_CODES = Object.keys(ITEM_EFFECTS);
const NON_PLAIN_EFFECT_CODES = EFFECT_CODES.filter((code) => code !== 'none');

function randomFraction(rng) {
  const value = Number(rng());
  return Number.isFinite(value) ? Math.max(0, Math.min(0.999999999, value)) : 0;
}

function pick(values, rng) {
  if (!values.length) throw new Error('Generated equipment has no catalog entries for its slot and Area.');
  return values[Math.floor(randomFraction(rng) * values.length)];
}

function normalizeArea(areaNumber) {
  return Math.max(1, Math.min(100, Math.floor(Number(areaNumber)) || 1));
}

function generatedStats({ slot, rarity, areaNumber, effectCode, rng }) {
  const requiredLevel = 1;
  const budgetLimit = arcEquipmentBudgetLimit({ rarity: rarity.id, requiredLevel, areaNumber });
  const points = Math.max(1, budgetLimit - (effectCode === 'none' ? 0 : 1));
  const stats = {
    attackBonus: 0,
    defenseBonus: 0,
    maxHpBonus: 0,
    speedBonus: 0,
    critChanceBonus: 0,
  };

  if (slot === 'weapon') {
    const maximum = Math.min(rarity.maxAttack, points);
    const minimum = Math.min(rarity.minAttack, maximum);
    stats.attackBonus = minimum + Math.floor(randomFraction(rng) * (maximum - minimum + 1));
  } else if (slot === 'helmet') {
    stats.defenseBonus = Math.max(1, Math.floor(points * 0.6));
    stats.maxHpBonus = Math.max(0, (points - stats.defenseBonus) * 4);
  } else if (slot === 'armor') {
    stats.defenseBonus = Math.max(1, Math.floor(points * 0.4));
    stats.maxHpBonus = Math.max(0, (points - stats.defenseBonus) * 4);
  } else if (slot === 'boots') {
    stats.speedBonus = Math.max(1, Math.ceil(points * 0.6));
    const remainder = Math.max(0, points - stats.speedBonus);
    if (remainder > 0 && randomFraction(rng) < 0.5) stats.defenseBonus = remainder;
    else stats.maxHpBonus = remainder * 4;
  } else if (slot === 'accessory') {
    stats.critChanceBonus = points / 100;
  }

  const budgetUsed = arcEquipmentBudgetUsed({ stats, effects: [effectCode] });
  if (budgetUsed > budgetLimit) throw new Error(`Generated ${slot} exceeded its equipment budget.`);
  return { stats, requiredLevel, budget: { used: budgetUsed, limit: budgetLimit } };
}

function serializableEffect(definition, equipmentTemplate) {
  return {
    code: definition.code,
    name: definition.name,
    description: definition.description,
    mechanics: definition.mechanics.map((mechanic) => ({
      ...mechanic,
      ...(mechanic.effect ? { effect: { ...mechanic.effect } } : {}),
    })),
    upgradeLevel: 0,
    attunementCode: null,
    equipmentTemplate: {
      effectCodes: [...equipmentTemplate.effects],
      weaponFamily: equipmentTemplate.weaponFamily,
      itemFamily: equipmentTemplate.itemFamily,
      materialFamily: equipmentTemplate.materialFamily,
      requiredLevel: equipmentTemplate.requiredLevel,
      areaNumber: equipmentTemplate.areaNumber,
      stats: { ...equipmentTemplate.stats },
      budget: { ...equipmentTemplate.budget },
    },
  };
}

export class ItemGenerator {
  constructor({ rng = Math.random, idFactory = randomUUID, equipmentOptions = null, equipmentOptionsByRarity = null } = {}) {
    this.rng = rng;
    this.idFactory = idFactory;
    this.equipmentOptions = equipmentOptions;
    this.equipmentOptionsByRarity = equipmentOptionsByRarity;
  }

  generateReward({
    source = 'frayed-hollow',
    areaNumber = 1,
    slot = null,
    rarityWeights = null,
    equipmentOptions = this.equipmentOptions,
    equipmentOptionsByRarity = this.equipmentOptionsByRarity,
  } = {}) {
    const area = normalizeArea(areaNumber);
    const itemSlot = slot ? String(slot).trim().toLowerCase() : pick(EQUIPMENT_SLOTS, this.rng);
    if (!EQUIPMENT_SLOTS.includes(itemSlot)) {
      const error = new Error(`Unknown generated equipment slot: ${slot}`);
      error.code = 'invalid_equipment_slot';
      throw error;
    }

    const rarity = rarityFromWeightedRoll(randomFraction(this.rng), rarityWeights);
    const effectPool = rarity.tier >= 3 ? NON_PLAIN_EFFECT_CODES : EFFECT_CODES;
    const effectCode = pick(effectPool, this.rng);
    const visuals = equipmentOptionsByRarity == null
      ? equipmentOptions?.[itemSlot]
      : equipmentOptionsByRarity[rarity.id]?.[itemSlot];
    if (!Array.isArray(visuals) || visuals.length === 0) {
      const error = new Error(`Generated equipment requires application-selected official ${itemSlot} item options.`);
      error.code = 'generated_equipment_options_required';
      throw error;
    }
    const visual = pick(visuals, this.rng);
    if (!visual.visualAssetId || !visual.label || visual.slot !== itemSlot) {
      const error = new Error(`Invalid application-selected item data for ${itemSlot}.`);
      error.code = 'invalid_generated_equipment_option';
      throw error;
    }
    const family = visual.family || null;
    const materialFamily = visual.materialFamily || null;
    const { stats, requiredLevel, budget } = generatedStats({ slot: itemSlot, rarity, areaNumber: area, effectCode, rng: this.rng });
    const template = normalizeArcEquipmentTemplate({
      id: `generated-${itemSlot}-${area}`,
      namePattern: visual.label,
      slot: itemSlot,
      rarity: rarity.id,
      attackBonus: stats.attackBonus,
      stats,
      effects: [effectCode],
      requiredLevel,
      areaNumber: area,
      visualAssetId: visual.visualAssetId,
    });
    const weaponFamily = itemSlot === 'weapon' ? family : null;
    const itemFamily = family;
    return {
      id: this.idFactory(),
      definitionId: `generated-${itemSlot}-area-${area}`,
      name: `${RARITY_PREFIXES[rarity.id]} ${visual.label}`,
      slot: itemSlot,
      rarity: rarity.id,
      rarityTier: rarity.tier,
      ...stats,
      effectCode,
      effectCodes: [...template.effects],
      effect: serializableEffect(ITEM_EFFECTS[effectCode], {
        effects: template.effects,
        weaponFamily,
        itemFamily,
        materialFamily,
        requiredLevel: template.requiredLevel,
        areaNumber: template.areaNumber,
        stats: template.stats,
        budget: template.budget,
      }),
      weaponFamily,
      itemFamily,
      materialFamily,
      requiredLevel,
      areaNumber: area,
      equipmentBudget: budget,
      visualAssetId: visual.visualAssetId,
      source,
    };
  }
}
