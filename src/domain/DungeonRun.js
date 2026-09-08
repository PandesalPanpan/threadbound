import { nextEnemyIntent, resolveEnemyIntent } from './CombatIntentPolicy.js';
import { combatSkill, MAX_FOCUS } from './CombatSkillCatalog.js';

export const DUNGEONS = Object.freeze({
  'frayed-hollow': Object.freeze({
    id: 'frayed-hollow',
    name: 'Frayed Hollow',
    recommendedPlayers: 2,
    minPlayers: 1,
    maxPlayers: 4,
    encounters: Object.freeze([
      Object.freeze({ id: 'frayed-wisp', name: 'Frayed Wisp', hp: 12, retaliation: 2, abilities: Object.freeze(['self_mend']), intentCadence: 1 }),
      Object.freeze({ id: 'hollow-stalker', name: 'Hollow Stalker', hp: 12, retaliation: 2, abilities: Object.freeze(['heavy_pressure']), intentCadence: 1 }),
      Object.freeze({ id: 'silkbound-guard', name: 'Silkbound Guard', hp: 12, retaliation: 2, abilities: Object.freeze(['heavy_pressure', 'self_mend']), intentCadence: 1 }),
    ]),
    boss: Object.freeze({ id: 'first-needle', name: 'The First Needle', hp: 24, retaliation: 4, abilities: Object.freeze(['basic_retaliation']), intentCadence: 3 }),
  }),
});

export const RUN_UPGRADES = Object.freeze({
  sharpen: Object.freeze({ id: 'sharpen', name: 'Sharpen the Thread', attackBonus: 3, heal: 0, reactionStyle: null }),
  reinforce: Object.freeze({ id: 'reinforce', name: 'Reinforce the Weave', attackBonus: 0, heal: 12, reactionStyle: null }),
  riposte: Object.freeze({ id: 'riposte', name: 'Riposte Weave', attackBonus: 0, heal: 4, reactionStyle: 'guard' }),
  disrupt: Object.freeze({ id: 'disrupt', name: 'Disruptor Knot', attackBonus: 0, heal: 4, reactionStyle: 'interrupt' }),
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
const PHASE_TWO_INTENT_AFTER_ACTIONS = 2;
const RIPOSTE_BONUS = 3;
const DISRUPT_BONUS = 4;

export function scalingForPlayerCount(playerCount) {
  if (!Number.isInteger(playerCount) || playerCount < 1 || playerCount > 4) throw new Error('Dungeon player count must be between 1 and 4.');
  return { playerCount, enemyHealthMultiplier: HEALTH_MULTIPLIERS[playerCount], retaliationMultiplier: RETALIATION_MULTIPLIERS[playerCount] };
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
    abilities: [...(definition.abilities || ['basic_retaliation'])],
    intentCadence: Number.isInteger(definition.intentCadence) && definition.intentCadence > 0 ? definition.intentCadence : INTENT_AFTER_ATTACKS,
    isBoss,
    battlePhase: isBoss ? 1 : 0,
    phaseName: isBoss ? 'Stitching' : null,
    statuses: { exposed: 0 },
  };
}

function freshParticipants(participants) {
  if (!Array.isArray(participants) || participants.length < 1 || participants.length > 4) throw new Error('Dungeon requires between 1 and 4 participants.');
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
      reactionDamageBonus: 0,
      successfulGuards: 0,
      successfulInterrupts: 0,
      focus: 0,
      maxFocus: MAX_FOCUS,
      skillCooldowns: {},
    };
  });
}

