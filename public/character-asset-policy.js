import { VISUAL_ASSETS, visualAsset } from './visual-asset-catalog.js';

export const FIGMA_CHARACTER_FILE_KEY = 'xfAbc94dv0LxhxhC9q9BhK';
export const FIGMA_CHARACTER_SOURCE_COLLECTION = 'figma-character-library-v1';

const CHARACTER_KINDS = new Set(['character', 'npc', 'mob', 'boss']);

// Authored entity IDs remain stable while their presentation can move to the
// current Figma family. This is deliberately explicit so a refresh cannot
// reshuffle an existing enemy into a different visual archetype.
export const LEGACY_CHARACTER_VISUAL_COMPATIBILITY = Object.freeze({
  'frayed-mite': 'mob.mold-mite.v1',
  'hollow-crow': 'mob.ash-raven.v1',
  'thread-wolf': 'mob.ridge-wolf.v1',
  'frayed-wisp': 'mob.grave-wisp.v1',
  'hollow-stalker': 'mob.shade-drifter.v1',
  'silkbound-guard': 'mob.town-watcher.v1',
  'first-needle': 'boss.black-banner-captain.v1',
  'glass-skulker': 'mob.shade-drifter.v1',
  'stitch-leech': 'mob.bloom-leech.v1',
  'mirror-warden': 'mob.iron-husk.v1',
  'shard-choir': 'mob.watcher-prime.v1',
  'hollow-mirror': 'boss.watcher-prime.v1',
  'ancient-treant': 'boss.thornback-alpha.v1',
});

const LEGACY_ASSET_COMPATIBILITY = Object.freeze({
  'mob.small-spider.v1': 'mob.mold-mite.v1',
  'mob.lantern-wraith.v1': 'mob.ash-raven.v1',
  'mob.gray-wolf.v1': 'mob.ridge-wolf.v1',
  'mob.void-wisp.v1': 'mob.grave-wisp.v1',
  'mob.shadow-beast.v1': 'mob.shade-drifter.v1',
  'mob.silver-knight.v1': 'mob.town-watcher.v1',
  'boss.void-knight.v1': 'boss.black-banner-captain.v1',
  'mob.ice-wolf.v1': 'mob.frost-blob.v1',
  'mob.giant-mantis.v1': 'mob.bloom-leech.v1',
  'mob.black-knight.v1': 'mob.iron-husk.v1',
  'mob.many-eyed-horror.v1': 'mob.watcher-prime.v1',
  'boss.void-singularity.v1': 'boss.watcher-prime.v1',
  'boss.ancient-treant.v1': 'boss.thornback-alpha.v1',
});

function normalizedKind(kind) {
  return kind === 'npc' ? 'character' : kind;
}

function stableIndex(seed, size) {
  if (!size) return 0;
  let hash = 2166136261;
  for (const character of String(seed || 'threadbound-character')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % size;
}

function entityKeys(entity = {}) {
  return [entity.id, entity.enemyId, entity.definitionId, entity.npcId, entity.playerId, entity.name]
    .filter((value) => value !== undefined && value !== null && String(value).trim())
    .map((value) => String(value).trim().toLowerCase())
    .flatMap((value) => [value, value.split(':').at(-1)])
    .map((value) => value.replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, ''));
}

export function isModernCharacterAsset(asset, kind = null) {
  const expectedKind = normalizedKind(kind);
  if (!asset || !CHARACTER_KINDS.has(asset.kind) || (expectedKind && asset.kind !== expectedKind)) return false;
  const provenance = asset.provenance || {};
  return provenance.sourceCollection === FIGMA_CHARACTER_SOURCE_COLLECTION;
}

export function modernCharacterAssets(kind) {
  const expectedKind = normalizedKind(kind);
  return VISUAL_ASSETS.filter((asset) => isModernCharacterAsset(asset, expectedKind));
}

export function isModernCharacterAssetId(id, kind = null) {
  return isModernCharacterAsset(visualAsset(id, normalizedKind(kind)), kind);
}

export function resolveThreadboundCharacterVisual(entity = {}, kind = 'mob') {
  const expectedKind = normalizedKind(kind);
  if (!CHARACTER_KINDS.has(expectedKind)) return null;

  const explicit = visualAsset(entity.visualAssetId, expectedKind);
  if (isModernCharacterAsset(explicit, expectedKind)) return explicit;

  for (const key of entityKeys(entity)) {
    const mappedId = LEGACY_CHARACTER_VISUAL_COMPATIBILITY[key] || LEGACY_ASSET_COMPATIBILITY[key];
    const mapped = visualAsset(mappedId, expectedKind);
    if (isModernCharacterAsset(mapped, expectedKind)) return mapped;
  }

  const candidates = modernCharacterAssets(expectedKind);
  if (!candidates.length) return null;
  const seed = entity.visualAssetId || entity.visualAssetKey || entity.id || entity.enemyId || entity.definitionId || entity.npcId || entity.playerId || entity.name || 'threadbound-character';
  return candidates[stableIndex(seed, candidates.length)] || candidates[0];
}

export function resolveModernCharacterAssetId(entity = {}, kind = 'mob') {
  return resolveThreadboundCharacterVisual(entity, kind)?.id || null;
}

export function isCharacterKind(kind) {
  return CHARACTER_KINDS.has(normalizedKind(kind));
}
