import { randomUUID } from 'node:crypto';
import { Character } from '../domain/Character.js';
import { AdventureRun, DUNGEONS } from '../domain/AdventureRun.js';
import { Party } from '../domain/Party.js';
import { dungeonReadiness } from '../domain/SimpleDungeonPolicy.js';
import { progressionAdventureRequirement, requireProgressionAdventureParty } from '../domain/ProgressionAdventurePolicy.js';
import { applyProgressionBossEnrage } from '../domain/ProgressionBossEnragePolicy.js';
import {
  areaContentForDungeon,
  progressionChallengeForDungeon,
  PROGRESSION_CHALLENGES,
  skillCodeForDungeonEnemy,
} from '../content/AreaContentCatalog.js';
import { SQLiteProgressionBossEnrageRepository } from '../infrastructure/SQLiteProgressionBossEnrageRepository.js';
import { SQLiteAreaRepository } from '../infrastructure/SQLiteAreaRepository.js';
import { SQLiteEquipmentRepository } from '../infrastructure/SQLiteEquipmentRepository.js';

export const AREA_ONE_PROGRESSION_DUNGEON_ID = 'progression-area-1';
const PROGRESSION_DUNGEON_IDS = new Set([
  AREA_ONE_PROGRESSION_DUNGEON_ID,
  ...PROGRESSION_CHALLENGES.map((challenge) => challenge.dungeonId),
]);

function attachAreaDungeonSkills(definition, areaNumber) {
  const withSkill = (enemy) => {
    if (!enemy || typeof enemy !== 'object') return enemy;
    const skillCode = skillCodeForDungeonEnemy(areaNumber, enemy.id || enemy.definitionId);
    return skillCode ? { ...enemy, skillCode } : enemy;
  };
  const withSkillsDeep = (value) => {
    if (Array.isArray(value)) return value.map(withSkillsDeep);
    return value && typeof value === 'object' ? withSkill(value) : value;
  };
  return {
    ...definition,
    ...(definition.encounters ? { encounters: withSkillsDeep(definition.encounters) } : {}),
    ...(definition.encounterStages ? { encounterStages: withSkillsDeep(definition.encounterStages) } : {}),
    ...(definition.encounterVariants ? { encounterVariants: withSkillsDeep(definition.encounterVariants) } : {}),
    ...(definition.encounterVariantStages ? { encounterVariantStages: withSkillsDeep(definition.encounterVariantStages) } : {}),
    ...(definition.simpleStages ? { simpleStages: withSkillsDeep(definition.simpleStages) } : {}),
    ...(definition.boss ? { boss: withSkill(definition.boss) } : {}),
  };
}

function progressionRoomStages(definition, areaContent) {
  const roomSizes = areaContent?.simpleRoomEnemyCounts;
  if (!Array.isArray(roomSizes) || roomSizes.length === 0) return definition.simpleStages;
  const sourceStages = Array.isArray(definition.encounterStages) && definition.encounterStages.length > 0
    ? definition.encounterStages
    : (definition.encounters || []).map((entry) => Array.isArray(entry) ? entry : [entry]);
  const enemies = sourceStages.flat().filter(Boolean);
  const expectedEnemyCount = roomSizes.reduce((total, size) => total + Number(size || 0), 0);
  if (!Number.isInteger(expectedEnemyCount) || expectedEnemyCount !== enemies.length
      || roomSizes.some((size) => !Number.isInteger(size) || size < 1 || size > 3)) {
    throw new Error(`Progression challenge ${areaContent.progressionChallenge?.id} has a room plan that does not match its authored enemy roster.`);
  }
  let nextEnemyIndex = 0;
  return roomSizes.map((size) => {
    const stage = enemies.slice(nextEnemyIndex, nextEnemyIndex + size);
    nextEnemyIndex += size;
    return stage;
  });
}

function progressionBalanceEnemy(enemy, balance, { boss = false, bossAdd = false } = {}) {
  if (!enemy || !balance) return enemy;
  const id = enemy.id || enemy.definitionId;
  const next = { ...enemy };
  if (!boss && !bossAdd) {
    const hpMultiplier = Number(balance.normalEnemyHpMultiplier || 1);
    if (hpMultiplier !== 1 && Number.isFinite(Number(enemy.hp))) {
      next.hp = Math.max(1, Math.ceil(Number(enemy.hp) * hpMultiplier));
    }
  }
  const retaliationMultiplier = Number(balance.enemyRetaliationMultiplier || 1);
  if (retaliationMultiplier !== 1 && Number.isFinite(Number(enemy.retaliation))) {
    next.retaliation = Math.max(1, Math.ceil(Number(enemy.retaliation) * retaliationMultiplier));
  }
  const speed = balance.enemySpeedByEnemy?.[id];
  if (Number.isInteger(speed) && speed > 0) next.speed = speed;
  const skillMana = bossAdd
    ? balance.bossAddManaByEnemy?.[id]
    : balance.skillStartingManaByEnemy?.[id];
  if (skillMana && typeof skillMana === 'object') Object.assign(next, skillMana);
  else if (Number.isFinite(Number(skillMana))) next.mana = Math.max(0, Math.floor(Number(skillMana)));
  return next;
}

