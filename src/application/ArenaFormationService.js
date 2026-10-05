import { normalizePlayerArenaPosition } from '../domain/ArenaFormationPolicy.js';

export class ArenaFormationService {
  constructor({ repository, eventBus = null }) {
    if (!repository) throw new Error('ArenaFormationService requires the game repository.');
    this.repository = repository;
    this.eventBus = eventBus;
  }

  get(playerId) {
    const saved = this.repository.getArenaFormation(playerId);
    const party = this.repository.getPartyForPlayer(playerId);
    return {
      playerId,
      position: saved.position,
      version: saved.version,
      members: (party?.members || [{ playerId }]).map((member) => ({
        playerId: member.playerId,
        position: this.repository.getArenaFormation(member.playerId).position,
      })),
    };
  }

  set(playerId, position, expectedVersion) {
    const activeRun = this.repository.getActiveRun(playerId);
    if (activeRun) {
      const error = new Error(activeRun.simpleCombat && activeRun.phase === 'between_encounter'
        ? 'Use the Dungeon formation controls to adjust placement between rooms.'
        : 'Opening formation can only change before a Dungeon run starts.');
      error.code = 'formation_during_run';
      throw error;
    }
    const normalized = normalizePlayerArenaPosition(position, playerId);
    const current = this.repository.getArenaFormation(playerId);
    const expected = Number(expectedVersion);
    if (!Number.isInteger(expected) || expected < 0) {
      const error = new Error('Formation version is required. Refresh your party card and retry.');
      error.code = 'invalid_formation_version';
      throw error;
    }
    if (current.version !== expected) {
      const error = new Error('Your saved formation changed before this placement could be saved. Refresh and retry.');
      error.code = 'stale_formation_version';
      throw error;
    }
    const party = this.repository.getPartyForPlayer(playerId);
    if (party) {
      const collision = party.members.find((member) => member.playerId !== playerId
        && this.repository.getArenaFormation(member.playerId).position?.x === normalized.x
        && this.repository.getArenaFormation(member.playerId).position?.y === normalized.y);
      if (collision) {
        const error = new Error('Each party member needs a separate starting tile.');
        error.code = 'arena_formation_tile_occupied';
        throw error;
      }
    }
    if (current.position?.x === normalized.x && current.position?.y === normalized.y) return this.get(playerId);
    const saved = this.repository.saveArenaFormation(playerId, normalized, expected, {
      resetPartyId: party?.status === 'forming' ? party.id : null,
    });
    const event = {
      type: 'ArenaFormationChanged',
      playerId,
      partyId: party?.id || null,
      participantIds: party?.members.map((member) => member.playerId) || [playerId],
      position: saved.position,
      formationVersion: saved.version,
      readinessReset: party?.status === 'forming' && party.members.some((member) => member.ready),
    };
    this.eventBus?.publish(event);
    return this.get(playerId);
  }
}
