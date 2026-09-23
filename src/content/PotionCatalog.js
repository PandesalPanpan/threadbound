/**
 * The canonical healing consumables. Inventory quantities live in SQLite;
 * this catalog owns names, bounded healing, progression gates, and stable ids.
 * The visual ids intentionally reuse the existing potion art until the asset
 * catalog grows distinct tier artwork.
 */
export const POTION_CATALOG = Object.freeze([
  Object.freeze({
    id: 'minor-health-potion',
    name: 'Minor Health Potion',
    shortName: 'Minor',
    heal: 8,
    tier: 1,
    requiredArea: 1,
    visualAssetId: 'item.health-potion.v1',
  }),
  Object.freeze({
    id: 'health-potion',
    name: 'Health Potion',
    shortName: 'Health',
    heal: 16,
    tier: 2,
    requiredArea: 2,
    visualAssetId: 'item.health-potion.v1',
  }),
  Object.freeze({
    id: 'greater-health-potion',
    name: 'Greater Health Potion',
    shortName: 'Greater',
    heal: 28,
    tier: 3,
    requiredArea: 3,
    visualAssetId: 'item.greater-health-potion.v1',
  }),
  Object.freeze({
    id: 'major-health-potion',
    name: 'Major Health Potion',
    shortName: 'Major',
    heal: 40,
    tier: 4,
    requiredArea: 4,
    visualAssetId: 'item.greater-health-potion.v1',
  }),
]);

const POTIONS_BY_ID = new Map(POTION_CATALOG.map((potion) => [potion.id, potion]));
const POTION_ALIASES = Object.freeze({
  minor: 'minor-health-potion',
  potion: 'minor-health-potion',
  health: 'health-potion',
  greater: 'greater-health-potion',
  major: 'major-health-potion',
});

function normalizedSelection(value) {
  return String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
}

export function potionById(value) {
  const key = normalizedSelection(value);
  return POTIONS_BY_ID.get(POTION_ALIASES[key] || key) || null;
}

export function potionForSelection(value) {
  if (value == null || String(value).trim() === '') return null;
  const potion = potionById(value);
  if (potion) return potion;
  const error = new Error(`Unknown potion tier “${String(value).trim()}”. Try minor, health, greater, or major.`);
  error.code = 'potion_not_found';
  throw error;
}

export function potionQuantity(rows = [], potionId) {
  const row = rows.find((entry) => String(entry?.consumableId || entry?.consumable_id || '') === potionId);
  return Math.max(0, Math.floor(Number(row?.quantity || 0)));
}

export function selectPotionForUse(rows = [], selection = null, areaNumber = Number.POSITIVE_INFINITY) {
  const currentArea = Math.max(1, Math.floor(Number(areaNumber) || 1));
  const requested = potionForSelection(selection);
  if (requested && requested.requiredArea > currentArea) {
    const error = new Error(`${requested.name} unlocks in Area ${requested.requiredArea}.`);
    error.code = 'potion_locked';
    error.requiredArea = requested.requiredArea;
    throw error;
  }
  const potion = requested || POTION_CATALOG.find((candidate) => candidate.requiredArea <= currentArea && potionQuantity(rows, candidate.id) > 0) || null;
  if (!potion) {
    const error = new Error('You have no Health Potions available. Heal naturally over time or buy another potion.');
    error.code = 'no_health_potions';
    throw error;
  }
  const quantity = potionQuantity(rows, potion.id);
  if (quantity <= 0) {
    const error = new Error(`${potion.name} is not in your inventory.`);
    error.code = 'potion_unavailable';
    throw error;
  }
  return Object.freeze({ ...potion, quantity });
}

export function projectPotionInventory(rows = [], areaNumber = 1) {
  const currentArea = Math.max(1, Math.floor(Number(areaNumber) || 1));
  return POTION_CATALOG.map((potion) => ({
    ...potion,
    quantity: potionQuantity(rows, potion.id),
    unlocked: currentArea >= potion.requiredArea,
  }));
}

export function potionOffersForArea(areaNumber = 1) {
  const currentArea = Math.max(1, Math.floor(Number(areaNumber) || 1));
  return POTION_CATALOG.filter((potion) => potion.requiredArea <= currentArea);
}