export class DungeonRun {
  constructor(state) {
    this.state = structuredClone(state);
    this.state.intentCount ??= 0;
    this.state.reactionStyle ??= null;
    if (this.state.enemy) {
      this.state.enemy.statuses ??= { exposed: 0 };
      this.state.enemy.abilities ??= [];
      this.state.enemy.intentCadence ??= INTENT_AFTER_ATTACKS;
      this.state.enemy.battlePhase ??= this.state.enemy.isBoss ? 1 : 0;
      this.state.enemy.phaseName ??= this.state.enemy.isBoss ? (this.state.enemy.battlePhase >= 2 ? 'Unraveling' : 'Stitching') : null;
    }
    for (const participant of this.state.participants || []) {
      participant.reactionDamageBonus ??= 0;
      participant.successfulGuards ??= 0;
      participant.successfulInterrupts ??= 0;
      participant.focus ??= 0;
      participant.maxFocus ??= MAX_FOCUS;
      participant.skillCooldowns ??= {};
    }
  }

  static start({ id, ownerType, ownerId, startedByPlayerId, participants, dungeonId, dungeonDefinition = null, now = new Date().toISOString() }) {
    const dungeon = dungeonDefinition ? structuredClone(dungeonDefinition) : DUNGEONS[dungeonId];
    if (!dungeon || dungeon.id !== dungeonId) throw new Error(`Unknown dungeon: ${dungeonId}`);
    if (!Array.isArray(dungeon.encounters) || dungeon.encounters.length < 1 || !dungeon.boss) throw new Error('Dungeon definition is incomplete.');
    if (!['player', 'party'].includes(ownerType)) throw new Error('Dungeon ownerType must be player or party.');
    if (!ownerId || !startedByPlayerId) throw new Error('Dungeon requires ownerId and startedByPlayerId.');
    const participantStates = freshParticipants(participants);
    if (!participantStates.some((participant) => participant.playerId === startedByPlayerId)) throw new Error('The player starting the dungeon must be a participant.');
    if (participantStates.length < dungeon.minPlayers || participantStates.length > dungeon.maxPlayers) throw new Error('Dungeon participant count is outside the allowed range.');
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
      reactionStyle: null,
      enemy: cloneEnemy(dungeon.encounters[0], participantStates.length),
      enemyIntent: null,
      attacksSinceIntent: 0,
      intentCount: 0,
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
    const participant = this.#actingParticipant(playerId);
    this.#beginAction(participant);
    let ignoredRetaliation = 0;
    if (this.state.enemyIntent) {
      const ignoredIntent = structuredClone(this.state.enemyIntent);
      const resolved = this.#resolveIntent(events, now, 'ignored');
      ignoredRetaliation = resolved.damage || 0;
      events.push({ type: 'EnemyIntentIgnored', playerId, runId: this.state.id, intentId: ignoredIntent.id, reaction: ignoredIntent.reaction, result: resolved });
      if (this.state.phase === 'failed') return { state: this.toJSON(), events, damage: 0, retaliation: ignoredRetaliation };
      if (this.participant(playerId)?.hp <= 0) return { state: this.toJSON(), events, damage: 0, retaliation: ignoredRetaliation };
    }
    let damage = attackPower + this.state.runAttackBonus + participant.reactionDamageBonus;
    participant.reactionDamageBonus = 0;
    if (equipmentEffect === 'opening_strike' && !participant.firstStrikeUsed) damage += 2;
    if (equipmentEffect === 'boss_bane' && this.state.enemy.isBoss) damage += 2;
    participant.firstStrikeUsed = true;
    const effectiveDamage = this.#damageEnemy(participant, damage, events, playerId);
    this.#grantFocus(participant, 1, events);
    if (this.state.enemy.hp === 0) {
      this.#defeatCurrentEnemy(events, playerId, now);
      return { state: this.toJSON(), events, damage: effectiveDamage, retaliation: ignoredRetaliation };
    }
    const retaliation = ignoredRetaliation || this.#retaliate(events);
    if (this.state.phase !== 'failed') this.#maybeTelegraphIntent(events, now);
    return { state: this.toJSON(), events, damage: effectiveDamage, retaliation };
  }

