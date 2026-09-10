import { randomUUID } from 'node:crypto';
import { Character } from '../domain/Character.js';
import { AdventureRun, DUNGEONS } from '../domain/AdventureRun.js';
import { Party } from '../domain/Party.js';
import { dungeonReadiness } from '../domain/SimpleDungeonPolicy.js';

/**
 * New player-facing dungeon use case. The legacy start path remains temporarily
 * available for migration/old acceptance fixtures, while this path creates the
 * new attack-only stat-check run.
 */
export class SimpleDungeonService {
  constructor({ repository, eventBus, arcManifestService = null, idFactory = randomUUID }) {
    this.repository = repository;
    this.eventBus = eventBus;
    this.arcManifestService = arcManifestService;
    this.idFactory = idFactory;
  }

  definition(dungeonId) {
    return DUNGEONS[dungeonId] || this.arcManifestService?.resolveDungeon(dungeonId) || null;
  }

  readiness(playerId, dungeonId) {
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const definition = this.definition(dungeonId);
    if (!definition) throw new Error(`Unknown dungeon: ${dungeonId}`);
    const party = this.repository.getPartyForPlayer(playerId);
    const ids = party ? party.members.map((member) => member.playerId) : [playerId];
    const members = ids.map((id) => {
      const row = this.repository.getPlayer(id);
      const equipped = row?.equippedItemId ? this.repository.getItem(row.equippedItemId) : null;
      const character = row ? new Character({ ...row, equippedItem: equipped }) : null;
      const check = dungeonReadiness({
        attackPower: character?.attackPower || 0,
        maxHealth: character?.maxHealth || 0,
        definition,
      });
      return {
        playerId: id,
        displayName: row?.displayName || 'Unknown Weaver',
        ...check,
      };
    });
    return {
      dungeonId,
      dungeonName: definition.name,
      recommendedAttack: Number(definition.recommendedAttack || 9),
      ready: members.every((member) => member.ready),
      members,
    };
  }

  startDungeon(playerId, dungeonId) {
    if (this.repository.getActiveRun(playerId)) throw new Error('Finish or fail the active run before starting another.');
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const dungeonDefinition = this.definition(dungeonId);
    if (!dungeonDefinition) throw new Error(`Unknown dungeon: ${dungeonId}`);

    const storedParty = this.repository.getPartyForPlayer(playerId);
    let participantPlayers;
    let ownerType;
    let ownerId;

    if (storedParty) {
      const party = new Party(storedParty);
      if (!party.canStart(playerId)) throw new Error('Only the ready party leader can start a dungeon.');
      participantPlayers = party.participantIds().map((participantId) => {
        if (this.repository.getActiveRun(participantId)) throw new Error('A party member is already in an active dungeon.');
        const participant = this.repository.getPlayer(participantId);
        if (!participant) throw new Error('Party member was not found.');
        return participant;
      });
      ownerType = 'party';
      ownerId = party.id;
    } else {
      participantPlayers = [player];
      ownerType = 'player';
      ownerId = player.id;
    }

    const run = AdventureRun.startSimple({
      id: this.idFactory(),
      ownerType,
      ownerId,
      startedByPlayerId: playerId,
      participants: participantPlayers.map((participant) => ({ playerId: participant.id, maxHealth: participant.maxHealth })),
      dungeonId,
      dungeonDefinition,
    });
    const persisted = this.repository.createRun(run.toJSON());
    const actor = persisted.participants.find((participant) => participant.playerId === playerId);
    this.eventBus.publish({
      type: 'DungeonStarted',
      playerId,
      participantIds: persisted.participants.map((participant) => participant.playerId),
      runId: persisted.id,
      dungeonId,
      ownerType,
      ownerId,
      simpleCombat: true,
      recommendedAttack: persisted.dungeonDefinition?.recommendedAttack || 9,
      enemyId: persisted.enemy?.id || null,
      enemyName: persisted.enemy?.name || null,
      enemyHp: persisted.enemy?.hp ?? null,
      enemyMaxHp: persisted.enemy?.maxHp ?? null,
      actorHp: actor?.hp ?? null,
      actorMaxHp: actor?.maxHp ?? null,
      phase: persisted.phase,
    });
    return persisted;
  }
}
