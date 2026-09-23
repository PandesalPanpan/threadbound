import { randomUUID } from 'node:crypto';
import { Character } from '../domain/Character.js';
import { AdventureRun, DUNGEONS } from '../domain/AdventureRun.js';
import { Party } from '../domain/Party.js';
import { dungeonReadiness } from '../domain/SimpleDungeonPolicy.js';
import { progressionAdventureRequirement, requireProgressionAdventureParty } from '../domain/ProgressionAdventurePolicy.js';
import { applyProgressionBossEnrage } from '../domain/ProgressionBossEnragePolicy.js';
import { SQLiteProgressionBossEnrageRepository } from '../infrastructure/SQLiteProgressionBossEnrageRepository.js';

export const AREA_ONE_PROGRESSION_DUNGEON_ID = 'progression-area-1';

const FIRST_GUILD_TRIAL = Object.freeze({
  id: AREA_ONE_PROGRESSION_DUNGEON_ID,
  name: 'Sunpetal Guild Trial',
  recommendedPlayers: 2,
  minPlayers: 1,
  maxPlayers: 4,
  recommendedAttack: 9,
  encounters: Object.freeze([
    Object.freeze({ id: 'sunpetal-sprout', name: 'Sunpetal Sprout', hp: 12, retaliation: 2, visualAssetId: 'mob.mold-mite.v1', targetingProfile: 'random', abilities: Object.freeze(['self_mend']), intentCadence: 1 }),
    Object.freeze({ id: 'ribbon-fox', name: 'Ribbon Fox', hp: 12, retaliation: 2, visualAssetId: 'mob.ash-raven.v1', targetingProfile: 'hunter', abilities: Object.freeze(['heavy_pressure']), intentCadence: 1 }),
    Object.freeze({ id: 'guild-training-golem', name: 'Guild Training Golem', hp: 12, retaliation: 2, visualAssetId: 'mob.ridge-wolf.v1', targetingProfile: 'bruiser', abilities: Object.freeze(['heavy_pressure', 'self_mend', 'ally_hunter']), intentCadence: 1 }),
  ]),
  simpleStages: Object.freeze([
    Object.freeze([
      Object.freeze({ id: 'sunpetal-sprout', name: 'Sunpetal Sprout', hp: 12, retaliation: 2, visualAssetId: 'mob.mold-mite.v1', targetingProfile: 'random' }),
      Object.freeze({ id: 'ribbon-fox', name: 'Ribbon Fox', hp: 12, retaliation: 2, visualAssetId: 'mob.ash-raven.v1', targetingProfile: 'hunter' }),
    ]),
    Object.freeze([
      Object.freeze({ id: 'ribbon-fox', name: 'Ribbon Fox', hp: 12, retaliation: 2, visualAssetId: 'mob.ash-raven.v1', targetingProfile: 'hunter' }),
      Object.freeze({ id: 'guild-training-golem', name: 'Guild Training Golem', hp: 12, retaliation: 2, visualAssetId: 'mob.ridge-wolf.v1', targetingProfile: 'bruiser' }),
    ]),
    Object.freeze([
      Object.freeze({ id: 'sunpetal-sprout', name: 'Sunpetal Sprout', hp: 12, retaliation: 2, visualAssetId: 'mob.mold-mite.v1', targetingProfile: 'random' }),
      Object.freeze({ id: 'ribbon-fox', name: 'Ribbon Fox', hp: 12, retaliation: 2, visualAssetId: 'mob.ash-raven.v1', targetingProfile: 'hunter' }),
      Object.freeze({ id: 'guild-training-golem', name: 'Guild Training Golem', hp: 12, retaliation: 2, visualAssetId: 'mob.ridge-wolf.v1', targetingProfile: 'bruiser' }),
    ]),
  ]),
  boss: Object.freeze({ id: 'sunpetal-captain', name: 'Captain Bramble', hp: 24, retaliation: 4, visualAssetId: 'boss.black-banner-captain.v1', targetingProfile: 'tactical', abilities: Object.freeze(['basic_retaliation']), intentCadence: 3 }),
  progressionAdventure: true,
  requiredHumanPlayers: 2,
  unlocksAreaNumber: 2,
});

