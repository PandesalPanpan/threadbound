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

export function weaverSprite(seed) {
  const effectiveSeed = viewerStableIdentity && String(seed) === String(viewerPlayerId)
    ? viewerStableIdentity
    : seed;
  return WEAVER_SPRITES[stableIndex(effectiveSeed, WEAVER_SPRITES.length)];
}

export function enemySprite(enemy = {}) {
  if (enemy.isBoss) return '/sprites/kenney/boss.png';
  return ENEMY_SPRITES[String(enemy.id || '')] || '/sprites/kenney/frayed-wisp.png';
}
