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

function enemyEntries(dungeons) {
  const seen = new Set();
  const entries = [];
  for (const dungeon of dungeons) {
    for (const enemy of dungeon.encounters) {
      if (seen.has(enemy.id)) continue;
      seen.add(enemy.id);
      entries.push({
        id: enemy.id,
        category: 'enemies',
        title: enemy.name,
        summary: `Encountered in ${dungeon.name}.`,
        body: `${enemy.name} is documented directly from the published dungeon definition. Base HP ${enemy.hp}; base retaliation ${enemy.retaliation}. Actual combat values scale with party size.`,
        mechanics: { baseHp: enemy.hp, baseRetaliation: enemy.retaliation, dungeonId: dungeon.id, abilities: enemy.abilities || [] },
        source: dungeon.sourceManifestId ? 'arc-manifest' : 'domain-model',
        tags: [dungeon.id, dungeon.arcId, 'enemy'].filter(Boolean),
      });
    }
  }
  return entries;
}

function bossEntries(dungeons) {
  return dungeons.map((dungeon) => ({
    id: dungeon.boss.id,
    category: 'bosses',
    title: dungeon.boss.name,
    summary: `Boss of ${dungeon.name}.`,
    body: `${dungeon.boss.name} is documented directly from the published dungeon definition. Base HP ${dungeon.boss.hp}; base retaliation ${dungeon.boss.retaliation}. Party-size scaling is applied at run start.`,
    mechanics: { baseHp: dungeon.boss.hp, baseRetaliation: dungeon.boss.retaliation, dungeonId: dungeon.id, abilities: dungeon.boss.abilities || [] },
    source: dungeon.sourceManifestId ? 'arc-manifest' : 'domain-model',
    tags: [dungeon.id, dungeon.arcId, 'boss'].filter(Boolean),
  }));
}

function achievementEntries(gameRepository, playerId, arcManifestService) {
  const unlocked = new Map(gameRepository.listAchievements(playerId).map((achievement) => [achievement.id, achievement]));
  const canonical = Object.values(ACHIEVEMENTS).map((achievement) => ({ id: achievement.id, title: achievement.name, description: achievement.description, source: 'achievement-catalog' }));
  const generated = (arcManifestService?.publishedAchievements() || []).map((achievement) => ({ id: achievement.id, title: achievement.title, description: achievement.description, source: 'arc-manifest', arcId: achievement.arcId, event: achievement.event, threshold: achievement.threshold }));
  return [...canonical, ...generated].map((achievement) => ({
    id: achievement.id,
    category: 'achievements',
    title: achievement.title,
    summary: achievement.description,
    body: achievement.description,
    unlocked: unlocked.has(achievement.id),
    unlockedAt: unlocked.get(achievement.id)?.unlockedAt ?? null,
    source: achievement.source,
    mechanics: achievement.event ? { event: achievement.event, threshold: achievement.threshold } : undefined,
    tags: ['achievement', achievement.arcId, unlocked.has(achievement.id) ? 'unlocked' : 'locked'].filter(Boolean),
  }));
}

function narrativeEntries(gameRepository, codexRepository) {
  const world = gameRepository.getWorldState();
  const canonical = allCanonicalNarrativeEntries().map((entry) => ({
    ...entry,
    category: 'lore',
    mechanics: entry.id === world.arcId
      ? { currentClears: world.frayedHollowClears, targetClears: world.target }
      : undefined,
  }));
  const published = codexRepository.listPublishedContentEntries().map((entry) => ({
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
  for (const entry of [...published, ...canonical]) byId.set(entry.id, entry);
  return [...byId.values()];
}

function itemEntries(codexRepository) {
  return codexRepository.listCodexItems().map((item) => ({
    id: item.id,
    category: 'items',
    title: item.name,
    summary: `${item.rarity} ${item.slot} · +${item.attackBonus} attack · ${item.effect.name}`,
    body: `${item.name} was recovered from ${item.source}. ${item.effect.description}`,
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

function historyEntries(codexRepository) {
  return codexRepository.listWorldHistory(250).map((entry) => ({
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
  constructor({ gameRepository, codexRepository, arcManifestService = null }) {
    this.gameRepository = gameRepository;
    this.codexRepository = codexRepository;
    this.arcManifestService = arcManifestService;
  }

  browse(playerId, { category = 'all', query = '' } = {}) {
    const q = normalize(query);
    const dungeons = [...Object.values(DUNGEONS), ...(this.arcManifestService?.runtimeDungeons() || [])];
    const groups = {
      items: itemEntries(this.codexRepository),
      enemies: enemyEntries(dungeons),
      bosses: bossEntries(dungeons),
      lore: narrativeEntries(this.gameRepository, this.codexRepository),
      achievements: achievementEntries(this.gameRepository, playerId, this.arcManifestService),
      history: historyEntries(this.codexRepository),
    };
    const entries = category === 'all' ? Object.values(groups).flat() : (groups[category] || []);
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
    return this.browse(playerId, { category }).entries.find((entry) => entry.id === id) || null;
  }
}
