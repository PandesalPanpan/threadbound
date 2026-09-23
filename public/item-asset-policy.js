const LEGACY_ITEM_VISUAL_IDS = Object.freeze({
  'equipment.weapon.basic-sword': 'item.ashbite-sword.v1',
  'item.iron-sword.v1': 'item.ashbite-sword.v1',
  'item.steel-sword.v1': 'item.threadsteel-longsword.v1',
  'item.steel-dagger.v1': 'item.frostglass-dagger.v1',
  'item.iron-dagger.v1': 'item.bonewhite-dagger.v1',
  'item.arcane-staff.v1': 'item.starfall-staff.v1',
  'item.iron-axe.v1': 'item.ashwood-axe.v1',
  'item.health-potion.v1': 'item.minor-healing-flask.v1',
  'legacy-needle': 'item.violet-needle.v1',
});

function normalizedText(value) {
  return String(value || '').replace(/^(worn|sturdy|gleaming|runed|royal|mythic|old)\s+/i, '').trim().toLowerCase();
}

/**
 * Maps retired generated-item identities to authored Figma item art. Current
 * visual IDs pass through untouched, so this only affects persisted legacy
 * item records and receipts that lack a current semantic ID.
 */
export function legacyItemVisualAssetId(entity = {}) {
  for (const value of [entity.visualAssetId, entity.assetId, entity.id, entity.itemId]) {
    const known = LEGACY_ITEM_VISUAL_IDS[String(value || '').trim().toLowerCase()];
    if (known) return known;
  }

  const text = [entity.name, entity.label, entity.title, entity.visualAssetId, entity.id, entity.itemId]
    .map(normalizedText)
    .filter(Boolean)
    .join(' ');
  if (/\bneedle\b/.test(text)) return 'item.violet-needle.v1';
  if (/\b(scissors|shears)\b/.test(text)) return 'item.ashwood-axe.v1';
  if (/\b(dagger|knife)\b/.test(text)) return 'item.bonewhite-dagger.v1';
  if (/\b(spindle|arcane staff|staff)\b/.test(text)) return 'item.starfall-staff.v1';
  if (/\bwand\b/.test(text)) return 'item.hearth-wand.v1';
  if (/\baxe\b/.test(text)) return 'item.ashwood-axe.v1';
  if (/\bthreadblade\b/.test(text) || /\bsteel sword\b/.test(text)) return 'item.threadsteel-longsword.v1';
  if (/\b(sword|blade)\b/.test(text)) return 'item.ashbite-sword.v1';
  return null;
}

export function isLegacyGenericItemAsset(asset) {
  return asset?.kind === 'item' && asset?.provenance?.sourceSheet === 'items_sheets.png';
}
