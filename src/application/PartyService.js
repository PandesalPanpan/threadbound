import { randomUUID } from 'node:crypto';
import { Party } from '../domain/Party.js';

function defaultJoinCode() {
  return randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase();
}

export class PartyService {
  constructor({ repository, idFactory = randomUUID, joinCodeFactory = defaultJoinCode }) {
    this.repository = repository;
    this.idFactory = idFactory;
    this.joinCodeFactory = joinCodeFactory;
  }

  getPartyForPlayer(playerId) {
    return this.repository.getPartyForPlayer(playerId);
  }

  createParty(playerId) {
    if (this.repository.getActiveRun(playerId)) throw new Error('Finish the active dungeon before creating a party.');
    if (this.repository.getPartyForPlayer(playerId)) throw new Error('Player is already in a party.');
    const party = new Party({
      id: this.idFactory(),
      leaderPlayerId: playerId,
      joinCode: this.#uniqueJoinCode(),
      members: [{ playerId, ready: true }],
    });
    this.repository.createParty(party);
    return this.repository.getParty(party.id);
  }

  joinParty(playerId, joinCode) {
    if (this.repository.getActiveRun(playerId)) throw new Error('Finish the active dungeon before joining a party.');
    if (this.repository.getPartyForPlayer(playerId)) throw new Error('Player is already in a party.');
    const stored = this.repository.getPartyByJoinCode(String(joinCode || '').trim().toUpperCase());
    if (!stored) throw new Error('Party invite code was not found.');
    const party = new Party(stored);
    party.addMember(playerId);
    this.repository.addPartyMember(party.id, playerId, false);
    return this.repository.getParty(party.id);
  }

  setReady(playerId, ready) {
    const stored = this.repository.getPartyForPlayer(playerId);
    if (!stored) throw new Error('Player is not in a party.');
    const party = new Party(stored);
    party.setReady(playerId, ready);
    this.repository.setPartyMemberReady(party.id, playerId, Boolean(ready));
    return this.repository.getParty(party.id);
  }

  leaveParty(playerId) {
    const stored = this.repository.getPartyForPlayer(playerId);
    if (!stored) return null;
    const party = new Party(stored);
    if (party.leaderPlayerId === playerId) {
      if (party.status === 'in_run') throw new Error('The leader cannot disband a party during an active dungeon.');
      this.repository.deleteParty(party.id);
      return null;
    }
    if (party.status === 'in_run') throw new Error('Players cannot leave a party during an active dungeon.');
    party.removeMember(playerId);
    this.repository.removePartyMember(party.id, playerId);
    return null;
  }

  #uniqueJoinCode() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = this.joinCodeFactory();
      if (!this.repository.getPartyByJoinCode(code)) return code;
    }
    throw new Error('Could not allocate a unique party invite code.');
  }
}
