export const DUNGEONS = Object.freeze({
  'frayed-hollow': Object.freeze({
    id: 'frayed-hollow',
    name: 'Frayed Hollow',
    recommendedPlayers: 2,
    minPlayers: 1,
    maxPlayers: 4,
    encounters: Object.freeze([
      Object.freeze({ id: 'frayed-wisp', name: 'Frayed Wisp', hp: 12, retaliation: 2 }),
      Object.freeze({ id: 'hollow-stalker', name: 'Hollow Stalker', hp: 12, retaliation: 2 }),
      Object.freeze({ id: 'silkbound-guard', name: 'Silkbound Guard', hp: 12, retaliation: 2 }),
    ]),
    boss: Object.freeze({ id: 'first-needle', name: 'The First Needle', hp: 24, retaliation: 4 }),
  }),
});

export const RUN_UPGRADES = Object.freeze({
  sharpen: Object.freeze({ id: 'sharpen', name: 'Sharpen the Thread', attackBonus: 3, heal: 0 }),
  reinforce: Object.freeze({ id: 'reinforce', name: 'Reinforce the Weave', attackBonus: 0, heal: 12 }),
});

const HEALTH_MULTIPLIERS = Object.freeze([0, 1, 1.65, 2.25, 2.8]);
const RETALIATION_MULTIPLIERS = Object.freeze([0, 1, 1.15, 1.3, 1.45]);

export function scalingForPlayerCount(playerCount) {
  if (!Number.isInteger(playerCount) || playerCount < 1 || playerCount > 4) {
    throw new Error('Dungeon player count must be between 1 and 4.');
  }
  return {
    playerCount,
    enemyHealthMultiplier: HEALTH_MULTIPLIERS[playerCount],
    retaliationMultiplier: RETALIATION_MULTIPLIERS[playerCount],
  };
}

function cloneEnemy(definition, playerCount, isBoss = false) {
  const scaling = scalingForPlayerCount(playerCount);
  const hp = Math.ceil(definition.hp * scaling.enemyHealthMultiplier);
  return {
    id: definition.id,
    name: definition.name,
    hp,
    maxHp: hp,
    retaliation: Math.ceil(definition.retaliation * scaling.retaliationMultiplier),
    isBoss,
  };
}

function freshParticipants(participants) {
  if (!Array.isArray(participants) || participants.length < 1 || participants.length > 4) {
    throw new Error('Dungeon requires between 1 and 4 participants.');
  }
  const ids = new Set();
  return participants.map(({ playerId, maxHealth }) => {
    if (!playerId || !Number.isInteger(maxHealth) || maxHealth <= 0) throw new Error('Each participant requires playerId and positive maxHealth.');
    if (ids.has(playerId)) throw new Error('Dungeon participants must be unique.');
    ids.add(playerId);
    return { playerId, maxHp: maxHealth, hp: maxHealth, contributionDamage: 0, firstStrikeUsed: false };
  });
}

export class DungeonRun {
  constructor(state) { this.state = structuredClone(state); }

  static start({
    id,
    ownerType,
    ownerId,
    startedByPlayerId,
    participants,
    dungeonId,
    now = new Date().toISOString(),
  }) {
    const dungeon = DUNGEONS[dungeonId];
    if (!dungeon) throw new Error(`Unknown dungeon: ${dungeonId}`);
    if (!['player', 'party'].includes(ownerType)) throw new Error('Dungeon ownerType must be player or party.');
    if (!ownerId || !startedByPlayerId) throw new Error('Dungeon requires ownerId and startedByPlayerId.');

    const participantStates = freshParticipants(participants);
    if (!participantStates.some((participant) => participant.playerId === startedByPlayerId)) {
      throw new Error('The player starting the dungeon must be a participant.');
    }
    if (participantStates.length < dungeon.minPlayers || participantStates.length > dungeon.maxPlayers) {
      throw new Error('Dungeon participant count is outside the allowed range.');
    }

    const scaling = scalingForPlayerCount(participantStates.length);
    return new DungeonRun({
      id,
      ownerType,
      ownerId,
      startedByPlayerId,
      dungeonId,
      phase: 'combat',
      encounterIndex: 0,
      participants: participantStates,
      scaling,
      runAttackBonus: 0,
      selectedUpgrade: null,
      enemy: cloneEnemy(dungeon.encounters[0], participantStates.length),
      rewardsGranted: false,
      rewardItemIds: {},
      createdAt: now,
      completedAt: null,
    });
  }

  hasParticipant(playerId) {
    return this.state.participants.some((participant) => participant.playerId === playerId);
  }

