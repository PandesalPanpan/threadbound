const LEGACY_ITEM_VISUAL_IDS = Object.freeze({
  'equipment.weapon.basic-sword': 'item.ashbite-sword.v1',
  'item.iron-sword.v1': 'item.ashbite-sword.v1',
  'item.steel-sword.v1': 'item.threadsteel-longsword.v1',
  'item.steel-dagger.v1': 'item.frostglass-dagger.v1',
  'item.iron-dagger.v1': 'item.bonewhite-dagger.v1',
  'item.arcane-staff.v1': 'item.starfall-staff.v1',
  'item.iron-axe.v1': 'item.ashwood-axe.v1',
  'item.health-potion.v1': 'item.minor-healing-flask.v1',
  'item.greater-health-potion.v1': 'item.greater-healing-flask.v1',
  'item.mana-potion.v1': 'item.mana-vial.v1',
  'item.iron-helmet.v1': 'item.bonecrest-helm.v1',
  'item.silver-medallion.v1': 'item.goldleaf-charm.v1',
  'item.quest-scroll.v1': 'item.quest-scroll.v2',
  'item.gold-coin.v1': 'item.gold-coin.v2',
  'item.iron-treasure-chest.v1': 'item.ancient-relic.v1',
  'legacy-needle': 'item.violet-needle.v1',
});

function normalizedText(value) {
  return String(value || '').replace(/^(worn|sturdy|gleaming|runed|royal|mythic|old)\s+/i, '').trim().toLowerCase();
}

function exactFigmaItemVisualAssetId(entity, assets) {
  if (!Array.isArray(assets)) return null;
  const names = [entity.name, entity.label, entity.title]
    .map(normalizedText)
    .filter(Boolean);
  if (!names.length) return null;
  const match = assets.find((asset) => asset.kind === 'item'
    && asset.provenance?.sourceCollection === 'figma-item-library-v1'
    && names.includes(normalizedText(asset.label)));
  return match?.id || null;
}

/**
 * Maps retired generated-item identities to authored Figma item art. Current
 * visual IDs pass through untouched, so this only affects persisted legacy
 * item records and receipts that lack a current semantic ID.
 */
