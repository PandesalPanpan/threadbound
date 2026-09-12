import { randomUUID } from 'node:crypto';
import { EQUIPMENT_EFFECT_CATALOG } from './EquipmentBattleEffectPolicy.js';
import { ITEM_RARITIES, rarityFromRoll } from './ItemRarityPolicy.js';

export { ITEM_RARITIES } from './ItemRarityPolicy.js';

// Compatibility export for existing Arc validation, services, and persisted items.
// Mechanics are authoritative only when resolved through EquipmentBattleEffectPolicy
// by effectCode; serialized item.effect data is never executable.
export const ITEM_EFFECTS = EQUIPMENT_EFFECT_CATALOG;

const PREFIXES = ['Frayed', 'Gleaming', 'Hollow', 'Bound'];
const BASES = ['Needle', 'Threadblade', 'Spindle', 'Shears'];
const SUFFIXES = ['of Echoes', 'of the Loom', 'of Severance', 'of Dawn'];
const EFFECT_CODES = Object.keys(ITEM_EFFECTS);
const VISUAL_ASSET_BY_BASE = Object.freeze({
  Needle: 'item.steel-dagger.v1',
  Threadblade: 'item.steel-sword.v1',
  Spindle: 'item.arcane-staff.v1',
  Shears: 'item.iron-dagger.v1',
});

function serializableEffect(definition) {
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
  };
}

export class ItemGenerator {
  constructor({ rng = Math.random, idFactory = randomUUID } = {}) {
    this.rng = rng;
    this.idFactory = idFactory;
  }

  generateReward({ source = 'frayed-hollow' } = {}) {
    const pick = (values) => values[Math.floor(this.rng() * values.length) % values.length];
    const rarity = rarityFromRoll(this.rng());
    const effectPool = rarity.tier >= 3 ? EFFECT_CODES.filter((code) => code !== 'none') : EFFECT_CODES;
    const effectCode = pick(effectPool);
    const attackBonus = rarity.minAttack + Math.floor(this.rng() * (rarity.maxAttack - rarity.minAttack + 1));
    const prefix = pick(PREFIXES);
    const base = pick(BASES);
    const suffix = pick(SUFFIXES);
    return {
      id: this.idFactory(),
      definitionId: 'generated-weapon',
      name: `${prefix} ${base} ${suffix}`,
      slot: 'weapon',
      rarity: rarity.id,
      rarityTier: rarity.tier,
      attackBonus,
      effectCode,
      effect: serializableEffect(ITEM_EFFECTS[effectCode]),
      visualAssetId: VISUAL_ASSET_BY_BASE[base],
      source,
    };
  }
}
