import { DUNGEONS } from '../domain/DungeonRun.js';
import { ACHIEVEMENTS } from './AchievementProjector.js';
import { allCanonicalNarrativeEntries } from '../content/CanonicalContent.js';

function normalize(text) {
  return String(text ?? '').trim().toLowerCase();
}

function matchesQuery(entry, query) {
  if (!query) return true;
  const haystack = [entry.title, entry.summary, entry.body, entry.category, ...(entry.tags || [])].join(' ').toLowerCase();
  return haystack.includes(query);
}

function enemyEntries() {
  const seen = new Set();
  const entries = [];
  for (const dungeon of Object.values(DUNGEONS)) {
    for (const enemy of dungeon.encounters) {
      if (seen.has(enemy.id)) continue;
      seen.add(enemy.id);
      entries.push({
        id: enemy.id,
        category: 'enemies',
        title: enemy.name,
        summary: `Encountered in ${dungeon.name}.`,
        body: `${enemy.name} is a standard enemy documented directly from the live dungeon definition. Base HP ${enemy.hp}; base retaliation ${enemy.retaliation}. Actual combat values scale with party size.`,
        mechanics: { baseHp: enemy.hp, baseRetaliation: enemy.retaliation, dungeonId: dungeon.id },
        source: 'domain-model',
        tags: [dungeon.id, 'enemy'],
      });
    }
  }
  return entries;
}

function bossEntries() {
  return Object.values(DUNGEONS).map((dungeon) => ({
    id: dungeon.boss.id,
    category: 'bosses',
    title: dungeon.boss.name,
    summary: `Boss of ${dungeon.name}.`,
    body: `${dungeon.boss.name} is the boss documented directly from the live dungeon definition. Base HP ${dungeon.boss.hp}; base retaliation ${dungeon.boss.retaliation}. Party-size scaling is applied at run start.`,
    mechanics: { baseHp: dungeon.boss.hp, baseRetaliation: dungeon.boss.retaliation, dungeonId: dungeon.id },
    source: 'domain-model',
    tags: [dungeon.id, 'boss'],
  }));
}

function achievementEntries(repository, playerId) {
  const unlocked = new Map(repository.listAchievements(playerId).map((achievement) => [achievement.id, achievement]));
  return Object.values(ACHIEVEMENTS).map((achievement) => ({
    id: achievement.id,
    category: 'achievements',
    title: achievement.name,
    summary: achievement.description,
    body: achievement.description,
    unlocked: unlocked.has(achievement.id),
    unlockedAt: unlocked.get(achievement.id)?.unlockedAt ?? null,
    source: 'achievement-catalog',
    tags: ['achievement'],
  }));
}

function narrativeEntries(repository) {
  const canonical = allCanonicalNarrativeEntries().map((entry) => ({
    ...entry,
    category: entry.type === 'world-arc' ? 'lore' : 'lore',
  }));
  const published = repository.listPublishedContentEntries().map((entry) => ({
    id: entry.id,
    category: 'lore',
    title: entry.title,
    summary: entry.summary,
    body: entry.body,
    revision: entry.version,
    source: entry.source,
    arcId: entry.arcId,
    tags: entry.tags,
    publishedAt: entry.publishedAt,
  }));
  const byId = new Map();
  for (const entry of [...canonical, ...published]) byId.set(entry.id, entry);
  return [...byId.values()];
}

function itemEntries(repository) {
  return repository.listCodexItems().map((item) => ({
    id: item.id,
    category: 'items',
    title: item.name,
    summary: `${item.rarity} ${item.slot} · +${item.attackBonus} attack · ${item.effect.name}`,
    body: item.loreText || `${item.name} was recovered from ${item.source}. ${item.effect.description}`,
    mechanics: {
      attackBonus: item.attackBonus,
      rarity: item.rarity,
      slot: item.slot,
      effectCode: item.effectCode,
      effectName: item.effect.name,
      effectDescription: item.effect.description,
    },
    source: item.source,
    discoveredAt: item.createdAt,
    tags: [item.rarity, item.slot, item.effectCode, item.source],
  }));
}

function historyEntries(repository) {
  return repository.listWorldHistory(250).map((entry) => ({
    id: entry.id,
    category: 'history',
    title: entry.title,
    summary: entry.summary,
    body: entry.body || entry.summary,
    source: 'world-history',
    createdAt: entry.createdAt,
    entityType: entry.entityType,
    entityId: entry.entityId,
    tags: [entry.eventType, entry.entityType].filter(Boolean),
  }));
}

export class CodexService {
  constructor({ repository }) {
    this.repository = repository;
  }

  browse(playerId, { category = 'all', query = '' } = {}) {
    const q = normalize(query);
    const groups = {
      items: itemEntries(this.repository),
      enemies: enemyEntries(),
      bosses: bossEntries(),
      lore: narrativeEntries(this.repository),
      achievements: achievementEntries(this.repository, playerId),
      history: historyEntries(this.repository),
    };

    const entries = category === 'all'
      ? Object.values(groups).flat()
      : (groups[category] || []);

    const filtered = entries
      .filter((entry) => matchesQuery(entry, q))
      .sort((a, b) => {
        if (a.category === 'history' && b.category === 'history') return String(b.createdAt).localeCompare(String(a.createdAt));
        return a.title.localeCompare(b.title);
      });

    return {
      category,
      query,
      counts: Object.fromEntries(Object.entries(groups).map(([key, value]) => [key, value.length])),
      total: filtered.length,
      entries: filtered,
    };
  }

  detail(playerId, category, id) {
    const result = this.browse(playerId, { category });
    return result.entries.find((entry) => entry.id === id) || null;
  }
}