  guard({ playerId, now = new Date().toISOString() }) {
    this.#assertCombat();
    const participant = this.#actingParticipant(playerId);
    this.#beginAction(participant);
    participant.guarding = true;
    participant.threat += GUARD_THREAT;
    const events = [{ type: 'PlayerGuarded', playerId, runId: this.state.id, threatAdded: GUARD_THREAT }];
    let retaliation = 0;
    if (this.state.enemyIntent) {
      const intended = structuredClone(this.state.enemyIntent);
      const resolved = this.#resolveIntent(events, now, 'guard', playerId);
      retaliation = resolved.damage || 0;
      if (intended.reaction === 'guard') {
        participant.successfulGuards += 1;
        this.#grantFocus(participant, 1, events);
        if (this.state.reactionStyle === 'guard') participant.reactionDamageBonus += RIPOSTE_BONUS;
        events.push({ type: 'CombatReactionSucceeded', playerId, runId: this.state.id, reaction: 'guard', intentId: intended.id, bonusDamage: this.state.reactionStyle === 'guard' ? RIPOSTE_BONUS : 0 });
      }
    } else retaliation = this.#retaliate(events);
    return { state: this.toJSON(), events, retaliation };
  }

  interrupt({ playerId }) {
    this.#assertCombat();
    const participant = this.#actingParticipant(playerId);
    this.#beginAction(participant);
    if (!this.state.enemyIntent) throw new Error('There is no enemy action to interrupt.');
    const interrupted = structuredClone(this.state.enemyIntent);
    this.state.enemyIntent = null;
    participant.threat += INTERRUPT_THREAT;
    participant.successfulInterrupts += 1;
    this.#grantFocus(participant, 1, []);
    if (this.state.reactionStyle === 'interrupt') participant.reactionDamageBonus += DISRUPT_BONUS;
    return {
      state: this.toJSON(),
      events: [
        { type: 'EnemyInterrupted', playerId, runId: this.state.id, intentId: interrupted.id, enemyId: this.state.enemy.id },
        { type: 'FocusChanged', playerId, runId: this.state.id, focus: participant.focus, maxFocus: participant.maxFocus },
        { type: 'CombatReactionSucceeded', playerId, runId: this.state.id, reaction: 'interrupt', intentId: interrupted.id, bonusDamage: this.state.reactionStyle === 'interrupt' ? DISRUPT_BONUS : 0 },
      ],
      interrupted,
    };
  }