function applyProgressionBalance(definition, areaContent) {
  const balance = areaContent?.simpleDungeonBalance;
  if (!balance) return definition;
  const simpleStages = (definition.simpleStages || []).map((stage) => (
    stage.map((enemy) => progressionBalanceEnemy(enemy, balance))
  ));
  const encounters = Array.isArray(definition.encounters)
    ? simpleStages.flat()
    : definition.encounters;
  return {
    ...definition,
    encounters,
    simpleStages,
    boss: progressionBalanceEnemy(definition.boss, balance, { boss: true }),
    bossAdds: (definition.bossAdds || []).map((enemy) => progressionBalanceEnemy(enemy, balance, { bossAdd: true })),
  };
}

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
  bossAdds: Object.freeze([
    Object.freeze({ id: 'ribbon-boar', name: 'Ribbon Boar', hp: 16, retaliation: 4, defense: 2, speed: 12, visualAssetId: 'mob.brown-boar.v1', targetingProfile: 'hunter', skillCode: 'shield-break' }),
  ]),
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

function progressionSourceAreaForDungeon(dungeonId) {
  const normalized = String(dungeonId || '').trim().toLowerCase();
  if (normalized === AREA_ONE_PROGRESSION_DUNGEON_ID) return areaContentForDungeon('brightbell-trial');
  if (!progressionChallengeForDungeon(normalized)) return null;
  return areaContentForDungeon(normalized);
}

/**
 * New player-facing dungeon use case. The legacy start path remains temporarily
 * available for migration/old acceptance fixtures, while this path creates the
 * new automatic stat-check run. Progression Adventures reuse this run boundary
 * but add an authoritative two-human party gate before any run is persisted.
 */
