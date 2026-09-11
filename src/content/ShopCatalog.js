export const SHOP_VENDOR = Object.freeze({
  id: 'mara-field-merchant',
  name: 'Mara',
  tagline: 'Gear up, patch up, get back out there.',
  characterVariant: 'female',
});

export const SHOP_OFFERS = Object.freeze([
  Object.freeze({
    sku: 'bronze-sword',
    kind: 'equipment',
    name: 'Bronze Sword',
    description: 'Common Weapon · +1 Attack',
    visualAssetId: 'item.steel-sword.v1',
    cost: 8,
    quantity: 1,
    itemTemplate: Object.freeze({
      definitionId: 'shop-bronze-sword',
      name: 'Bronze Sword',
      slot: 'weapon',
      rarity: 'common',
      attackBonus: 1,
      effectCode: 'none',
      effect: Object.freeze({ code: 'none', name: 'Plain', description: 'Reliable starter equipment.', upgradeLevel: 0, attunementCode: null }),
      visualAssetId: 'item.steel-sword.v1',
    }),
  }),
  Object.freeze({
    sku: 'single',
    kind: 'health_potion',
    name: 'Health Potion',
    description: '1 potion · restores 12 Hunt HP',
    visualAssetId: 'item.health-potion.v1',
    cost: 5,
    quantity: 1,
  }),
  Object.freeze({
    sku: 'satchel',
    kind: 'health_potion',
    name: 'Potion Satchel',
    description: '3 potions · save 3 Gold',
    visualAssetId: 'item.greater-health-potion.v1',
    cost: 12,
    quantity: 3,
  }),
]);

const OFFERS_BY_SKU = new Map(SHOP_OFFERS.map((offer) => [offer.sku, offer]));

export function shopOffer(sku) {
  return OFFERS_BY_SKU.get(String(sku || '').trim().toLowerCase()) || null;
}
