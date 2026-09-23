import { potionById } from './PotionCatalog.js';

export const SHOP_VENDOR = Object.freeze({
  id: 'mara-field-merchant',
  name: 'Mara',
  tagline: 'Gear up, patch up, get back out there.',
  characterVariant: 'female',
  visualAssetId: 'character.market-guard.v1',
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
    potionId: 'minor-health-potion',
    name: 'Minor Health Potion',
    description: '1x Minor Health Potion · +8 HP',
    heal: potionById('minor-health-potion').heal,
    requiredArea: potionById('minor-health-potion').requiredArea,
    visualAssetId: potionById('minor-health-potion').visualAssetId,
    cost: 5,
    quantity: 1,
  }),
  Object.freeze({
    sku: 'satchel',
    kind: 'health_potion',
    potionId: 'minor-health-potion',
    name: 'Minor Potion Satchel',
    description: '3x Minor Health Potion · +8 HP each',
    heal: potionById('minor-health-potion').heal,
    requiredArea: potionById('minor-health-potion').requiredArea,
    visualAssetId: potionById('minor-health-potion').visualAssetId,
    cost: 12,
    quantity: 3,
  }),
  Object.freeze({
    sku: 'health-potion',
    kind: 'health_potion',
    potionId: 'health-potion',
    name: 'Health Potion',
    description: '1x Health Potion · +16 HP · Area 2+',
    heal: potionById('health-potion').heal,
    requiredArea: potionById('health-potion').requiredArea,
    visualAssetId: potionById('health-potion').visualAssetId,
    cost: 10,
    quantity: 1,
  }),
  Object.freeze({
    sku: 'greater-health-potion',
    kind: 'health_potion',
    potionId: 'greater-health-potion',
    name: 'Greater Health Potion',
    description: '1x Greater Health Potion · +28 HP · Area 3+',
    heal: potionById('greater-health-potion').heal,
    requiredArea: potionById('greater-health-potion').requiredArea,
    visualAssetId: potionById('greater-health-potion').visualAssetId,
    cost: 18,
    quantity: 1,
  }),
  Object.freeze({
    sku: 'major-health-potion',
    kind: 'health_potion',
    potionId: 'major-health-potion',
    name: 'Major Health Potion',
    description: '1x Major Health Potion · +40 HP · Area 4+',
    heal: potionById('major-health-potion').heal,
    requiredArea: potionById('major-health-potion').requiredArea,
    visualAssetId: potionById('major-health-potion').visualAssetId,
    cost: 30,
    quantity: 1,
  }),
]);

const OFFERS_BY_SKU = new Map(SHOP_OFFERS.map((offer) => [offer.sku, offer]));

export function shopOffer(sku) {
  return OFFERS_BY_SKU.get(String(sku || '').trim().toLowerCase()) || null;
}