  mend({ playerId, targetPlayerId }) {
    this.#assertCombat();
    const participant = this.#actingParticipant(playerId);
    this.#beginAction(participant);
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
    this.#beginAction(participant);
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

  useSkill({ playerId, skillId, attackPower, now = new Date().toISOString() }) {
    this.#assertCombat();
    const participant = this.#actingParticipant(playerId);
    this.#beginAction(participant);
    const skill = combatSkill(skillId);
    const remaining = Number(participant.skillCooldowns[skill.id] || 0);
    if (remaining > 0) throw new Error(`${skill.name} is on cooldown for ${remaining} more action${remaining === 1 ? '' : 's'}.`);
    if (participant.focus < skill.cost) throw new Error(`${skill.name} requires ${skill.cost} Focus.`);

    const events = [];
    let retaliation = 0;
    let interruptedIntent = null;
    if (this.state.enemyIntent) {
      if (skill.interrupts) {
        interruptedIntent = structuredClone(this.state.enemyIntent);
        this.state.enemyIntent = null;
        participant.successfulInterrupts += 1;
        events.push({ type: 'EnemyInterrupted', playerId, runId: this.state.id, intentId: interruptedIntent.id, enemyId: this.state.enemy.id, bySkillId: skill.id });
        events.push({ type: 'CombatReactionSucceeded', playerId, runId: this.state.id, reaction: 'interrupt', intentId: interruptedIntent.id, bySkillId: skill.id, bonusDamage: 0 });
      } else {
        const ignoredIntent = structuredClone(this.state.enemyIntent);
        const resolved = this.#resolveIntent(events, now, 'ignored');
        retaliation = resolved.damage || 0;
        events.push({ type: 'EnemyIntentIgnored', playerId, runId: this.state.id, intentId: ignoredIntent.id, reaction: ignoredIntent.reaction, result: resolved });
        if (this.state.phase === 'failed' || this.participant(playerId)?.hp <= 0) return { state: this.toJSON(), events, skillId: skill.id, damage: 0, healed: 0, retaliation };
      }
    }

    participant.focus -= skill.cost;
    participant.skillCooldowns[skill.id] = skill.cooldown;
    events.push({ type: 'CombatSkillUsed', playerId, runId: this.state.id, skillId: skill.id, focusCost: skill.cost });
    events.push({ type: 'FocusChanged', playerId, runId: this.state.id, focus: participant.focus, maxFocus: participant.maxFocus });

    let damage = 0;
    let healed = 0;
    if (skill.kind === 'damage') {
      let rawDamage = attackPower + this.state.runAttackBonus + skill.damageBonus + participant.reactionDamageBonus;
      participant.reactionDamageBonus = 0;
      const exposed = Number(this.state.enemy.statuses?.exposed || 0);
      if (skill.id === 'severing-knot' && exposed > 0) {
        rawDamage += skill.comboBonus;
        this.state.enemy.statuses.exposed = Math.max(0, exposed - 1);
        events.push({ type: 'SkillComboTriggered', playerId, runId: this.state.id, skillId: skill.id, combo: 'exposed', bonusDamage: skill.comboBonus });
      }
      damage = this.#damageEnemy(participant, rawDamage, events, playerId);
      if (this.state.enemy.hp === 0) {
        this.#defeatCurrentEnemy(events, playerId, now);
        return { state: this.toJSON(), events, skillId: skill.id, damage, healed, retaliation };
      }
      if (skill.id === 'piercing-stitch') {
        this.state.enemy.statuses.exposed = 1;
        events.push({ type: 'EnemyStatusApplied', playerId, runId: this.state.id, enemyId: this.state.enemy.id, status: 'exposed', charges: 1 });
      }
      if (!interruptedIntent && !retaliation) retaliation = this.#retaliate(events);
      if (this.state.phase !== 'failed') this.#maybeTelegraphIntent(events, now);
    } else if (skill.kind === 'party-heal') {
      for (const target of this.state.participants.filter((candidate) => candidate.hp > 0)) {
        const amount = Math.min(skill.heal, target.maxHp - target.hp);
        if (amount <= 0) continue;
        target.hp += amount;
        healed += amount;
        participant.healingDone += amount;
        events.push({ type: 'PlayerHealed', playerId, targetPlayerId: target.playerId, runId: this.state.id, amount, bySkillId: skill.id });
      }
      if (!retaliation) retaliation = this.#retaliate(events);
    }

    return { state: this.toJSON(), events, skillId: skill.id, damage, healed, retaliation };
  }

  chooseUpgrade(upgradeId) {
    if (this.state.phase !== 'upgrade') throw new Error('An upgrade can only be chosen between the normal encounters and the boss.');
    const upgrade = RUN_UPGRADES[upgradeId];
    if (!upgrade) throw new Error(`Unknown run upgrade: ${upgradeId}`);
    this.state.selectedUpgrade = upgrade.id;
    this.state.runAttackBonus += upgrade.attackBonus;
    this.state.reactionStyle = upgrade.reactionStyle;
    for (const participant of this.state.participants) {
      participant.hp = Math.min(participant.maxHp, participant.hp + upgrade.heal);
      this.#resetEncounterParticipant(participant);
    }
    this.state.phase = 'boss';
    this.state.enemy = cloneEnemy(this.#dungeon().boss, this.state.participants.length, true);
    this.state.enemyIntent = null;
    this.state.attacksSinceIntent = 0;
    this.state.intentCount = 0;
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

  #assertCombat() { if (!['combat', 'boss'].includes(this.state.phase)) throw new Error('The run is not currently in combat.'); }

  #actingParticipant(playerId) {
    const participant = this.participant(playerId);
    if (!participant) throw new Error('Player is not a participant in this run.');
    if (participant.hp <= 0) throw new Error('A downed player cannot act until revived.');
    return participant;
  }

  #beginAction(participant) {
    for (const [skillId, remaining] of Object.entries(participant.skillCooldowns || {})) {
      if (remaining > 0) participant.skillCooldowns[skillId] = remaining - 1;
    }
  }

  #grantFocus(participant, amount, events) {
    const before = participant.focus;
    participant.focus = Math.min(participant.maxFocus, participant.focus + amount);
    if (participant.focus !== before && events) events.push({ type: 'FocusChanged', playerId: participant.playerId, runId: this.state.id, focus: participant.focus, maxFocus: participant.maxFocus });
  }

