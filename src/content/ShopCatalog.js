export const SHOP_VENDOR = Object.freeze({
  id: 'mara-field-merchant',
  name: 'Mara',
  tagline: 'Patch the weave before it breaks.',
  characterVariant: 'female',
});

export const SHOP_OFFERS = Object.freeze([
  Object.freeze({
    sku: 'single',
    kind: 'health_potion',
    name: 'Health potion',
    description: '1 potion · restores 12 Hunt HP',
    visualAssetId: 'item.health-potion.v1',
    cost: 5,
    quantity: 1,
  }),
  Object.freeze({
    sku: 'satchel',
    kind: 'health_potion',
    name: 'Potion satchel',
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