function builtInProgressionDefinition(dungeonId) {
  if (dungeonId !== AREA_ONE_PROGRESSION_DUNGEON_ID) return null;
  // The Area-1 progression challenge is small foundation content rather than a
  // full Arc. Frayed Hollow remains loadable only through its legacy dungeon id
  // for persisted-run compatibility and focused migration/regression coverage.
  return FIRST_GUILD_TRIAL;
}

/**
 * New player-facing dungeon use case. The legacy start path remains temporarily
 * available for migration/old acceptance fixtures, while this path creates the
 * new automatic stat-check run. Progression Adventures reuse this run boundary
 * but add an authoritative two-human party gate before any run is persisted.
 */
export class SimpleDungeonService {
  constructor({ repository, eventBus, arcManifestService = null, enrageRepository = null, idFactory = randomUUID }) {
    this.repository = repository;
    this.eventBus = eventBus;
    this.arcManifestService = arcManifestService;
    this.enrageRepository = enrageRepository || new SQLiteProgressionBossEnrageRepository({ database: repository.db });
    this.idFactory = idFactory;

    eventBus.subscribe((event) => {
      if (event.dungeonId !== AREA_ONE_PROGRESSION_DUNGEON_ID || !event.runId) return;
      if (event.type === 'DungeonFailed') {
        event.progressionEnrageStack = this.enrageRepository.recordFailure(event.dungeonId, event.runId);
      } else if (event.type === 'DungeonCompleted') {
        this.enrageRepository.recordVictory(event.dungeonId, event.runId);
        event.progressionEnrageStack = 0;
      }
    });
  }

  definition(dungeonId) {
    const builtIn = builtInProgressionDefinition(dungeonId);
    if (builtIn) return applyProgressionBossEnrage(builtIn, this.enrageRepository.get(dungeonId));
    return DUNGEONS[dungeonId] || this.arcManifestService?.resolveDungeon(dungeonId) || null;
  }

  readiness(playerId, dungeonId) {
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const definition = this.definition(dungeonId);
    if (!definition) throw new Error(`Unknown dungeon: ${dungeonId}`);
    const storedParty = this.repository.getPartyForPlayer(playerId);
    const party = storedParty ? new Party(storedParty) : null;
    const ids = party ? party.participantIds() : [playerId];
    const members = ids.map((id) => {
      const row = this.repository.getPlayer(id);
      const equipped = row?.equippedItemId ? this.repository.getItem(row.equippedItemId) : null;
      const character = row ? new Character({ ...row, equippedItem: equipped }) : null;
      const check = dungeonReadiness({
        attackPower: character?.attackPower || 0,
        maxHealth: character?.maxHealth || 0,
        currentHealth: row?.currentHealth || 0,
        definition,
      });
      return {
        playerId: id,
        displayName: row?.displayName || 'Unknown Adventurer',
        currentHealth: row?.currentHealth || 0,
        maxHealth: character?.maxHealth || 0,
        ...check,
      };
    });
    const progressionRequirement = definition.progressionAdventure
      ? progressionAdventureRequirement({ definition, party })
      : null;
    return {
      dungeonId,
      dungeonName: definition.name,
      recommendedAttack: Number(definition.recommendedAttack || 9),
      progressionAdventure: Boolean(definition.progressionAdventure),
      progressionEnrage: definition.progressionEnrage || null,
      requiredHumanPlayers: progressionRequirement?.requiredHumanPlayers || null,
      partyRequirementMet: progressionRequirement?.satisfied ?? true,
      ready: members.every((member) => member.ready) && (progressionRequirement?.satisfied ?? true),
      members,
    };
  }