  #damageEnemy(participant, rawDamage, events, playerId) {
    const enemyHpBefore = this.state.enemy.hp;
    this.state.enemy.hp = Math.max(0, this.state.enemy.hp - rawDamage);
    const effectiveDamage = Math.min(enemyHpBefore, rawDamage);
    participant.contributionDamage += effectiveDamage;
    participant.threat += effectiveDamage;
    events.push({ type: 'EnemyDamaged', playerId, runId: this.state.id, enemyId: this.state.enemy.id, damage: effectiveDamage });
    this.#maybeAdvanceBossPhase(events);
    return effectiveDamage;
  }

  #maybeAdvanceBossPhase(events) {
    const enemy = this.state.enemy;
    if (!enemy?.isBoss || enemy.hp <= 0 || Number(enemy.battlePhase || 1) >= 2) return;
    if (enemy.hp > Math.ceil(enemy.maxHp / 2)) return;
    const fromBattlePhase = Number(enemy.battlePhase || 1);
    enemy.battlePhase = 2;
    enemy.phaseName = 'Unraveling';
    this.state.enemyIntent = null;
    this.state.attacksSinceIntent = 0;
    this.state.intentCount = 0;
    events.push({
      type: 'BossPhaseChanged',
      runId: this.state.id,
      dungeonId: this.state.dungeonId,
      enemyId: enemy.id,
      fromBattlePhase,
      battlePhase: 2,
      phaseName: enemy.phaseName,
    });
  }

  #defeatCurrentEnemy(events, playerId, now) {
    const defeated = structuredClone(this.state.enemy);
    events.push({ type: 'EnemyDefeated', playerId, runId: this.state.id, dungeonId: this.state.dungeonId, enemyId: defeated.id, isBoss: defeated.isBoss });
    this.#advanceAfterDefeat(events, now);
  }

  #applyParticipantDamage(target, rawDamage, events) {
    const damage = target.guarding ? Math.max(1, Math.ceil(rawDamage / 2)) : rawDamage;
    if (target.guarding) target.damagePrevented += rawDamage - damage;
    target.guarding = false;
    target.hp = Math.max(0, target.hp - damage);
    events.push({ type: 'PlayerDamaged', playerId: target.playerId, runId: this.state.id, damage, rawDamage });
    for (const participant of this.state.participants) participant.threat = Math.max(0, participant.threat - THREAT_DECAY);
    this.#failIfPartyDown(events);
    return damage;
  }

  #retaliate(events, forcedDamage = null) {
    const alive = this.state.participants.filter((participant) => participant.hp > 0);
    if (alive.length === 0) return 0;
    const target = alive.reduce((best, candidate) => candidate.threat > best.threat ? candidate : best, alive[0]);
    const rawDamage = forcedDamage ?? this.state.enemy.retaliation;
    return this.#applyParticipantDamage(target, rawDamage, events);
  }

  #damageTarget(events, targetPlayerId, rawDamage, protectorPlayerId = null) {
    const marked = this.participant(targetPlayerId);
    if (!marked || marked.hp <= 0) return this.#retaliate(events, rawDamage);
    const protector = protectorPlayerId ? this.participant(protectorPlayerId) : null;
    if (!protector || protector.hp <= 0) return this.#applyParticipantDamage(marked, rawDamage, events);

    const preventedBefore = protector.damagePrevented;
    const damage = this.#applyParticipantDamage(protector, rawDamage, events);
    const prevented = Math.max(0, protector.damagePrevented - preventedBefore);
    events.push({
      type: 'PlayerProtected',
      playerId: protector.playerId,
      targetPlayerId: marked.playerId,
      runId: this.state.id,
      damage,
      rawDamage,
      prevented,
    });
    return damage;
  }

  #failIfPartyDown(events) {
    if (!this.state.participants.every((candidate) => candidate.hp === 0)) return;
    this.state.phase = 'failed';
    this.state.enemyIntent = null;
    events.push({ type: 'DungeonFailed', runId: this.state.id, dungeonId: this.state.dungeonId, participantIds: this.state.participants.map((candidate) => candidate.playerId) });
  }

  #maybeTelegraphIntent(events, now) {
    if (this.state.enemyIntent || !this.state.enemy || this.state.enemy.hp <= 0) return;
    this.state.attacksSinceIntent = (this.state.attacksSinceIntent || 0) + 1;
    const cadence = this.state.enemy.isBoss && Number(this.state.enemy.battlePhase || 1) >= 2
      ? PHASE_TWO_INTENT_AFTER_ACTIONS
      : Math.max(1, Number(this.state.enemy.intentCadence || INTENT_AFTER_ATTACKS));
    if (this.state.attacksSinceIntent < cadence) return;
    this.state.attacksSinceIntent = 0;
    this.state.enemyIntent = nextEnemyIntent({
      enemy: this.state.enemy,
      participants: this.state.participants,
      intentCount: this.state.intentCount || 0,
      now,
    });
    this.state.intentCount = (this.state.intentCount || 0) + 1;
    events.push({ type: 'EnemyIntentTelegraphed', runId: this.state.id, enemyId: this.state.enemy.id, intent: structuredClone(this.state.enemyIntent) });
  }

  #resolveIntent(events, _now, answeredBy = 'timeout', reactingPlayerId = null) {
    if (!this.state.enemyIntent) return { kind: 'none' };
    const intent = structuredClone(this.state.enemyIntent);
    this.state.enemyIntent = null;
    const result = resolveEnemyIntent(intent, {
      enemy: this.state.enemy,
      retaliate: (damage) => this.#retaliate(events, damage),
      damageTarget: (targetPlayerId, damage) => this.#damageTarget(events, targetPlayerId, damage, answeredBy === 'guard' ? reactingPlayerId : null),
    });
    if (result.kind === 'heal') events.push({ type: 'EnemyHealed', runId: this.state.id, enemyId: this.state.enemy?.id || null, intentId: intent.id, amount: result.amount, answeredBy });
    else events.push({ type: 'EnemyIntentResolved', runId: this.state.id, enemyId: this.state.enemy?.id || null, intentId: intent.id, damage: result.damage, targetPlayerId: result.targetPlayerId || intent.targetPlayerId || null, answeredBy });
    return result;
  }

  #resetEncounterParticipant(participant) {
    participant.firstStrikeUsed = false;
    participant.guarding = false;
    participant.threat = 0;
    participant.mendCharges = 1;
    participant.reactionDamageBonus = 0;
  }

  #advanceAfterDefeat(events, now) {
    const dungeon = this.#dungeon();
    this.state.enemyIntent = null;
    this.state.attacksSinceIntent = 0;
    this.state.intentCount = 0;
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
