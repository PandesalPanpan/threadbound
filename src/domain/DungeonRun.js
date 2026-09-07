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
const GUARD_THREAT = 10;
const MEND_AMOUNT = 8;
const MEND_THREAT = 2;
const REVIVE_THREAT = 4;
const INTERRUPT_THREAT = 3;
const THREAT_DECAY = 2;
const INTENT_AFTER_ATTACKS = 3;
const INTENT_WINDOW_MS = 3000;

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
    return {
      playerId,
      maxHp: maxHealth,
      hp: maxHealth,
      contributionDamage: 0,
      healingDone: 0,
      revives: 0,
      damagePrevented: 0,
      firstStrikeUsed: false,
      guarding: false,
      threat: 0,
      mendCharges: 1,
      reviveCharges: 1,
    };
  });
}

export class DungeonRun {
  constructor(state) { this.state = structuredClone(state); }

  static start({ id, ownerType, ownerId, startedByPlayerId, participants, dungeonId, dungeonDefinition = null, now = new Date().toISOString() }) {
    const dungeon = dungeonDefinition ? structuredClone(dungeonDefinition) : DUNGEONS[dungeonId];
    if (!dungeon || dungeon.id !== dungeonId) throw new Error(`Unknown dungeon: ${dungeonId}`);
    if (!Array.isArray(dungeon.encounters) || dungeon.encounters.length < 1 || !dungeon.boss) throw new Error('Dungeon definition is incomplete.');
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
      version: 0,
      ownerType,
      ownerId,
      startedByPlayerId,
      dungeonId,
      dungeonDefinition: structuredClone(dungeon),
      phase: 'combat',
      encounterIndex: 0,
      participants: participantStates,
      scaling,
      runAttackBonus: 0,
      selectedUpgrade: null,
      enemy: cloneEnemy(dungeon.encounters[0], participantStates.length),
      enemyIntent: null,
      attacksSinceIntent: 0,
      rewardsGranted: false,
      rewardItemIds: {},
      createdAt: now,
      completedAt: null,
    });
  }

  hasParticipant(playerId) { return this.state.participants.some((participant) => participant.playerId === playerId); }
  participant(playerId) { return this.state.participants.find((candidate) => candidate.playerId === playerId) || null; }

  attack({ playerId, attackPower, equipmentEffect = 'none', now = new Date().toISOString() }) {
    this.#assertCombat();
    const events = [];
    this.#resolveDueIntent(events, now);
    const participant = this.#actingParticipant(playerId);
    let damage = attackPower + this.state.runAttackBonus;
    if (equipmentEffect === 'opening_strike' && !participant.firstStrikeUsed) damage += 2;
    if (equipmentEffect === 'boss_bane' && this.state.enemy.isBoss) damage += 2;
    participant.firstStrikeUsed = true;

    const enemyHpBefore = this.state.enemy.hp;
    this.state.enemy.hp = Math.max(0, this.state.enemy.hp - damage);
    const effectiveDamage = Math.min(enemyHpBefore, damage);
    participant.contributionDamage += effectiveDamage;
    participant.threat += effectiveDamage;
    events.push({ type: 'EnemyDamaged', playerId, runId: this.state.id, enemyId: this.state.enemy.id, damage: effectiveDamage });

    if (this.state.enemy.hp === 0) {
      const defeated = structuredClone(this.state.enemy);
      events.push({ type: 'EnemyDefeated', playerId, runId: this.state.id, dungeonId: this.state.dungeonId, enemyId: defeated.id, isBoss: defeated.isBoss });
      this.#advanceAfterDefeat(events, now);
      return { state: this.toJSON(), events, damage: effectiveDamage, retaliation: 0 };
    }

    const retaliation = this.#retaliate(events);
    if (this.state.phase !== 'failed') this.#maybeTelegraphIntent(events, now);
    return { state: this.toJSON(), events, damage: effectiveDamage, retaliation };
  }

  guard({ playerId, now = new Date().toISOString() }) {
    this.#assertCombat();
    const participant = this.#actingParticipant(playerId);
    participant.guarding = true;
    participant.threat += GUARD_THREAT;
    const events = [{ type: 'PlayerGuarded', playerId, runId: this.state.id, threatAdded: GUARD_THREAT }];
    let retaliation;
    if (this.state.enemyIntent) retaliation = this.#resolveIntent(events, now);
    else retaliation = this.#retaliate(events);
    return { state: this.toJSON(), events, retaliation };
  }

  interrupt({ playerId }) {
    this.#assertCombat();
    const participant = this.#actingParticipant(playerId);
    if (!this.state.enemyIntent) throw new Error('There is no enemy action to interrupt.');
    const interrupted = structuredClone(this.state.enemyIntent);
    this.state.enemyIntent = null;
    participant.threat += INTERRUPT_THREAT;
    return {
      state: this.toJSON(),
      events: [{ type: 'EnemyInterrupted', playerId, runId: this.state.id, intentId: interrupted.id, enemyId: this.state.enemy.id }],
      interrupted,
    };
  }

  mend({ playerId, targetPlayerId }) {
    this.#assertCombat();
    const participant = this.#actingParticipant(playerId);
    const target = this.participant(targetPlayerId);
    if (!target) throw new Error('Mend target is not a participant in this run.');
    if (target.hp <= 0) throw new Error('Mend cannot heal a downed player; use Revive.');
    if (target.hp >= target.maxHp) throw new Error('Mend target is already at full health.');
    if (participant.mendCharges <= 0) throw new Error('Mend has already been used this encounter.');

    participant.mendCharges -= 1;
    participant.threat += MEND_THREAT;
    const healed = Math.min(MEND_AMOUNT, target.maxHp - target.hp);
    target.hp += healed;
    participant.healingDone += healed;
    const events = [{ type: 'PlayerHealed', playerId, targetPlayerId, runId: this.state.id, amount: healed }];
    const retaliation = this.#retaliate(events);
    return { state: this.toJSON(), events, healed, retaliation };
  }

  revive({ playerId, targetPlayerId }) {
    this.#assertCombat();
    const participant = this.#actingParticipant(playerId);
    const target = this.participant(targetPlayerId);
    if (!target) throw new Error('Revive target is not a participant in this run.');
    if (target.playerId === playerId) throw new Error('Players cannot revive themselves.');
    if (target.hp > 0) throw new Error('Revive target is not downed.');
    if (participant.reviveCharges <= 0) throw new Error('Revive has already been used this run.');

    participant.reviveCharges -= 1;
    participant.revives += 1;
    participant.threat += REVIVE_THREAT;
    target.hp = Math.max(1, Math.ceil(target.maxHp * 0.3));
    target.threat = 0;
    target.guarding = false;
    const events = [{ type: 'PlayerRevived', playerId, targetPlayerId, runId: this.state.id, restoredHp: target.hp }];
    const retaliation = this.#retaliate(events);
    return { state: this.toJSON(), events, restoredHp: target.hp, retaliation };
  }

  chooseUpgrade(upgradeId) {
    if (this.state.phase !== 'upgrade') throw new Error('An upgrade can only be chosen between the normal encounters and the boss.');
    const upgrade = RUN_UPGRADES[upgradeId];
    if (!upgrade) throw new Error(`Unknown run upgrade: ${upgradeId}`);
    this.state.selectedUpgrade = upgrade.id;
    this.state.runAttackBonus += upgrade.attackBonus;
    for (const participant of this.state.participants) {
      participant.hp = Math.min(participant.maxHp, participant.hp + upgrade.heal);
      this.#resetEncounterParticipant(participant);
    }
    this.state.phase = 'boss';
    this.state.enemy = cloneEnemy(this.#dungeon().boss, this.state.participants.length, true);
    this.state.enemyIntent = null;
    this.state.attacksSinceIntent = 0;
    return { state: this.toJSON(), events: [{ type: 'RunUpgradeChosen', runId: this.state.id, upgradeId }] };
  }

  markRewards(rewardItemIds) {
    if (this.state.phase !== 'complete') throw new Error('Rewards can only be attached to completed runs.');
    if (this.state.rewardsGranted) return;
    this.state.rewardItemIds = { ...rewardItemIds };
    this.state.rewardsGranted = true;
  }

  toJSON() { return structuredClone(this.state); }

  #dungeon() {
    const dungeon = this.state.dungeonDefinition || DUNGEONS[this.state.dungeonId];
    if (!dungeon) throw new Error(`Dungeon definition unavailable: ${this.state.dungeonId}`);
    return dungeon;
  }

  #assertCombat() {
    if (!['combat', 'boss'].includes(this.state.phase)) throw new Error('The run is not currently in combat.');
  }

  #actingParticipant(playerId) {
    const participant = this.participant(playerId);
    if (!participant) throw new Error('Player is not a participant in this run.');
    if (participant.hp <= 0) throw new Error('A downed player cannot act until revived.');
    return participant;
  }

  #retaliate(events, forcedDamage = null) {
    const alive = this.state.participants.filter((participant) => participant.hp > 0);
    if (alive.length === 0) return 0;
    const target = alive.reduce((best, candidate) => candidate.threat > best.threat ? candidate : best, alive[0]);
    const rawDamage = forcedDamage ?? this.state.enemy.retaliation;
    const damage = target.guarding ? Math.max(1, Math.ceil(rawDamage / 2)) : rawDamage;
    if (target.guarding) target.damagePrevented += rawDamage - damage;
    target.guarding = false;
    target.hp = Math.max(0, target.hp - damage);
    events.push({ type: 'PlayerDamaged', playerId: target.playerId, runId: this.state.id, damage, rawDamage });
    for (const participant of this.state.participants) participant.threat = Math.max(0, participant.threat - THREAT_DECAY);
    if (this.state.participants.every((candidate) => candidate.hp === 0)) {
      this.state.phase = 'failed';
      this.state.enemyIntent = null;
      events.push({ type: 'DungeonFailed', runId: this.state.id, dungeonId: this.state.dungeonId, participantIds: this.state.participants.map((candidate) => candidate.playerId) });
    }
    return damage;
  }

  #maybeTelegraphIntent(events, now) {
    if (this.state.enemyIntent || !this.state.enemy || this.state.enemy.hp <= 0) return;
    this.state.attacksSinceIntent = (this.state.attacksSinceIntent || 0) + 1;
    if (this.state.attacksSinceIntent < INTENT_AFTER_ATTACKS) return;
    this.state.attacksSinceIntent = 0;
    const dueAt = new Date(new Date(now).getTime() + INTENT_WINDOW_MS).toISOString();
    this.state.enemyIntent = {
      id: this.state.enemy.isBoss ? 'needle-break' : 'fraying-blow',
      name: this.state.enemy.isBoss ? 'Needle Break' : 'Fraying Blow',
      damage: Math.max(this.state.enemy.retaliation + 2, this.state.enemy.retaliation * 2),
      dueAt,
    };
    events.push({ type: 'EnemyIntentTelegraphed', runId: this.state.id, enemyId: this.state.enemy.id, intent: structuredClone(this.state.enemyIntent) });
  }

  #resolveDueIntent(events, now) {
    if (!this.state.enemyIntent) return 0;
    if (new Date(now).getTime() < new Date(this.state.enemyIntent.dueAt).getTime()) return 0;
    return this.#resolveIntent(events, now);
  }

  #resolveIntent(events, _now) {
    if (!this.state.enemyIntent) return 0;
    const intent = structuredClone(this.state.enemyIntent);
    this.state.enemyIntent = null;
    const damage = this.#retaliate(events, intent.damage);
    events.push({ type: 'EnemyIntentResolved', runId: this.state.id, enemyId: this.state.enemy?.id || null, intentId: intent.id, damage });
    return damage;
  }

  #resetEncounterParticipant(participant) {
    participant.firstStrikeUsed = false;
    participant.guarding = false;
    participant.threat = 0;
    participant.mendCharges = 1;
  }

  #advanceAfterDefeat(events, now) {
    const dungeon = this.#dungeon();
    this.state.enemyIntent = null;
    this.state.attacksSinceIntent = 0;
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
      for (const participant of this.state.participants) this.#resetEncounterParticipant(participant);
      this.state.enemy = cloneEnemy(dungeon.encounters[this.state.encounterIndex], this.state.participants.length);
      return;
    }

    this.state.phase = 'upgrade';
    this.state.enemy = null;
  }
}
