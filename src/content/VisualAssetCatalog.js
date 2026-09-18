import { VISUAL_ASSETS, VISUAL_ASSET_CATALOG_VERSION, visualAsset } from '../../public/visual-asset-catalog.js';

export { VISUAL_ASSET_CATALOG_VERSION, VISUAL_ASSETS, visualAsset };

export const CANONICAL_VISUAL_ASSET_IDS = Object.freeze({
  'frayed-mite': 'mob.small-spider.v1',
  'hollow-crow': 'mob.lantern-wraith.v1',
  'thread-wolf': 'mob.gray-wolf.v1',
  'frayed-wisp': 'mob.void-wisp.v1',
  'hollow-stalker': 'mob.shadow-beast.v1',
  'silkbound-guard': 'mob.silver-knight.v1',
  'first-needle': 'boss.void-knight.v1',
  'glass-skulker': 'mob.ice-wolf.v1',
  'stitch-leech': 'mob.giant-mantis.v1',
  'mirror-warden': 'mob.black-knight.v1',
  'shard-choir': 'mob.many-eyed-horror.v1',
  'hollow-mirror': 'boss.void-singularity.v1',
});

export const BATTLE_FIGMA_VISUAL_ASSET_IDS = Object.freeze({
  'bramble-druid': 'character.bramble-druid-figma.v1',
  'iron-vanguard': 'character.iron-vanguard-figma.v1',
  'rune-bard': 'character.rune-bard-figma.v1',
  'cinder-imp': 'mob.cinder-imp-figma.v1',
  'rot-toad': 'mob.rot-toad-figma.v1',
  'gloom-hound': 'mob.gloom-hound-figma.v1',
});

export function resolveVisualAssetId(entity = {}, kind) {
  const explicit = String(entity.visualAssetId || '');
  if (visualAsset(explicit, kind)) return explicit;
  const entityKey = String(entity.id || entity.enemyId || entity.definitionId || '');
  const canonical = CANONICAL_VISUAL_ASSET_IDS[entityKey] || BATTLE_FIGMA_VISUAL_ASSET_IDS[entityKey];
  return visualAsset(canonical, kind) ? canonical : null;
}

export function compactVisualAssetCatalog({ kinds = ['mob', 'boss', 'item'], tags = [], limit = 120 } = {}) {
  const allowedKinds = new Set(kinds);
  const requestedTags = new Set(tags.map((tag) => String(tag).toLowerCase()));
  const ranked = VISUAL_ASSETS
    .filter((asset) => allowedKinds.has(asset.kind))
    .map((asset) => ({ asset, score: asset.tags.reduce((sum, tag) => sum + (requestedTags.has(tag) ? 1 : 0), 0) }))
    .sort((left, right) => right.score - left.score || left.asset.id.localeCompare(right.asset.id));
  return ranked.slice(0, limit).map(({ asset }) => ({
    id: asset.id,
    kind: asset.kind,
    label: asset.label,
    ...(asset.family ? { family: asset.family } : {}),
    ...(asset.role ? { role: asset.role } : {}),
    ...(asset.sourceMaster?.boardCategory ? { boardCategory: asset.sourceMaster.boardCategory } : {}),
    tags: [...asset.tags],
  }));
}

export function authoringVisualAssetCollections() {
  return {
    characters: compactVisualAssetCatalog({ kinds: ['character'], limit: Infinity }),
    mobs: compactVisualAssetCatalog({ kinds: ['mob'], limit: Infinity }),
    bosses: compactVisualAssetCatalog({ kinds: ['boss'], limit: Infinity }),
    items: compactVisualAssetCatalog({ kinds: ['item'], limit: Infinity }),
  };
}
