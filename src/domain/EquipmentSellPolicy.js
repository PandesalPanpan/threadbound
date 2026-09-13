const SELL_VALUE_BY_RARITY = Object.freeze({
  common: 4,
  uncommon: 7,
  rare: 12,
  epic: 20,
  legendary: 32,
  mythic: 50,
});

function normalizedRarity(item) {
  const rarity = String(item?.rarity || '').trim().toLowerCase();
  return SELL_VALUE_BY_RARITY[rarity] === undefined ? 'common' : rarity;
}

export function equipmentSellValue(item) {
  const base = SELL_VALUE_BY_RARITY[normalizedRarity(item)];
  const attackBonus = Math.max(0, Math.floor(Number(item?.attackBonus ?? item?.attack_bonus ?? 0) || 0));
  return base + Math.floor(attackBonus / 2);
}

export function equipmentSellProtectionReason(item) {
  if (!item || typeof item !== 'object') return 'missing_item';
  if (String(item.source || '').trim().toLowerCase() === 'honey-purchase') return 'honey_purchase';
  if (item.bound === true || item.protected === true) return 'protected';
  const effect = item.effect && typeof item.effect === 'object' ? item.effect : {};
  if (effect.bound === true || effect.protected === true) return 'protected';
  if (['bound', 'protected'].includes(String(effect.lossProtection || '').trim().toLowerCase())) return 'protected';
  return null;
}

export function assertEquipmentSellable(item) {
  const reason = equipmentSellProtectionReason(item);
  if (!reason) return;
  const error = new Error(reason === 'honey_purchase'
    ? 'Honey-purchased equipment cannot be sold for Gold.'
    : 'Bound or protected equipment cannot be sold.');
  error.code = reason === 'honey_purchase' ? 'honey_item_cannot_be_sold' : 'protected_item_cannot_be_sold';
  throw error;
}

export { SELL_VALUE_BY_RARITY };
