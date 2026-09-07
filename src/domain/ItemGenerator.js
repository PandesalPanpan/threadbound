import { randomUUID } from 'node:crypto';

export const ITEM_EFFECTS = Object.freeze({
  none: Object.freeze({ code: 'none', name: 'Plain Weave', description: 'No special combat effect.' }),
  opening_strike: Object.freeze({ code: 'opening_strike', name: 'Opening Stitch', description: '+2 damage on the first strike of every encounter.' }),
  boss_bane: Object.freeze({ code: 'boss_bane', name: 'Severing', description: '+2 damage against bosses.' }),
});

const PREFIXES = ['Frayed', 'Gleaming', 'Hollow', 'Bound'];
const BASES = ['Needle', 'Threadblade', 'Spindle', 'Shears'];
const SUFFIXES = ['of Echoes', 'of the Loom', 'of Severance', 'of Dawn'];
const EFFECT_CODES = Object.keys(ITEM_EFFECTS);

export class ItemGenerator {
  constructor({ rng = Math.random, idFactory = randomUUID } = {}) {
    this.rng = rng;
    this.idFactory = idFactory;
  }

  generateReward({ source = 'frayed-hollow' } = {}) {
    const pick = (values) => values[Math.floor(this.rng() * values.length) % values.length];
    const effectCode = pick(EFFECT_CODES);
    return {
      id: this.idFactory(),
      definitionId: 'generated-weapon',
      name: `${pick(PREFIXES)} ${pick(BASES)} ${pick(SUFFIXES)}`,
      slot: 'weapon',
      rarity: this.rng() > 0.82 ? 'rare' : 'common',
      attackBonus: 1 + Math.floor(this.rng() * 3),
      effectCode,
      effect: ITEM_EFFECTS[effectCode],
      source,
    };
  }
}
