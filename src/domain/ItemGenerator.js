import { randomUUID } from 'node:crypto';
import { ITEM_RARITIES, rarityFromRoll } from './ItemRarityPolicy.js';

export { ITEM_RARITIES } from './ItemRarityPolicy.js';

export const ITEM_EFFECTS = Object.freeze({
  none: Object.freeze({ code: 'none', name: 'Plain Weave', description: 'No special combat effect.' }),
  opening_strike: Object.freeze({ code: 'opening_strike', name: 'Opening Stitch', description: '+2 damage on the first strike of every encounter.' }),
  boss_bane: Object.freeze({ code: 'boss_bane', name: 'Severing', description: '+2 damage against bosses.' }),
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
