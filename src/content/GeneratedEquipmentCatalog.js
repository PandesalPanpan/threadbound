import { FIGMA_EQUIPMENT_LIBRARY } from './FigmaItemLibrary.js';
import { AREA_ITEM_FAMILIES } from './AreaItemFamilyCatalog.js';

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
export function generatedEquipmentOptions({ itemFamilies = null } = {}) {
  const options = {};
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
    options[slot] = Object.freeze(OFFICIAL_EQUIPMENT_VISUALS.filter((visual) => visual.slot === slot
      && (!allowedFamilies || allowedFamilies.has(visual.materialFamily))));
    if (!options[slot].length) {
      const error = new Error(`Area equipment profile has no official ${slot} items for its material families.`);
      error.code = 'area_equipment_family_unavailable';
      throw error;
    }
  }
  return Object.freeze(options);
}