  participant(playerId) {
    return this.state.participants.find((candidate) => candidate.playerId === playerId) || null;
  }

  attack({ playerId, attackPower, equipmentEffect = 'none', now = new Date().toISOString() }) {
    if (!['combat', 'boss'].includes(this.state.phase)) throw new Error('The run is not currently in combat.');
    const participant = this.participant(playerId);
    if (!participant) throw new Error('Player is not a participant in this run.');
    if (participant.hp <= 0) throw new Error('A defeated player cannot attack until the run ends.');

    const events = [];
    let damage = attackPower + this.state.runAttackBonus;
    if (equipmentEffect === 'opening_strike' && !participant.firstStrikeUsed) damage += 2;
    if (equipmentEffect === 'boss_bane' && this.state.enemy.isBoss) damage += 2;
    participant.firstStrikeUsed = true;

    const enemyHpBefore = this.state.enemy.hp;
    this.state.enemy.hp = Math.max(0, this.state.enemy.hp - damage);
    const effectiveDamage = Math.min(enemyHpBefore, damage);
    participant.contributionDamage += effectiveDamage;
    events.push({ type: 'EnemyDamaged', playerId, runId: this.state.id, enemyId: this.state.enemy.id, damage: effectiveDamage });

    if (this.state.enemy.hp === 0) {
      const defeated = structuredClone(this.state.enemy);
      events.push({ type: 'EnemyDefeated', playerId, runId: this.state.id, dungeonId: this.state.dungeonId, enemyId: defeated.id, isBoss: defeated.isBoss });
      this.#advanceAfterDefeat(events, now);
      return { state: this.toJSON(), events, damage: effectiveDamage, retaliation: 0 };
    }

    const retaliation = this.state.enemy.retaliation;
    participant.hp = Math.max(0, participant.hp - retaliation);
    events.push({ type: 'PlayerDamaged', playerId, runId: this.state.id, damage: retaliation });
    if (this.state.participants.every((candidate) => candidate.hp === 0)) {
      this.state.phase = 'failed';
      events.push({ type: 'DungeonFailed', runId: this.state.id, dungeonId: this.state.dungeonId, participantIds: this.state.participants.map((candidate) => candidate.playerId) });
    }
    return { state: this.toJSON(), events, damage: effectiveDamage, retaliation };
  }

  chooseUpgrade(upgradeId) {
    if (this.state.phase !== 'upgrade') throw new Error('An upgrade can only be chosen between the normal encounters and the boss.');
    const upgrade = RUN_UPGRADES[upgradeId];
    if (!upgrade) throw new Error(`Unknown run upgrade: ${upgradeId}`);
    this.state.selectedUpgrade = upgrade.id;
    this.state.runAttackBonus += upgrade.attackBonus;
    for (const participant of this.state.participants) {
      participant.hp = Math.min(participant.maxHp, participant.hp + upgrade.heal);
      participant.firstStrikeUsed = false;
    }
    this.state.phase = 'boss';
    this.state.enemy = cloneEnemy(DUNGEONS[this.state.dungeonId].boss, this.state.participants.length, true);
    return { state: this.toJSON(), events: [{ type: 'RunUpgradeChosen', runId: this.state.id, upgradeId }] };
  }

  markRewards(rewardItemIds) {
    if (this.state.phase !== 'complete') throw new Error('Rewards can only be attached to completed runs.');
    if (this.state.rewardsGranted) return;
    this.state.rewardItemIds = { ...rewardItemIds };
    this.state.rewardsGranted = true;
  }

  toJSON() { return structuredClone(this.state); }

  #advanceAfterDefeat(events, now) {
    const dungeon = DUNGEONS[this.state.dungeonId];
    if (this.state.phase === 'boss') {
      this.state.phase = 'complete';
      this.state.enemy = null;
      this.state.completedAt = now;
      events.push({ type: 'BossDefeated', runId: this.state.id, dungeonId: this.state.dungeonId });
      events.push({ type: 'DungeonCompleted', runId: this.state.id, dungeonId: this.state.dungeonId, participantIds: this.state.participants.map((participant) => participant.playerId) });
      return;
    }

    if (this.state.encounterIndex < dungeon.encounters.length - 1) {
      this.state.encounterIndex += 1;
      for (const participant of this.state.participants) participant.firstStrikeUsed = false;
      this.state.enemy = cloneEnemy(dungeon.encounters[this.state.encounterIndex], this.state.participants.length);
      return;
    }

    this.state.phase = 'upgrade';
    this.state.enemy = null;
  }
}