export class SimpleDungeonService {
  constructor({ repository, eventBus, arcManifestService = null, areaRepository = null, equipmentRepository = null, enrageRepository = null, idFactory = randomUUID }) {
    this.repository = repository;
    this.eventBus = eventBus;
    this.arcManifestService = arcManifestService;
    this.areaRepository = areaRepository || new SQLiteAreaRepository({ database: repository.db });
    this.equipmentRepository = equipmentRepository || new SQLiteEquipmentRepository({ database: repository.db });
    this.enrageRepository = enrageRepository || new SQLiteProgressionBossEnrageRepository({ database: repository.db });
    this.idFactory = idFactory;

    eventBus.subscribe((event) => {
      if (!PROGRESSION_DUNGEON_IDS.has(event.dungeonId) || !event.runId) return;
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
    const definition = DUNGEONS[dungeonId] || this.arcManifestService?.resolveDungeon(dungeonId) || null;
    if (!definition) return null;
    const challenge = progressionChallengeForDungeon(definition.id || dungeonId);
    const areaContent = areaContentForDungeon(definition.id || dungeonId);
    const areaDefinition = areaContent ? attachAreaDungeonSkills(definition, areaContent.number) : definition;
    if (!challenge) return areaDefinition;
    const progressionDefinition = {
      ...areaDefinition,
      simpleStages: progressionRoomStages(areaDefinition, areaContent),
      bossAdds: challenge.bossAdds || areaDefinition.bossAdds || [],
      progressionAdventure: true,
      progressionChallengeId: challenge.id,
      unlocksAreaNumber: challenge.unlocksAreaNumber,
      requiredHumanPlayers: challenge.requiredHumanPlayers,
      progressionAreaNumber: areaContent?.number || null,
      recommendedLevelBand: challenge.recommendedLevel,
    };
    const balancedDefinition = applyProgressionBalance(progressionDefinition, areaContent);
    return applyProgressionBossEnrage(balancedDefinition, this.enrageRepository.get(definition.id || dungeonId));
  }

  readiness(playerId, dungeonId) {
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const definition = this.definition(dungeonId);
    if (!definition) throw new Error(`Unknown dungeon: ${dungeonId}`);
    const storedParty = this.repository.getPartyForPlayer(playerId);
    const party = storedParty ? new Party(storedParty) : null;
    const ids = party ? party.participantIds() : [playerId];
    const progressionChallenge = progressionChallengeForDungeon(definition.id || dungeonId);
    const requiredAreaNumber = progressionSourceAreaForDungeon(definition.id || dungeonId)?.number || null;
    const members = ids.map((id) => {
      const row = this.repository.getPlayer(id);
      const memberAreaNumber = this.areaRepository.get(id).currentAreaNumber;
      const equipment = this.equipmentRepository.getLoadout(id);
      const equipped = equipment.weapon || (row?.equippedItemId ? this.repository.getItem(row.equippedItemId) : null);
      const character = row ? new Character({ ...row, equippedItem: equipped, equipment }) : null;
      const check = dungeonReadiness({
        attackPower: character?.attackPower || 0,
        maxHealth: character?.stats.maxHp || 0,
        currentHealth: row?.currentHealth || 0,
        definition,
      });
      return {
        playerId: id,
        displayName: row?.displayName || 'Unknown Adventurer',
        currentHealth: row?.currentHealth || 0,
        maxHealth: character?.stats.maxHp || 0,
        currentAreaNumber: memberAreaNumber,
        progressionAreaMet: !requiredAreaNumber || memberAreaNumber === requiredAreaNumber,
        ...check,
      };
    });
    const progressionRequirement = definition.progressionAdventure
      ? progressionAdventureRequirement({ definition, party })
      : null;
    const currentAreaNumber = this.areaRepository.get(playerId).currentAreaNumber;
    const progressionAreaMismatches = members.filter((member) => !member.progressionAreaMet).map((member) => Object.freeze({
      playerId: member.playerId,
      currentAreaNumber: member.currentAreaNumber,
      requiredAreaNumber,
    }));
    const progressionAreaMet = progressionAreaMismatches.length === 0;
    return {
      dungeonId,
      dungeonName: definition.name,
      recommendedAttack: Number(definition.recommendedAttack || 9),
      progressionAdventure: Boolean(definition.progressionAdventure),
      progressionEnrage: definition.progressionEnrage || null,
      requiredHumanPlayers: progressionRequirement?.requiredHumanPlayers || null,
      progressionAreaNumber: requiredAreaNumber,
      currentAreaNumber,
      progressionAreaMet,
      progressionAreaMismatches: Object.freeze(progressionAreaMismatches),
      partyRequirementMet: progressionRequirement?.satisfied ?? true,
      ready: members.every((member) => member.ready) && (progressionRequirement?.satisfied ?? true) && progressionAreaMet,
      members,
    };
  }

  startDungeon(playerId, dungeonId, { sharedSurface = true } = {}) {
    if (this.repository.getActiveRun(playerId)) throw new Error('Finish or fail the active run before starting another.');
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const dungeonDefinition = this.definition(dungeonId);
    if (!dungeonDefinition) throw new Error(`Unknown dungeon: ${dungeonId}`);
    const progressionChallenge = progressionChallengeForDungeon(dungeonDefinition.id || dungeonId);
    const requiredAreaNumber = progressionSourceAreaForDungeon(dungeonDefinition.id || dungeonId)?.number;

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

    if (dungeonDefinition.progressionAdventure && requiredAreaNumber) {
      const mismatchedParticipants = participantPlayers.filter((participant) => (
        this.areaRepository.get(participant.id).currentAreaNumber !== requiredAreaNumber
      ));
      if (mismatchedParticipants.length > 0) {
        const names = mismatchedParticipants.map((participant) => participant.displayName || 'A party member').join(', ');
        const challengeName = progressionChallenge?.name || dungeonDefinition.name || 'this Dungeon';
        const error = new Error(`Every party member must travel to Area ${requiredAreaNumber} before starting ${challengeName}. ${names} ${mismatchedParticipants.length === 1 ? 'is' : 'are'} elsewhere.`);
        error.code = 'progression_challenge_area_mismatch';
        error.areaNumber = requiredAreaNumber;
        error.mismatchedPlayerIds = mismatchedParticipants.map((participant) => participant.id);
        throw error;
      }
    }

    const participantSnapshots = participantPlayers.map((participant) => {
      const equipment = this.equipmentRepository.getLoadout(participant.id);
      const character = new Character({ ...participant, equippedItem: equipment.weapon, equipment });
      return {
        playerId: participant.id,
        maxHealth: Number(character.stats.maxHp),
        currentHealth: Number(participant.currentHealth || 0),
      };
    });
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
      participants: participantSnapshots,
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