  startDungeon(playerId, dungeonId, { sharedSurface = true } = {}) {
    if (this.repository.getActiveRun(playerId)) throw new Error('Finish or fail the active run before starting another.');
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const dungeonDefinition = this.definition(dungeonId);
    if (!dungeonDefinition) throw new Error(`Unknown dungeon: ${dungeonId}`);

    const storedParty = this.repository.getPartyForPlayer(playerId);
    let participantPlayers;
    let ownerType;
    let ownerId;
    let progressionRequirement = null;

    if (storedParty) {
      const party = new Party(storedParty);
      participantPlayers = party.participantIds().map((participantId) => {
        if (this.repository.getActiveRun(participantId)) throw new Error('A party member is already in an active dungeon.');
        const participant = this.repository.getPlayer(participantId);
        if (!participant) throw new Error('Party member was not found.');
        return participant;
      });
      if (dungeonDefinition.progressionAdventure) {
        progressionRequirement = requireProgressionAdventureParty({
          definition: dungeonDefinition,
          party,
          startedByPlayerId: playerId,
          players: participantPlayers,
        });
      } else if (!party.canStart(playerId)) {
        throw new Error('Only the ready party leader can start a dungeon.');
      }
      ownerType = 'party';
      ownerId = party.id;
    } else {
      if (dungeonDefinition.progressionAdventure) {
        requireProgressionAdventureParty({
          definition: dungeonDefinition,
          party: null,
          startedByPlayerId: playerId,
          players: [player],
        });
      }
      participantPlayers = [player];
      ownerType = 'player';
      ownerId = player.id;
    }

    const wounded = participantPlayers.find((participant) => Number(participant.currentHealth || 0) <= 0);
    if (wounded) {
      const error = new Error(`${wounded.displayName || 'A Weaver'} is too wounded to enter a Dungeon. Recover or use a potion first.`);
      error.code = 'too_wounded_to_enter_dungeon';
      error.playerId = wounded.id;
      throw error;
    }

    const run = AdventureRun.startSimple({
      id: this.idFactory(),
      ownerType,
      ownerId,
      startedByPlayerId: playerId,
      participants: participantPlayers.map((participant) => ({ playerId: participant.id, maxHealth: participant.maxHealth, currentHealth: participant.currentHealth })),
      dungeonId,
      dungeonDefinition,
      sharedSurface,
    });
    const persisted = this.repository.createRun(run.toJSON());
    const actor = persisted.participants.find((participant) => participant.playerId === playerId);
    const enrage = dungeonDefinition.progressionEnrage || null;
    const enrageCopy = enrage?.stack > 0
      ? ` · Boss Enraged ${enrage.stack}/${enrage.cap} (+${enrage.percentIncrease}% HP/damage)`
      : '';
    this.eventBus.publish({
      type: 'DungeonStarted',
      playerId,
      participantIds: persisted.participants.map((participant) => participant.playerId),
      runId: persisted.id,
      dungeonId,
      dungeonName: persisted.dungeonDefinition?.name || null,
      ownerType,
      ownerId,
      simpleCombat: true,
      sharedSurface: Boolean(sharedSurface),
      progressionAdventure: Boolean(dungeonDefinition.progressionAdventure),
      progressionEnrage: enrage,
      requiredHumanPlayers: progressionRequirement?.requiredHumanPlayers || null,
      recommendedAttack: persisted.dungeonDefinition?.recommendedAttack || 9,
      enemies: (persisted.enemies || (persisted.enemy ? [persisted.enemy] : [])).map((enemy) => ({
        combatantId: enemy.combatantId || null,
        id: enemy.id || enemy.definitionId || null,
        name: enemy.name || 'Enemy',
        visualAssetId: enemy.visualAssetId || null,
        hp: enemy.hp ?? null,
        maxHp: enemy.maxHp ?? null,
        isBoss: Boolean(enemy.isBoss),
        targetingProfile: enemy.targetingProfile || 'random',
      })),
      enemyCount: (persisted.enemies || (persisted.enemy ? [persisted.enemy] : [])).length,
      enemyId: persisted.enemy?.id || null,
      enemyName: `${persisted.enemy?.name || 'Enemy'}${enrageCopy}`,
      enemyVisualAssetId: persisted.enemy?.visualAssetId || null,
      enemyHp: persisted.enemy?.hp ?? null,
      enemyMaxHp: persisted.enemy?.maxHp ?? null,
      actorHp: actor?.hp ?? null,
      actorMaxHp: actor?.maxHp ?? null,
      phase: persisted.phase,
    });
    return persisted;
  }
}
