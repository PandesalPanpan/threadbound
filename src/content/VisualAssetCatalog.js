import { VISUAL_ASSETS, VISUAL_ASSET_CATALOG_VERSION, visualAsset } from '../../public/visual-asset-catalog.js';
import {
  FIGMA_CHARACTER_FILE_KEY,
  FIGMA_CHARACTER_SOURCE_COLLECTION,
  LEGACY_CHARACTER_VISUAL_COMPATIBILITY,
  isModernCharacterAsset,
  isModernCharacterAssetId,
  modernCharacterAssets,
  resolveModernCharacterAssetId,
  resolveThreadboundCharacterVisual,
} from '../../public/character-asset-policy.js';

export { VISUAL_ASSET_CATALOG_VERSION, VISUAL_ASSETS, visualAsset };
export {
  FIGMA_CHARACTER_FILE_KEY,
  FIGMA_CHARACTER_SOURCE_COLLECTION,
  LEGACY_CHARACTER_VISUAL_COMPATIBILITY,
  isModernCharacterAsset,
  isModernCharacterAssetId,
  modernCharacterAssets,
  resolveModernCharacterAssetId,
  resolveThreadboundCharacterVisual,
};

export const CANONICAL_VISUAL_ASSET_IDS = Object.freeze({
  ...LEGACY_CHARACTER_VISUAL_COMPATIBILITY,
});

export const BATTLE_FIGMA_VISUAL_ASSET_IDS = Object.freeze({
  'bramble-druid': 'character.road-sellsword.v1',
  'iron-vanguard': 'character.mine-breaker.v1',
  'rune-bard': 'character.wayfarer-healer.v1',
  'cinder-imp': 'mob.mold-mite.v1',
  'rot-toad': 'mob.frost-blob.v1',
  'gloom-hound': 'mob.ridge-wolf.v1',
});

export function resolveVisualAssetId(entity = {}, kind) {
  if (['character', 'npc', 'mob', 'boss'].includes(kind)) return resolveModernCharacterAssetId(entity, kind);
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
    .filter((asset) => allowedKinds.has(asset.kind) && (!['character', 'mob', 'boss'].includes(asset.kind) || isModernCharacterAsset(asset, asset.kind)))
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
