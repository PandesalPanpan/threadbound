import { VISUAL_ASSETS, visualAsset } from './visual-asset-catalog.js';

const WEAVER_SPRITES = Object.freeze([
  '/sprites/kenney/weaver-arcane.png',
  '/sprites/kenney/weaver-fighter.png',
  '/sprites/kenney/weaver-delver.png',
  '/sprites/kenney/weaver-rover.png',
  '/sprites/kenney/weaver-mystic.png',
  '/sprites/kenney/weaver-warden.png',
]);

const ENEMY_SPRITES = Object.freeze({
  'frayed-wisp': '/sprites/kenney/frayed-wisp.png',
  'hollow-stalker': '/sprites/kenney/hollow-stalker.png',
  'silkbound-guard': '/sprites/kenney/silkbound-guard.png',
});

// Generated image sheets intentionally stay as single source assets. Presentation
// code crops stable frames with CSS background positioning instead of duplicating
// dozens of derived files in the repository.
export const GENERATED_SPRITE_ATLASES = Object.freeze({
  maleWeavers: Object.freeze({
    id: 'male-weavers-v1',
    src: '/assets/generated/threadbound-male-characters-v1.svg',
    width: 1024,
    height: 127,
    columns: 8,
    rows: 1,
  }),
  femaleWeavers: Object.freeze({
    id: 'female-weavers-v1',
    src: '/assets/generated/threadbound-female-characters-v1.svg',
    width: 1024,
    height: 133,
    columns: 8,
    rows: 1,
  }),
  enemies: Object.freeze({
    id: 'enemies-v1',
    src: '/assets/generated/threadbound-enemies-v1.svg',
    width: 1024,
    height: 283,
    columns: 8,
    rows: 2,
  }),
  equipment: Object.freeze({
    id: 'equipment-v1',
    src: '/assets/generated/threadbound-equipment-v1.svg',
    width: 1024,
    height: 128,
    columns: 8,
    rows: 1,
  }),
});

// Named mappings keep the current authored enemies visually stable. Unknown/generated
// ArcManifest enemies still receive a deterministic frame through the hash fallback.
const GENERATED_ENEMY_FRAMES = Object.freeze({
  'frayed-mite': 0,
  'hollow-crow': 1,
  'thread-wolf': 2,
  'frayed-wisp': 3,
  'hollow-stalker': 4,
  'silkbound-guard': 5,
  ashling: 6,
  'first-needle': 12,
  'ember-loomkeeper': 13,
});