export function legacyItemVisualAssetId(entity = {}, assets = []) {
  for (const value of [entity.visualAssetId, entity.assetId, entity.id, entity.itemId]) {
    const known = LEGACY_ITEM_VISUAL_IDS[String(value || '').trim().toLowerCase()];
    if (known) return known;
  }

  // A current Figma label is a stronger identity than an inferred broad family.
  // Keep known retired-ID aliases first so established compatibility mappings
  // remain stable, then use exact authored names before family fallbacks.
  const exactFigmaId = exactFigmaItemVisualAssetId(entity, assets);
  if (exactFigmaId) return exactFigmaId;

  const text = [entity.name, entity.label, entity.title, entity.visualAssetId, entity.id, entity.itemId]
    .map(normalizedText)
    .filter(Boolean)
    .join(' ');

  // Preserve the old record's object family when it has no current semantic
  // identity. These maps deliberately point only at the corresponding Figma
  // item family so a retired helmet or potion can never appear as a sword.
  if (/\b(gold coin|coin pouch|silver coin|coin stack|currency)\b/.test(text)) return 'item.gold-coin.v2';
  if (/\b(quest scroll|quest item|guild seal|treasure map|rune tablet)\b/.test(text)) return 'item.quest-scroll.v2';
  if (/\b(chest|treasure chest|loot chest|crate)\b/.test(text)) return 'item.ancient-relic.v1';
  if (/\b(greater health|major health|health potion|healing potion|healing flask)\b/.test(text)) return /\b(greater|major)\b/.test(text) ? 'item.greater-healing-flask.v1' : 'item.minor-healing-flask.v1';
  if (/\b(mana potion|mana vial|focus tonic)\b/.test(text)) return 'item.mana-vial.v1';
  if (/\b(potion|tonic|elixir|draught|phial|brew|antidote)\b/.test(text)) {
    if (/\b(fire|ember|flame)\b/.test(text)) return 'item.ember-tonic.v1';
    if (/\b(nature|briar|poison|venom)\b/.test(text)) return 'item.briar-antidote.v1';
    if (/\b(arcane|clear|moonwater)\b/.test(text)) return 'item.moonwater-draught.v1';
    return 'item.threadheart-elixir.v1';
  }
  if (/\b(ration|bread|stew|soup|meal|tart|tea|jerky|food)\b/.test(text)) return 'item.guild-ration.v1';
  if (/\b(helmet|helm|hood|visor|headgear)\b/.test(text)) return 'item.bonecrest-helm.v1';
  if (/\b(boots|greaves)\b/.test(text)) return 'item.cinder-boots.v1';
  if (/\b(gauntlet|glove|bracer)\b/.test(text)) return 'item.briar-gauntlets.v1';
  if (/\b(shield|buckler)\b/.test(text)) return 'item.ashguard-shield.v1';
  if (/\b(ring|band)\b/.test(text)) return 'item.copperloop-ring.v1';
  if (/\b(amulet|pendant|necklace|medallion|charm|brooch)\b/.test(text)) return 'item.goldleaf-charm.v1';
  if (/\b(belt|sash)\b/.test(text)) return 'item.honeycomb-belt.v1';
  if (/\b(armor|armour|robe|coat|cuirass|vest|cloak|mantle)\b/.test(text)) return /\b(cloak|mantle)\b/.test(text) ? 'item.dusk-mantle.v1' : 'item.bronzeweave-coat.v1';
  if (/\b(bow)\b/.test(text)) return 'item.ashstring-bow.v1';
  if (/\b(crossbow|repeater|hand cannon)\b/.test(text)) return 'item.ember-crossbow.v1';
  if (/\b(spear|pike|lance|halberd|glaive|javelin)\b/.test(text)) return 'item.cinder-pike.v1';
  if (/\b(hammer|maul)\b/.test(text)) return 'item.ironroot-hammer.v1';
  if (/\b(axe|scythe|mace|flail|club)\b/.test(text)) return 'item.ashwood-axe.v1';
  if (/\b(staff|wand|scepter|focus|orb|tome|grimoire|spellbook)\b/.test(text)) {
    if (/\b(wand|scepter)\b/.test(text)) return 'item.hearth-wand.v1';
    if (/\b(tome|grimoire|spellbook)\b/.test(text)) return 'item.vault-grimoire.v1';
    return 'item.starfall-staff.v1';
  }
  if (/\bneedle\b/.test(text)) return 'item.violet-needle.v1';
  if (/\b(scissors|shears)\b/.test(text)) return 'item.ashwood-axe.v1';
  if (/\b(dagger|knife)\b/.test(text)) return 'item.bonewhite-dagger.v1';
  if (/\bthreadblade\b/.test(text) || /\bsteel sword\b/.test(text)) return 'item.threadsteel-longsword.v1';
  if (/\b(sword|blade)\b/.test(text)) return 'item.ashbite-sword.v1';
  if (/\b(coin|gold)\b/.test(text)) return 'item.gold-coin.v2';
  if (/\b(key)\b/.test(text)) return 'item.copper-key.v1';
  if (/\b(ore|crystal|gem|sapphire|ruby|emerald|amethyst|prism)\b/.test(text)) return 'item.violet-prism.v1';
  if (/\b(material|shard|fragment|fang|feather|herb|flower|mushroom|leaf)\b/.test(text)) return 'item.thread-shard.v1';
  // This neutral quest item is the safe presentation for unclassified old
  // item records. Never choose the first item in the catalog (which is a
  // weapon and misrepresents unrelated legacy equipment).
  return 'item.ancient-relic.v1';
}

export function isLegacyGenericItemAsset(asset) {
  return asset?.kind === 'item' && asset?.provenance?.sourceSheet === 'items_sheets.png';
}
