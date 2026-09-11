import { randomUUID } from 'node:crypto';

export const ITEM_EFFECTS = Object.freeze({
  none: Object.freeze({ code: 'none', name: 'Plain Weave', description: 'No special combat effect.' }),
  opening_strike: Object.freeze({ code: 'opening_strike', name: 'Opening Stitch', description: '+2 damage on the first strike of every encounter.' }),
  boss_bane: Object.freeze({ code: 'boss_bane', name: 'Severing', description: '+2 damage against bosses.' }),
});

export const ITEM_RARITIES = Object.freeze({
  common: Object.freeze({ id: 'common', tier: 1, label: 'Common', minAttack: 1, maxAttack: 2 }),
  uncommon: Object.freeze({ id: 'uncommon', tier: 2, label: 'Uncommon', minAttack: 2, maxAttack: 3 }),
  rare: Object.freeze({ id: 'rare', tier: 3, label: 'Rare', minAttack: 3, maxAttack: 4 }),
  epic: Object.freeze({ id: 'epic', tier: 4, label: 'Epic', minAttack: 4, maxAttack: 5 }),
  legendary: Object.freeze({ id: 'legendary', tier: 5, label: 'Legendary', minAttack: 5, maxAttack: 6 }),
});

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

function rarityFromRoll(roll) {
  if (roll >= 0.985) return ITEM_RARITIES.legendary;
  if (roll >= 0.94) return ITEM_RARITIES.epic;
  if (roll >= 0.78) return ITEM_RARITIES.rare;
  if (roll >= 0.42) return ITEM_RARITIES.uncommon;
  return ITEM_RARITIES.common;
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
      effect: { ...ITEM_EFFECTS[effectCode], upgradeLevel: 0, attunementCode: null },
      visualAssetId: VISUAL_ASSET_BY_BASE[base],
      source,
    };
  }
}
