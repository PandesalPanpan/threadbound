import { isCharacterKind, isModernCharacterAsset } from '../../../public/character-asset-policy.js';

const COMMAND_ALIASES = Object.freeze({
  '/help': 'help',
  '/status': 'status',
  '/profile': 'status',
  '/hunt': 'hunt',
  '/dungeon': 'dungeon',
  '/dungeons': 'dungeon',
  '/adventures': 'dungeon',
  '/run': 'dungeon',
  '/adventure': 'adventure',
  '/attack': 'attack',
  '/continue': 'continue',
  '/leave': 'retreat',
  '/retreat': 'retreat',
  '/guard': 'guard',
  '/interrupt': 'interrupt',
  '/mend': 'mend',
  '/revive': 'revive',
  '/heal': 'heal',
  '/potion': 'heal',
  '/rest': 'heal',
  '/shop': 'shop',
  '/buy': 'shop',
  '/bank': 'bank',
  '/inventory': 'inventory',
  '/gear': 'inventory',
  '/party': 'party',
  '/area': 'area',
  '/town': 'area',
  '/quest': 'quest',
  '/quests': 'quest',
  '/gambling': 'gambling',
  '/casino': 'gambling',
  '/blackjack': 'blackjack',
  '/hit': 'hit',
  '/stand': 'stand',
  '/coinflip': 'coinflip',
  '/slots': 'slots',
  '/leaderboard': 'leaderboard',
  '/world': 'world',
  '/achievements': 'world',
  '/honey': 'honey',
  '/wallet': 'honey',
  '/codex': 'codex',
});

export const QUICK_COMMANDS = Object.freeze([
  Object.freeze({ command: 'hunt', label: 'Hunt', icon: '✦', hint: 'Quick battle' }),
  Object.freeze({ command: 'dungeon', label: 'Dungeon', icon: '⌁', hint: 'Shared room replay' }),
  Object.freeze({ command: 'inventory', label: 'Inventory', icon: '▣', hint: 'Gear and HP' }),
  Object.freeze({ command: 'quest', label: 'Quest', icon: '◇', hint: 'Current objectives' }),
  Object.freeze({ command: 'party', label: 'Party', icon: '◎', hint: 'Weaver group' }),
  Object.freeze({ command: 'shop', label: 'Shop', icon: '◌', hint: 'Gold and supplies' }),
  Object.freeze({ command: 'area', label: 'Area', icon: '⌖', hint: 'Travel and Town' }),
  Object.freeze({ command: 'bank', label: 'Bank', icon: '▤', hint: 'Gold balance' }),
]);

export const COMMAND_SUGGESTIONS = Object.freeze([
  'help', 'status', 'hunt', 'adventure', 'dungeon', 'inventory', 'shop', 'bank', 'party', 'area', 'quest', 'leaderboard', 'gambling', 'world', 'honey', 'codex',
]);

function stableIndex(value, length) {
  if (!length) return 0;
  let hash = 2166136261;
  for (const character of String(value || 'threadbound')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

export function normalizeCommand(value) {
  const raw = String(value || '').trim();
  if (!raw) return { raw: '', name: '', args: [] };
  const tokens = raw.split(/\s+/g);
  const token = tokens.shift().toLowerCase();
  const canonical = (token.replace(/^\//, '') === 'profile' && tokens.length > 0)
    ? 'profile'
    : COMMAND_ALIASES[token] || token.replace(/^\//, '');
  return { raw, name: canonical, args: tokens, token };
}

export function commandLabel(command) {
  return String(command || '')
    .replace(/^\//, '')
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ') || 'Command';
}

export function entryBody(entry) {
  return String(entry?.body || entry?.message || entry?.text || 'A new thread result was recorded.');
}

export function entryKind(entry) {
  return entry?.kind === 'chat' ? 'chat' : 'system';
}

export function entryKey(entry) {
  return entry?.id || `${entry?.createdAt || 'now'}-${entryBody(entry)}`;
}

export function formatEntryTime(value) {
  if (!value) return 'now';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return 'now';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function resolveShellAsset(entity, assets = [], preferredKinds = []) {
  const explicitId = entity?.visualAssetId || entity?.assetId;
  const characterPresentation = preferredKinds.some((kind) => isCharacterKind(kind));
  if (explicitId) {
    const explicit = assets.find((asset) => asset.id === explicitId) || null;
    if (explicit && (!characterPresentation || isModernCharacterAsset(explicit))) return explicit;
  }
  const kinds = preferredKinds.length ? preferredKinds : ['item', 'icon', 'character', 'npc', 'mob'];
  const candidates = assets.filter((asset) => kinds.includes(asset.kind)
    && (!isCharacterKind(asset.kind) || isModernCharacterAsset(asset, asset.kind)));
  return candidates[stableIndex(entity?.id || entity?.playerId || entity?.name, candidates.length)] || null;
}

export function goldValue(character) {
  return Number(character?.gold ?? character?.threadDust ?? 0) || 0;
}

export function healthValue(character) {
  return {
    current: Number(character?.currentHealth ?? 0) || 0,
    max: Number(character?.maxHealth ?? character?.maxHp ?? 1) || 1,
  };
}

export function currentAreaName(areas, dashboard) {
  return areas?.currentArea?.name || dashboard?.world?.currentArea?.name || 'Area 1';
}

export function activeQuest(quests) {
  return (quests?.quests || []).find((quest) => ['active', 'claimable'].includes(quest.state)) || null;
}

export function findDungeon(dungeons = [], dungeonId = null) {
  if (!dungeons.length) return null;
  return dungeons.find((dungeon) => dungeon.id === dungeonId) || dungeons[0];
}

export function compactText(value, fallback = '—') {
  const text = String(value ?? '').trim();
  return text || fallback;
}
