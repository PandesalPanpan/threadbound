import { FIGMA_EQUIPMENT_LIBRARY } from './FigmaItemLibrary.js';
import { AREA_ITEM_FAMILIES } from './AreaItemFamilyCatalog.js';
import { ITEM_RARITY_IDS } from '../domain/ItemRarityPolicy.js';

// Each area's slot families are ordered from its entry material to its most
// advanced material. Rarity selects a progressively later family; if an Area
// has fewer families for a slot, the highest available family is reused.
const RARITY_FAMILY_INDEX = Object.freeze({
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
});

function officialEquipmentVisuals() {
  const ordinalBySlot = new Map();
  const entries = FIGMA_EQUIPMENT_LIBRARY.map((authored) => {
    const ordinal = ordinalBySlot.get(authored.slot) || 0;
    ordinalBySlot.set(authored.slot, ordinal + 1);
    const areaNumber = (ordinal % 4) + 1;
    const areaItemIndex = Math.floor(ordinal / 4);
    const materialFamilies = AREA_ITEM_FAMILIES[areaNumber][authored.slot];
    return Object.freeze({
      visualAssetId: authored.visualAssetId,
      label: authored.label,
      slot: authored.slot,
      family: authored.family,
      materialFamily: materialFamilies[areaItemIndex % materialFamilies.length],
      sourceNodeId: authored.sourceNodeId,
      sourceCollection: authored.sourceCollection,
    });
  });
  return Object.freeze(entries);
}

export const OFFICIAL_EQUIPMENT_VISUALS = officialEquipmentVisuals();

/**
 * Returns data-only item templates for an application/content boundary to pass to
 * ItemGenerator. No URL, crop, or runtime asset detail enters the domain policy.
 */
export function generatedEquipmentOptions({ itemFamilies = null, rarity = null } = {}) {
  const options = {};
  const normalizedRarity = rarity == null ? null : String(rarity).trim().toLowerCase();
  if (normalizedRarity && !ITEM_RARITY_IDS.includes(normalizedRarity)) {
    throw new Error(`Unknown equipment rarity family tier: ${rarity}.`);
  }
  for (const slot of ['weapon', 'helmet', 'armor', 'boots', 'accessory']) {
    const hasSlotProfile = itemFamilies && typeof itemFamilies === 'object' && Object.hasOwn(itemFamilies, slot);
    const familyPool = hasSlotProfile ? itemFamilies[slot] : null;
    if (hasSlotProfile && (!Array.isArray(familyPool) || familyPool.length === 0)) {
      const error = new Error(`Area equipment profile must include at least one ${slot} material family.`);
      error.code = 'area_equipment_family_required';
      throw error;
    }
    const allowedFamilies = hasSlotProfile
      ? new Set(familyPool.map((family) => String(family).trim().toLowerCase()))
      : null;
    let slotVisuals = OFFICIAL_EQUIPMENT_VISUALS.filter((visual) => visual.slot === slot
      && (!allowedFamilies || allowedFamilies.has(visual.materialFamily)));
    if (normalizedRarity) {
      if (!hasSlotProfile) {
        throw new Error(`Rarity-specific equipment options require an Area ${slot} family profile.`);
      }
      const availableFamilies = familyPool.map((family) => String(family).trim().toLowerCase())
        .filter((family, index, values) => values.indexOf(family) === index)
        .filter((family) => slotVisuals.some((visual) => visual.materialFamily === family));
      if (availableFamilies.length === 0) {
        throw new Error(`Area equipment profile has no official ${slot} material families.`);
      }
      const familyIndex = Math.min(RARITY_FAMILY_INDEX[normalizedRarity], availableFamilies.length - 1);
      const selectedFamily = availableFamilies[familyIndex];
      slotVisuals = slotVisuals.filter((visual) => visual.materialFamily === selectedFamily);
    }
    options[slot] = Object.freeze(slotVisuals);
    if (!options[slot].length) {
      const error = new Error(`Area equipment profile has no official ${slot} items for its material families.`);
      error.code = 'area_equipment_family_unavailable';
      throw error;
    }
  }
  return Object.freeze(options);
}

/** Builds Area-scoped visual allowlists indexed by the already-rolled rarity. */
export function generatedEquipmentOptionsByRarity({ itemFamilies } = {}) {
  return Object.freeze(Object.fromEntries(ITEM_RARITY_IDS.map((rarity) => [
    rarity,
    generatedEquipmentOptions({ itemFamilies, rarity }),
  ])));
}
