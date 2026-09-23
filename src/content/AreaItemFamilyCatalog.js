function freezeSlotFamilies(families) {
  return Object.freeze(Object.fromEntries(Object.entries(families).map(([slot, values]) => [slot, Object.freeze([...values])])));
}

export const AREA_ITEM_FAMILIES = Object.freeze({
  1: freezeSlotFamilies({
    weapon: ['wood', 'iron'],
    helmet: ['leather', 'iron'],
    armor: ['wood', 'leather', 'iron'],
    boots: ['leather'],
    accessory: ['lucky', 'white'],
  }),
  2: freezeSlotFamilies({
    weapon: ['steel', 'nature'],
    helmet: ['steel', 'fire'],
    armor: ['steel', 'nature'],
    boots: ['iron', 'royal'],
    accessory: ['silver', 'royal', 'water'],
  }),
  3: freezeSlotFamilies({
    weapon: ['fire', 'ice', 'arcane'],
    helmet: ['ice', 'steel'],
    armor: ['fire', 'ice', 'arcane'],
    boots: ['ice', 'gold'],
    accessory: ['moon', 'silver', 'water'],
  }),
  4: freezeSlotFamilies({
    weapon: ['void', 'holy', 'gold'],
    helmet: ['void', 'gold', 'holy'],
    armor: ['void', 'holy', 'arcane'],
    boots: ['void', 'holy', 'gold'],
    accessory: ['void', 'holy', 'gold', 'sun', 'angel'],
  }),
});
