import { VISUAL_ASSETS, visualAsset } from './visual-asset-catalog.js';
import { isCharacterKind, resolveThreadboundCharacterVisual } from './character-asset-policy.js';

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

export const BATTLE_FIGMA_VISUAL_ASSET_IDS = Object.freeze({
  'bramble-druid': 'character.road-sellsword.v1',
  'iron-vanguard': 'character.mine-breaker.v1',
  'rune-bard': 'character.wayfarer-healer.v1',
  'cinder-imp': 'mob.mold-mite.v1',
  'rot-toad': 'mob.frost-blob.v1',
  'gloom-hound': 'mob.ridge-wolf.v1',
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
  if (isCharacterKind(kind)) return resolveThreadboundCharacterVisual({ ...entity, id: entity?.id || fallbackSeed }, kind);
  const explicit = visualAsset(entity?.visualAssetId, kind);
  if (explicit) return explicit;
  if (kind === 'item') {
    const name = String(entity?.name || '').toLowerCase();
    const inferredId = name.includes('threadblade') || name.includes('sword') ? 'item.steel-sword.v1'
      : name.includes('needle') || name.includes('dagger') ? 'item.steel-dagger.v1'
        : name.includes('spindle') || name.includes('staff') ? 'item.arcane-staff.v1'
          : name.includes('shears') ? 'item.iron-dagger.v1'
            : name.includes('potion') ? 'item.health-potion.v1' : null;
    const inferred = visualAsset(inferredId, kind);
    if (inferred) return inferred;
  }
  const candidates = VISUAL_ASSETS.filter((asset) => asset.kind === kind);
  return candidates[stableIndex(fallbackSeed, candidates.length)] || null;
}

export function weaverSprite(seed) {
  return resolveThreadboundCharacterVisual({ id: effectiveWeaverSeed(seed) }, 'character')?.src || null;
}

export function enemySprite(enemy = {}) {
  const kind = enemy.isBoss ? 'boss' : 'mob';
  return resolvedAsset(enemy, kind, enemy.id || enemy.enemyId || enemy.name || 'unknown-enemy')?.src || null;
}

export function weaverSpriteFrame(seed, { variant = 'male' } = {}) {
  const asset = resolveThreadboundCharacterVisual({ id: effectiveWeaverSeed(seed) }, 'character');
  if (asset) return runtimeAssetFrame(asset);
  return null;
}

export function characterSpriteFrame(entity = {}, { variant = 'male', seed = null } = {}) {
  const normalized = typeof entity === 'string' ? { id: entity } : entity;
  const explicit = resolveThreadboundCharacterVisual(normalized, 'character');
  if (explicit) return runtimeAssetFrame(explicit);
  return weaverSpriteFrame(seed || normalized?.id || normalized?.npcId || normalized?.name || 'threadbound-character', { variant });
}

export function enemySpriteFrame(enemy = {}) {
  const runtime = resolvedAsset(enemy, enemy.isBoss ? 'boss' : 'mob', enemy.id || enemy.enemyId || enemy.name || 'unknown-enemy');
  if (runtime) return runtimeAssetFrame(runtime);
  return null;
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

export function battleSpriteFrame(unit = {}) {
  const key = String(unit.id || unit.unitId || '').trim();
  const mappedId = BATTLE_FIGMA_VISUAL_ASSET_IDS[key];
  const kind = unit.team === 'players' ? 'character' : unit.isBoss ? 'boss' : 'mob';
  const asset = resolveThreadboundCharacterVisual({ ...unit, visualAssetId: unit.visualAssetId || mappedId }, kind);
  return asset ? runtimeAssetFrame(asset) : null;
}
