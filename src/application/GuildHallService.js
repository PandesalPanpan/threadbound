import { guildHallPopulationForTown } from '../content/FoundationGuildHallCatalog.js';
import { resolveVisualAssetId } from '../content/VisualAssetCatalog.js';
import { Character } from '../domain/Character.js';
import { rankLeaderboardEntries } from '../domain/LeaderboardRankingPolicy.js';
import { progressionForExperience } from '../domain/LevelProgressionPolicy.js';
import { SQLiteAreaRepository } from '../infrastructure/SQLiteAreaRepository.js';
import { SQLiteDuelRepository } from '../infrastructure/SQLiteDuelRepository.js';
import { SQLiteEquipmentRepository } from '../infrastructure/SQLiteEquipmentRepository.js';
import { SQLiteLeaderboardRepository } from '../infrastructure/SQLiteLeaderboardRepository.js';
import { SQLitePlayerProgressionRepository } from '../infrastructure/SQLitePlayerProgressionRepository.js';

function timestampValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const normalized = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function projectRecentHistory(repository, duelRepository, adventurerId) {
  const ticks = repository.listTicks(adventurerId).slice(-5).map((tick) => Object.freeze({
    type: tick.actionType,
    occurredAt: tick.scheduledAt,
    experienceAward: tick.experienceAward,
  }));
  const duels = duelRepository ? duelRepository.listRecentFor(adventurerId, 5).map((duel) => Object.freeze({
    type: 'duel',
    occurredAt: duel.createdAt,
    outcome: duel.outcome,
    opponentId: duel.opponentId,
    turnCount: duel.turnCount,
  })) : [];

  return Object.freeze([...ticks, ...duels]
    .sort((left, right) => timestampValue(right.occurredAt) - timestampValue(left.occurredAt))
    .slice(0, 5));
}

function projectEntry(entry, state, duelRecord = null, recentHistory = Object.freeze([])) {
  const adventurer = state.adventurer;
  const record = duelRecord || adventurer.duelRecord;
  return Object.freeze({
    id: adventurer.id,
    name: adventurer.name,
    kind: 'simulated',
    isSimulated: true,
    level: adventurer.level,
    experience: adventurer.experience,
    levelProgression: adventurer.levelProgression,
    currentAreaNumber: adventurer.currentAreaNumber,
    highestUnlockedAreaNumber: adventurer.highestUnlockedAreaNumber,
    huntCount: adventurer.huntCount,
    adventureCount: adventurer.adventureCount,
    equipment: adventurer.equipment,
    stats: adventurer.stats,
    achievements: adventurer.achievements,
    achievementCount: adventurer.achievements.length,
    duelRecord: record,
    personality: adventurer.personality,
    activityProfile: adventurer.activityProfile,
    strongRival: entry.strongRival,
    note: entry.note,
    spriteVariant: entry.spriteVariant,
    visualAssetId: resolveVisualAssetId(adventurer, 'character'),
    history: Object.freeze({
      huntCount: adventurer.huntCount,
      adventureCount: adventurer.adventureCount,
      duelCount: record.total,
      lastSimulatedAt: state.lastSimulatedAt,
      recent: recentHistory,
    }),
  });
}

/**
 * Service Layer boundary for a Town Guild Hall roster and its read-only ranking.
 *
 * The catalog owns stable roster membership. The simulated-adventurer repository
 * owns persistent bot progression. Human leaderboard rows are composed from the
 * same persisted progression/equipment/Area facts used by normal gameplay. The
 * browser only renders the resulting projection and never calculates placement.
 */
export class GuildHallService {
  constructor({
    repository,
    gameRepository = null,
    populationCatalog = guildHallPopulationForTown,
    leaderboardRepository = null,
    equipmentRepository = null,
    progressionRepository = null,
    areaRepository = null,
    duelRepository = null,
    nowFactory = () => new Date(),
  } = {}) {
    if (!repository) throw new Error('GuildHallService requires a simulated-adventurer repository.');
    this.repository = repository;
    this.gameRepository = gameRepository;
    this.populationCatalog = populationCatalog;
    this.nowFactory = nowFactory;
    if (gameRepository) {
      this.leaderboardRepository = leaderboardRepository || new SQLiteLeaderboardRepository({ database: gameRepository.db });
      this.equipmentRepository = equipmentRepository || new SQLiteEquipmentRepository({ database: gameRepository.db });
      this.progressionRepository = progressionRepository || new SQLitePlayerProgressionRepository({ database: gameRepository.db });
      this.areaRepository = areaRepository || new SQLiteAreaRepository({ database: gameRepository.db });
      this.duelRepository = duelRepository || new SQLiteDuelRepository({ database: gameRepository.db });
    } else {
      this.leaderboardRepository = leaderboardRepository;
      this.equipmentRepository = equipmentRepository;
      this.progressionRepository = progressionRepository;
      this.areaRepository = areaRepository;
      this.duelRepository = duelRepository;
    }
  }

  browse(townId) {
    const normalizedTownId = String(townId || '').trim().toLowerCase();
    const entries = this.populationCatalog(normalizedTownId);
    const initializedAt = this.nowFactory().toISOString();
    const adventurers = entries.map((entry) => {
      const state = this.repository.ensure(entry.adventurer, { lastSimulatedAt: initializedAt });
      const duelRecord = this.duelRepository ? this.duelRepository.recordFor(state.adventurer.id) : null;
      const recentHistory = projectRecentHistory(this.repository, this.duelRepository, state.adventurer.id);
      return projectEntry(entry, state, duelRecord, recentHistory);
    });
    const leaderboard = this.#leaderboard(adventurers);

    return Object.freeze({
      townId: normalizedTownId,
      name: 'Guild Hall',
      adventurers: Object.freeze(adventurers),
      leaderboard,
    });
  }

  #leaderboard(adventurers) {
    if (!this.gameRepository || !this.leaderboardRepository || !this.equipmentRepository || !this.progressionRepository || !this.areaRepository) {
      return rankLeaderboardEntries(adventurers);
    }

    const humans = this.leaderboardRepository.listHumanPlayerIds().map((playerId) => {
      const row = this.gameRepository.getPlayer(playerId);
      if (!row) return null;
      const equipment = this.equipmentRepository.getLoadout(playerId);
      const character = new Character({ ...row, equipment, equippedItem: equipment.weapon });
      const progression = progressionForExperience(this.progressionRepository.get(playerId).experience);
      const area = this.areaRepository.get(playerId);
      const achievements = this.gameRepository.listAchievements(playerId);
      const activity = this.leaderboardRepository.activityForPlayer(playerId);
      return Object.freeze({
        id: character.id,
        name: character.displayName,
        kind: 'human',
        isSimulated: false,
        level: progression.level,
        experience: progression.experience,
        currentAreaNumber: area.currentAreaNumber,
        highestUnlockedAreaNumber: area.highestUnlockedAreaNumber,
        huntCount: activity.huntCount,
        adventureCount: activity.adventureCount,
        equipment,
        stats: character.stats,
        achievements,
        achievementCount: achievements.length,
        duelRecord: this.duelRepository ? this.duelRepository.recordFor(playerId) : null,
        strongRival: false,
        note: null,
        spriteVariant: null,
      });
    }).filter(Boolean);

    return rankLeaderboardEntries([...humans, ...adventurers]);
  }
}