const CANONICAL_VISUAL_ASSET_IDS = Object.freeze({
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

let viewerPlayerId = null;
let viewerStableIdentity = null;

// Local development profiles are stable identities (local:a … local:d), while the
// persisted player row may use a generated UUID. Resolve the viewer once at module
// load so the same local Weaver keeps the same visual variant across fresh databases
// and separate browser sessions. Other players still use their persisted player IDs.
if (globalThis.window?.THREADBOUND_AUTH_MODE === 'local') {
  try {
    const response = await fetch('/api/dashboard', { headers: { Accept: 'application/json' } });
    if (response.ok) {
      const dashboard = await response.json();
      viewerPlayerId = dashboard.character?.id || null;
      viewerStableIdentity = dashboard.threadedUser?.id || null;
    }
  } catch {
    // Sprite selection is presentation-only; fall back to the supplied seed if the
    // dashboard is unavailable during initial module evaluation.
  }
}

function stableIndex(seed, size) {
  const value = String(seed || 'threadbound-weaver');
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % size;
}

function effectiveWeaverSeed(seed) {
  return viewerStableIdentity && String(seed) === String(viewerPlayerId)
    ? viewerStableIdentity
    : seed;
}

function atlasFrame(atlas, index) {
  const count = atlas.columns * atlas.rows;
  const safeIndex = Math.max(0, Math.min(count - 1, Number(index) || 0));
  const column = safeIndex % atlas.columns;
  const row = Math.floor(safeIndex / atlas.columns);
  return Object.freeze({
    type: 'atlas-frame',
    atlasId: atlas.id,
    src: atlas.src,
    atlasWidth: atlas.width,
    atlasHeight: atlas.height,
    columns: atlas.columns,
    rows: atlas.rows,
    index: safeIndex,
    column,
    row,
    frameWidth: atlas.width / atlas.columns,
    frameHeight: atlas.height / atlas.rows,
  });
}

function runtimeAssetFrame(asset) {
  return Object.freeze({
    type: 'visual-asset',
    visualAssetId: asset.id,
    src: asset.src,
    width: asset.width,
    height: asset.height,
  });
}

function resolvedAsset(entity, kind, fallbackSeed) {
  const explicit = visualAsset(entity?.visualAssetId, kind);
  if (explicit) return explicit;
  const canonicalId = CANONICAL_VISUAL_ASSET_IDS[String(entity?.id || entity?.enemyId || entity?.definitionId || '')];
  const canonical = visualAsset(canonicalId, kind);
  if (canonical) return canonical;
  const candidates = VISUAL_ASSETS.filter((asset) => asset.kind === kind);
  return candidates[stableIndex(fallbackSeed, candidates.length)] || null;
}

export function weaverSprite(seed) {
  const candidates = VISUAL_ASSETS.filter((asset) => asset.kind === 'character');
  return candidates[stableIndex(effectiveWeaverSeed(seed), candidates.length)]?.src
    || WEAVER_SPRITES[stableIndex(effectiveWeaverSeed(seed), WEAVER_SPRITES.length)];
}

export function enemySprite(enemy = {}) {
  const kind = enemy.isBoss ? 'boss' : 'mob';
  return resolvedAsset(enemy, kind, enemy.id || enemy.enemyId || enemy.name || 'unknown-enemy')?.src
    || (enemy.isBoss ? '/sprites/kenney/boss.png' : ENEMY_SPRITES[String(enemy.id || '')] || '/sprites/kenney/frayed-wisp.png');
}

export function weaverSpriteFrame(seed, { variant = 'male' } = {}) {
  const prefix = variant === 'female' ? 'character.female-' : 'character.male-';
  const candidates = VISUAL_ASSETS.filter((asset) => asset.id.startsWith(prefix));
  const asset = candidates[stableIndex(effectiveWeaverSeed(seed), candidates.length)];
  if (asset) return runtimeAssetFrame(asset);
  const atlas = variant === 'female' ? GENERATED_SPRITE_ATLASES.femaleWeavers : GENERATED_SPRITE_ATLASES.maleWeavers;
  return atlasFrame(atlas, stableIndex(effectiveWeaverSeed(seed), atlas.columns * atlas.rows));
}

export function enemySpriteFrame(enemy = {}) {
  const runtime = resolvedAsset(enemy, enemy.isBoss ? 'boss' : 'mob', enemy.id || enemy.enemyId || enemy.name || 'unknown-enemy');
  if (runtime) return runtimeAssetFrame(runtime);
  const id = String(enemy.id || enemy.enemyId || enemy.defeatedEnemyId || 'unknown-enemy');
  const mapped = GENERATED_ENEMY_FRAMES[id];
  if (Number.isInteger(mapped)) return atlasFrame(GENERATED_SPRITE_ATLASES.enemies, mapped);
  // Reserve the final four frames for boss fallbacks so bosses remain visually
  // distinct from ordinary generated enemies even when an Arc has no curated map yet.
  const index = enemy.isBoss
    ? 12 + stableIndex(id, 4)
    : stableIndex(id, 12);
  return atlasFrame(GENERATED_SPRITE_ATLASES.enemies, index);
}

export function itemSpriteFrame(item = {}) {
  const seed = item.id || item.itemId || item.name || item.effect?.name || 'threadbound-relic';
  const runtime = resolvedAsset(item, 'item', seed);
  if (runtime) return runtimeAssetFrame(runtime);
  return atlasFrame(
    GENERATED_SPRITE_ATLASES.equipment,
    stableIndex(seed, GENERATED_SPRITE_ATLASES.equipment.columns * GENERATED_SPRITE_ATLASES.equipment.rows),
  );
}

export function applySpriteFrame(element, frame) {
  if (!element || !['atlas-frame', 'visual-asset'].includes(frame?.type)) return element;
  if (frame.type === 'visual-asset') {
    element.classList.add('thread-atlas-sprite', 'thread-visual-asset');
    element.dataset.visualAssetId = frame.visualAssetId;
    element.style.backgroundImage = `url("${frame.src}")`;
    element.style.backgroundRepeat = 'no-repeat';
    element.style.backgroundSize = 'contain';
    element.style.backgroundPosition = 'center';
    element.style.aspectRatio = String(frame.width / frame.height);
    element.style.imageRendering = 'pixelated';
    return element;
  }
  const x = frame.columns <= 1 ? 50 : (frame.column / (frame.columns - 1)) * 100;
  const y = frame.rows <= 1 ? 50 : (frame.row / (frame.rows - 1)) * 100;
  element.classList.add('thread-atlas-sprite');
  element.dataset.spriteAtlas = frame.atlasId;
  element.dataset.spriteFrame = String(frame.index);
  element.style.backgroundImage = `url("${frame.src}")`;
  element.style.backgroundRepeat = 'no-repeat';
  element.style.backgroundSize = `${frame.columns * 100}% ${frame.rows * 100}%`;
  element.style.backgroundPosition = `${x}% ${y}%`;
  element.style.aspectRatio = String(frame.frameWidth / frame.frameHeight);
  element.style.imageRendering = 'pixelated';
  return element;
}

export function createSpriteElement(frame, { className = '', testId = null, label = '' } = {}) {
  const element = document.createElement('span');
  element.className = ['thread-generated-sprite', className].filter(Boolean).join(' ');
  if (testId) element.dataset.testid = testId;
  if (label) {
    element.setAttribute('role', 'img');
    element.setAttribute('aria-label', label);
  } else {
    element.setAttribute('aria-hidden', 'true');
  }
  return applySpriteFrame(element, frame);
}

// `sprite-catalog.js` is on the current /game module graph through game.js and the
// Adventure Stream. Mount generated art from this active boundary instead of relying
// on older optional presentation bootstraps that the minimal page no longer loads.
// Dynamic import runs after this module is initialized, avoiding a static import cycle
// because generated-sprite-presentation.js consumes the frame helpers above.
if (globalThis.document) {
  queueMicrotask(() => import('./generated-sprite-presentation.js').catch(() => {}));
}
