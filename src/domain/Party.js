export class Party {
  constructor({ id, leaderPlayerId, joinCode, status = 'forming', members = [] }) {
    if (!id || !leaderPlayerId || !joinCode) throw new Error('Party requires id, leaderPlayerId, and joinCode.');
    this.id = id;
    this.leaderPlayerId = leaderPlayerId;
    this.joinCode = joinCode;
    this.status = status;
    this.members = members.map((member) => ({ ...member }));
  }

  addMember(playerId) {
    if (this.status !== 'forming') throw new Error('Players can only join a forming party.');
    if (this.members.some((member) => member.playerId === playerId)) return;
    if (this.members.length >= 4) throw new Error('Party is full.');
    this.members.push({ playerId, ready: false });
  }

  setReady(playerId, ready) {
    const member = this.members.find((candidate) => candidate.playerId === playerId);
    if (!member) throw new Error('Player is not a member of this party.');
    if (this.status !== 'forming') throw new Error('Party readiness can only change while forming.');
    member.ready = Boolean(ready);
  }

  removeMember(playerId) {
    if (playerId === this.leaderPlayerId) throw new Error('The leader must disband the party instead of leaving it.');
    this.members = this.members.filter((member) => member.playerId !== playerId);
  }

  get allReady() {
    return this.members.length > 0 && this.members.every((member) => member.ready);
  }

  canStart(playerId) {
    return this.status === 'forming' && playerId === this.leaderPlayerId && this.allReady;
  }

  participantIds() {
    return this.members.map((member) => member.playerId);
  }
}
