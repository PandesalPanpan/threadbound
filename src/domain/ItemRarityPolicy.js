export const ITEM_RARITIES = Object.freeze({
  common: Object.freeze({ id: 'common', tier: 1, label: 'Common', minAttack: 1, maxAttack: 2 }),
  uncommon: Object.freeze({ id: 'uncommon', tier: 2, label: 'Uncommon', minAttack: 2, maxAttack: 3 }),
  rare: Object.freeze({ id: 'rare', tier: 3, label: 'Rare', minAttack: 3, maxAttack: 4 }),
  epic: Object.freeze({ id: 'epic', tier: 4, label: 'Epic', minAttack: 4, maxAttack: 5 }),
  legendary: Object.freeze({ id: 'legendary', tier: 5, label: 'Legendary', minAttack: 5, maxAttack: 6 }),
  mythic: Object.freeze({ id: 'mythic', tier: 6, label: 'Mythic', minAttack: 6, maxAttack: 7 }),
});

export const ITEM_RARITY_IDS = Object.freeze(Object.keys(ITEM_RARITIES));

export function isItemRarity(value) {
  return Object.hasOwn(ITEM_RARITIES, String(value || '').trim().toLowerCase());
}

export function itemRarity(value, fallback = 'common') {
  const id = String(value || '').trim().toLowerCase();
  if (ITEM_RARITIES[id]) return ITEM_RARITIES[id];
  return ITEM_RARITIES[fallback] || ITEM_RARITIES.common;
}

export function rarityTier(value) {
  return itemRarity(value).tier;
}

export function rarityLabel(value) {
  return itemRarity(value).label;
}

export function rarityFromRoll(value) {
  const roll = Number(value);
  const normalized = Number.isFinite(roll) ? Math.max(0, Math.min(1, roll)) : 0;
  if (normalized >= 0.997) return ITEM_RARITIES.mythic;
  if (normalized >= 0.985) return ITEM_RARITIES.legendary;
  if (normalized >= 0.94) return ITEM_RARITIES.epic;
  if (normalized >= 0.78) return ITEM_RARITIES.rare;
  if (normalized >= 0.42) return ITEM_RARITIES.uncommon;
  return ITEM_RARITIES.common;
}
