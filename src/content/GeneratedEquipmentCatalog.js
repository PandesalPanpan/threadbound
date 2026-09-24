import { FIGMA_EQUIPMENT_LIBRARY } from './FigmaItemLibrary.js';
import { ITEM_RARITY_IDS } from '../domain/ItemRarityPolicy.js';

// These family tags describe the authored equipment itself. Keep the mapping
// label-based so rearranging the Figma library cannot silently change an item's
// material identity.
const MATERIAL_FAMILY_GROUPS = Object.freeze({
  wood: [
    'Ashbite Sword', 'Ashen Broadsword', 'Ashwood Axe', 'Ashstring Bow',
    'Threadwind Bow', 'Ashen Sling',
  ],
  iron: [
    'Guildwatch Blade', 'Ironroot Greatsword', 'Bronze Wardblade', 'Coilblade',
    'Guildbreaker Mace', 'Ironroot Hammer', 'Copperhead Axe', 'Guildwatch Longbow',
    'Ironroot Shortbow', 'Copper Sparkstaff', 'Bronze Repeater', 'Bronzeweave Coat',
  ],
  leather: ['Bonecrest Helm', 'Cinder Boots', 'Crownless Cloak'],
  lucky: ['Briar Gauntlets'],
  white: ['Glasswind Gloves'],
  steel: [
    'Threadsteel Longsword', 'Threadpiercer', 'Hearthsteel Sword', 'Threadsteel Axe',
    'Threadhook Scythe', 'Threadcaster Orb', 'Guildplate Coat', 'Stormglass Helm',
  ],
  nature: [
    'Bramble Falchion', 'Mirefang', 'Honeyed Blade', 'Copperleaf Sword', 'Briar Knife',
    'Briar Halberd', 'Honeycomb Mace', 'Mirehook Glaive', 'Bronzebloom Hammer',
    'Ironvine Axe', 'Skyroot Poleaxe', 'Ironvine Tome', 'Ironroot Cuirass',
    'Honeycomb Belt', 'Mirehide Gloves', 'Briar Throwing Knife', 'Mirethorn Darts',
    'Ironvine Gauntlets',
  ],
  fire: [
    'Ember Edge', 'Cinder Cleaver', 'Emberthorn', 'Ember Maul', 'Cinder Pike',
    'Hearth Maul', 'Emberbell Flail', 'Cinderwake Scythe', 'Ashcoil Mace',
    'Ember Crossbow', 'Cinder Javelin', 'Hearth Wand', 'Embercoil Wand',
    'Cinder Quiver', 'Ember Helm', 'Cinder Mantle', 'Hearthstone Band', 'Guildspark Cannon',
  ],
  royal: ['Warden Boots', 'Guildmark Belt'],
  silver: ['Copperloop Ring'],
  water: [
    'Glasswind Scimitar', 'Glasswind Glaive', 'Rainspike Spear', 'Stormstake Spear', 'Stormcurve Blade',
    'Glasswind Chakram', 'Rain Orb', 'Stormglass Bow', 'Rainthread Pendant',
  ],
  ice: [
    'Moonlit Saber', 'Frostglass Dagger', 'Moonspike Spear', 'Frostbranch Axe',
    'Moonshot Dart', 'Frostbranch Wand', 'Moonstep Greaves',
  ],
  gold: [
    'Vaultbreaker', 'Vault Mace', 'Crownsplitter Axe', 'Goldleaf Halberd',
    'Goldleaf Focus', 'Goldleaf Charm',
  ],
  moon: ['Frostweave Sash'],
  arcane: [
    'Violet Needle', 'Violet Repeater', 'Runebreaker', 'Lantern Knife', 'Prism Edge', 'Violet Warhammer',
    'Starfall Greatblade', 'Starfall Hammer', 'Lantern Poleaxe', 'Prism Maul', 'Vault Grimoire',
    'Starfall Staff', 'Honey Rune Tome', 'Lantern Arcbow', 'Prism Staff',
    'Starfall Cloak', 'Vault Amulet', 'Prism Ring', 'Skyshard Pendant',
    'Skyshard Blade', 'Skyshard Orb', 'Dusklight Focus',
  ],
  void: [
    'Hollow Fang', 'Nightweave Dirk', 'Crownless Sword', 'Riftglass Saber',
    'Duskwire Knife', 'Gloam Razor', 'Bonewhite Dagger', 'Gravehook Saber',
    'Duskhook Halberd', 'Gravewake Scythe', 'Rift Pike', 'Bonewheel Mace',
    'Nightbell Flail', 'Gloam Pike', 'Gloam Staff', 'Graveglass Orb',
    'Rift Scepter', 'Bonewire Crossbow', 'Nightcoil Tome', 'Crownless Wand',
    'Violet Visor', 'Dusk Mantle', 'Gloam Greaves', 'Graveward Charm', 'Rift Brooch',
    'Nightcoil Amulet',
  ],
  holy: [
    'Dawn Rapier', 'Sunspoke Sword', 'Warden Shortsword', 'Wanderer’s Blade',
    'Sunforge Hammer', 'Warden Spear', 'Guildstone Maul',
    'Wanderer’s Spear', 'Sunforge Hand Cannon', 'Warden Longbow', 'Wanderer’s Focus',
    'Sunforge Plate', 'Wanderer’s Brooch',
  ],
  sun: ['Emberstone Ring'],
  angel: ['Threadbound Belt'],
});

function materialFamiliesByLabel() {
  const byLabel = new Map();
  for (const [materialFamily, labels] of Object.entries(MATERIAL_FAMILY_GROUPS)) {
    for (const label of labels) {
      if (byLabel.has(label)) {
        throw new Error(`Equipment label ${label} has more than one material family.`);
      }
      byLabel.set(label, materialFamily);
    }
  }

  const equipmentLabels = new Set(FIGMA_EQUIPMENT_LIBRARY.map(({ label }) => label));
  const missing = [...equipmentLabels].filter((label) => !byLabel.has(label));
  const unknown = [...byLabel.keys()].filter((label) => !equipmentLabels.has(label));
  if (missing.length || unknown.length) {
    throw new Error(`Equipment material family mapping mismatch (missing: ${missing.join(', ') || 'none'}; unknown: ${unknown.join(', ') || 'none'}).`);
  }
  return byLabel;
}

const MATERIAL_FAMILY_BY_LABEL = materialFamiliesByLabel();

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
  const entries = FIGMA_EQUIPMENT_LIBRARY.map((authored) => {
    return Object.freeze({
      visualAssetId: authored.visualAssetId,
      label: authored.label,
      slot: authored.slot,
      family: authored.family,
      materialFamily: MATERIAL_FAMILY_BY_LABEL.get(authored.label),
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
