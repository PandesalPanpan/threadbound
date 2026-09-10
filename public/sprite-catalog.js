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
// dozens of derived PNG files in the repository.
export const GENERATED_SPRITE_ATLASES = Object.freeze({
  maleWeavers: Object.freeze({
    id: 'male-weavers-v1',
    src: '/assets/generated/threadbound-male-characters-v1.png',
    width: 1024,
    height: 127,
    columns: 8,
    rows: 1,
  }),
  femaleWeavers: Object.freeze({
    id: 'female-weavers-v1',
    src: '/assets/generated/threadbound-female-characters-v1.png',
    width: 1024,
    height: 133,
    columns: 8,
    rows: 1,
  }),
  enemies: Object.freeze({
    id: 'enemies-v1',
    src: '/assets/generated/threadbound-enemies-v1.png',
    width: 1024,
    height: 283,
    columns: 8,
    rows: 2,
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

export function weaverSprite(seed) {
  return WEAVER_SPRITES[stableIndex(effectiveWeaverSeed(seed), WEAVER_SPRITES.length)];
}

export function enemySprite(enemy = {}) {
  if (enemy.isBoss) return '/sprites/kenney/boss.png';
  return ENEMY_SPRITES[String(enemy.id || '')] || '/sprites/kenney/frayed-wisp.png';
}

export function weaverSpriteFrame(seed, { variant = 'male' } = {}) {
  const atlas = variant === 'female' ? GENERATED_SPRITE_ATLASES.femaleWeavers : GENERATED_SPRITE_ATLASES.maleWeavers;
  return atlasFrame(atlas, stableIndex(effectiveWeaverSeed(seed), atlas.columns * atlas.rows));
}

export function enemySpriteFrame(enemy = {}) {
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

export function applySpriteFrame(element, frame) {
  if (!element || frame?.type !== 'atlas-frame') return element;
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
