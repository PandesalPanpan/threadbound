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

export function resolveVisualAssetId(entity = {}, kind) {
  const explicit = String(entity.visualAssetId || '');
  if (visualAsset(explicit, kind)) return explicit;
  const canonical = CANONICAL_VISUAL_ASSET_IDS[String(entity.id || entity.enemyId || entity.definitionId || '')];
  return visualAsset(canonical, kind) ? canonical : null;
}

export function compactVisualAssetCatalog({ kinds = ['mob', 'boss', 'item'], tags = [], limit = 120 } = {}) {
  const allowedKinds = new Set(kinds);
  const requestedTags = new Set(tags.map((tag) => String(tag).toLowerCase()));
  const ranked = VISUAL_ASSETS
    .filter((asset) => allowedKinds.has(asset.kind))
    .map((asset) => ({ asset, score: asset.tags.reduce((sum, tag) => sum + (requestedTags.has(tag) ? 1 : 0), 0) }))
    .sort((left, right) => right.score - left.score || left.asset.id.localeCompare(right.asset.id));
  return ranked.slice(0, limit).map(({ asset }) => ({ id: asset.id, kind: asset.kind, label: asset.label, tags: [...asset.tags] }));
}
