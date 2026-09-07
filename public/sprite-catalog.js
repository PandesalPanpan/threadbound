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
  return WEAVER_SPRITES[stableIndex(seed, WEAVER_SPRITES.length)];
}

export function enemySprite(enemy = {}) {
  if (enemy.isBoss) return '/sprites/kenney/boss.png';
  return ENEMY_SPRITES[String(enemy.id || '')] || '/sprites/kenney/frayed-wisp.png';
}
