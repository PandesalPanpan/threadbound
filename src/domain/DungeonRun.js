export const DUNGEONS = Object.freeze({
  'frayed-hollow': Object.freeze({
    id: 'frayed-hollow',
    name: 'Frayed Hollow',
    recommendedPlayers: 2,
    minPlayers: 1,
    maxPlayers: 4,
    encounters: Object.freeze([
      Object.freeze({
        id: 'frayed-wisp', name: 'Frayed Wisp', hp: 18, retaliation: 2,
        behavior: Object.freeze({
          intentEvery: 2,
          intents: Object.freeze([
            Object.freeze({ id: 'soul-flare', name: 'Soul Flare', counter: 'interrupt', kind: 'damage', damageBonus: 3, hint: 'Interrupt before the Wisp finishes gathering light.' }),
          ]),
        }),
      }),
      Object.freeze({
        id: 'hollow-stalker', name: 'Hollow Stalker', hp: 24, retaliation: 3,
        behavior: Object.freeze({
          intentEvery: 2,
          intents: Object.freeze([
            Object.freeze({ id: 'predators-pounce', name: "Predator's Pounce", counter: 'guard', kind: 'damage', damageBonus: 5, hint: 'Guard the pounce to blunt it and prime a Riposte.' }),
          ]),
        }),
      }),
      Object.freeze({
        id: 'silkbound-guard', name: 'Silkbound Guard', hp: 24, retaliation: 3,
        behavior: Object.freeze({
          intentEvery: 2,
          intents: Object.freeze([
            Object.freeze({ id: 'silken-brace', name: 'Silken Brace', counter: 'power-strike', kind: 'fortify', fortifyHits: 2, hint: 'Power Strike breaks the brace before its armor hardens.' }),
          ]),
        }),
      }),
    ]),
    boss: Object.freeze({
      id: 'first-needle', name: 'The First Needle', hp: 36, retaliation: 4,
      behavior: Object.freeze({
        intentEvery: 2,
        intents: Object.freeze([
          Object.freeze({ id: 'needle-break', name: 'Needle Break', counter: 'interrupt', kind: 'damage', damageBonus: 6, hint: 'Interrupt the cast.' }),
          Object.freeze({ id: 'thread-sever', name: 'Thread Sever', counter: 'guard', kind: 'damage', damageBonus: 8, hint: 'Guard the severing stroke and answer with a Riposte.' }),
          Object.freeze({ id: 'loom-ward', name: 'Loom Ward', counter: 'power-strike', kind: 'fortify', fortifyHits: 2, hint: 'Spend Focus on Power Strike before the ward closes.' }),
        ]),
      }),
    }),
  }),
});

export const RUN_UPGRADES = Object.freeze({
  sharpen: Object.freeze({ id: 'sharpen', name: 'Sharpen the Thread', description: '+2 Attack for the rest of this run.', attackBonus: 2, heal: 0, modifiers: Object.freeze({}) }),
  quicken: Object.freeze({ id: 'quicken', name: 'Quickened Weave', description: 'Power Strike costs 1 less Focus and skill cooldowns recover 1 action faster.', attackBonus: 0, heal: 0, modifiers: Object.freeze({ powerStrikeCost: -1, cooldownReduction: 1 }) }),
  mender: Object.freeze({ id: 'mender', name: 'Mender’s Knot', description: 'Mend restores +4 HP and the party recovers 4 HP now.', attackBonus: 0, heal: 4, modifiers: Object.freeze({ mendBonus: 4 }) }),
  riposte: Object.freeze({ id: 'riposte', name: 'Barbed Guard', description: 'Successful Guards prime +3 more Riposte damage.', attackBonus: 0, heal: 0, modifiers: Object.freeze({ guardRiposteBonus: 3 }) }),
});

const HEALTH_MULTIPLIERS = Object.freeze([0, 1, 1.65, 2.25, 2.8]);
const RETALIATION_MULTIPLIERS = Object.freeze([0, 1, 1.15, 1.3, 1.45]);
const GUARD_THREAT = 10;
const MEND_AMOUNT = 8;
const MEND_THREAT = 2;
const REVIVE_THREAT = 4;
const INTERRUPT_THREAT = 3;
const THREAT_DECAY = 2;
const DEFAULT_INTENT_AFTER_ACTIONS = 3;
const INTENT_WINDOW_MS = 4500;
const MAX_FOCUS = 3;
const POWER_STRIKE_BASE_COST = 2;
const POWER_STRIKE_BONUS = 5;
const RIPOSTE_BASE_BONUS = 3;
const STAGGER_MULTIPLIER = 1.5;

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

function normalizeBehavior(definition) {
  const source = definition?.behavior || {};
  const intents = Array.isArray(source.intents) && source.intents.length
    ? source.intents
    : [{ id: 'fraying-blow', name: 'Fraying Blow', counter: 'interrupt', kind: 'damage', damageBonus: 2, hint: 'Interrupt the telegraphed strike.' }];
  return {
    intentEvery: Math.max(1, Number(source.intentEvery) || DEFAULT_INTENT_AFTER_ACTIONS),
    intents: intents.map((intent) => ({
      id: String(intent.id || 'enemy-intent'),
      name: String(intent.name || 'Enemy Intent'),
      counter: ['interrupt', 'guard', 'power-strike'].includes(intent.counter) ? intent.counter : 'interrupt',
      kind: intent.kind === 'fortify' ? 'fortify' : 'damage',
      damageBonus: Math.max(0, Number(intent.damageBonus) || 0),
      fortifyHits: Math.max(1, Number(intent.fortifyHits) || 2),
      hint: String(intent.hint || ''),
    })),
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
    behavior: normalizeBehavior(definition),
    intentCursor: 0,
    fortifiedHits: 0,
    staggeredHits: 0,
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
      focus: 0,
      maxFocus: MAX_FOCUS,
      riposteBonus: 0,
      cooldowns: { powerStrike: 0, guard: 0, interrupt: 0, mend: 0 },
      reviveCharges: 1,
    };
  });
}

function baseRunModifiers() {
  return {
    powerStrikeCost: POWER_STRIKE_BASE_COST,
    powerStrikeBonus: POWER_STRIKE_BONUS,
    cooldownReduction: 0,
    mendBonus: 0,
    guardRiposteBonus: RIPOSTE_BASE_BONUS,
    staggerMultiplier: STAGGER_MULTIPLIER,
  };
}

export class DungeonRun {
  constructor(state) {
    this.state = structuredClone(state);
    this.state.runModifiers = { ...baseRunModifiers(), ...(this.state.runModifiers || {}) };
    this.state.selectedUpgrades = Array.isArray(this.state.selectedUpgrades)
      ? [...this.state.selectedUpgrades]
      : (this.state.selectedUpgrade ? [this.state.selectedUpgrade] : []);
    for (const participant of this.state.participants || []) this.#ensureParticipantCombatState(participant);
    if (this.state.enemy) this.#ensureEnemyCombatState(this.state.enemy);
  }

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
      pendingNextEncounterIndex: null,
      participants: participantStates,
      scaling,
      runAttackBonus: 0,
      runModifiers: baseRunModifiers(),
      selectedUpgrade: null,
      selectedUpgrades: [],
      enemy: cloneEnemy(dungeon.encounters[0], participantStates.length),
      enemyIntent: null,
      actionsSinceIntent: 0,
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
    let intentRetaliation = this.#resolveDueIntent(events, now);
    if (!intentRetaliation && this.state.enemyIntent) intentRetaliation = this.#resolveIntent(events, now);
    if (participant.hp <= 0 || this.state.phase === 'failed') {
      return { state: this.toJSON(), events, damage: 0, retaliation: intentRetaliation, focusGained: 0, intentResolved: true };
    }

    let damage = attackPower + this.state.runAttackBonus;
    if (equipmentEffect === 'opening_strike' && !participant.firstStrikeUsed) damage += 2;
    if (equipmentEffect === 'boss_bane' && this.state.enemy.isBoss) damage += 2;
    if (participant.riposteBonus > 0) {
      damage += participant.riposteBonus + (equipmentEffect === 'riposte_edge' ? 3 : 0);
      events.push({ type: 'RiposteConsumed', playerId, runId: this.state.id, bonusDamage: participant.riposteBonus });
      participant.riposteBonus = 0;
    }
    participant.firstStrikeUsed = true;
    const dealt = this.#damageEnemy(events, playerId, damage, { source: 'attack' });
    this.#gainFocus(participant, 1);
    this.#finishAction(participant);

    if (this.state.enemy?.hp === 0) return this.#defeatOutcome(events, playerId, dealt, now);
    const retaliation = intentRetaliation || this.#retaliate(events);
    if (this.state.phase !== 'failed') this.#maybeTelegraphIntent(events, now);
    return { state: this.toJSON(), events, damage: dealt, retaliation, focusGained: 1, intentResolved: Boolean(intentRetaliation) };
  }

  powerStrike({ playerId, attackPower, equipmentEffect = 'none', now = new Date().toISOString() }) {
    this.#assertCombat();
    const events = [];
    const participant = this.#actingParticipant(playerId);
    let intentRetaliation = this.#resolveDueIntent(events, now);
    if (participant.hp <= 0 || this.state.phase === 'failed') {
      return { state: this.toJSON(), events, damage: 0, retaliation: intentRetaliation, focusSpent: 0, intentResolved: true };
    }
    this.#assertReady(participant, 'powerStrike');
    const cost = Math.max(1, this.state.runModifiers.powerStrikeCost);
    if (participant.focus < cost) throw new Error(`Power Strike requires ${cost} Focus.`);

    let countered = false;
    if (this.state.enemyIntent?.counter === 'power-strike') {
      const intent = structuredClone(this.state.enemyIntent);
      this.state.enemyIntent = null;
      this.state.enemy.fortifiedHits = 0;
      this.state.enemy.staggeredHits = Math.max(this.state.enemy.staggeredHits, 1);
      countered = true;
      events.push({ type: 'EnemyIntentCountered', playerId, runId: this.state.id, enemyId: this.state.enemy.id, intentId: intent.id, counter: 'power-strike' });
    } else if (this.state.enemyIntent) {
      intentRetaliation = this.#resolveIntent(events, now);
      if (participant.hp <= 0 || this.state.phase === 'failed') {
        return { state: this.toJSON(), events, damage: 0, retaliation: intentRetaliation, focusSpent: 0, intentResolved: true };
      }
    }

    participant.focus -= cost;
    let damage = attackPower + this.state.runAttackBonus + this.state.runModifiers.powerStrikeBonus + (countered ? 2 : 0);
    if (equipmentEffect === 'boss_bane' && this.state.enemy.isBoss) damage += 2;
    if (participant.riposteBonus > 0) {
      damage += participant.riposteBonus + (equipmentEffect === 'riposte_edge' ? 3 : 0);
      participant.riposteBonus = 0;
    }
    participant.firstStrikeUsed = true;
    const dealt = this.#damageEnemy(events, playerId, damage, { source: 'power-strike', ignoreFortify: countered });
    this.#finishAction(participant, 'powerStrike', 2);

    if (this.state.enemy?.hp === 0) return this.#defeatOutcome(events, playerId, dealt, now, { focusSpent: cost, countered });
    const retaliation = intentRetaliation || this.#retaliate(events);
    if (this.state.phase !== 'failed') this.#maybeTelegraphIntent(events, now);
    return { state: this.toJSON(), events, damage: dealt, retaliation, focusSpent: cost, countered, intentResolved: Boolean(intentRetaliation) };
  }

  guard({ playerId, equipmentEffect = 'none', now = new Date().toISOString() }) {
    this.#assertCombat();
    const events = [];
    this.#resolveDueIntent(events, now);
    const participant = this.#actingParticipant(playerId);
    this.#assertReady(participant, 'guard');
    participant.guarding = true;
    participant.threat += GUARD_THREAT;
    this.#gainFocus(participant, 1);
    events.push({ type: 'PlayerGuarded', playerId, runId: this.state.id, threatAdded: GUARD_THREAT });

    const pending = this.state.enemyIntent ? structuredClone(this.state.enemyIntent) : null;
    let retaliation;
    if (pending) retaliation = this.#resolveIntent(events, now);
    else retaliation = this.#retaliate(events);
    const countered = Boolean(pending?.counter === 'guard');
    if (countered) events.push({ type: 'EnemyIntentCountered', playerId, runId: this.state.id, enemyId: this.state.enemy?.id || null, intentId: pending.id, counter: 'guard' });
    if (equipmentEffect === 'riposte_edge' && participant.riposteBonus > 0) participant.riposteBonus += 1;
    this.#finishAction(participant, 'guard', 1);
    if (this.state.phase !== 'failed') this.#maybeTelegraphIntent(events, now);
    return { state: this.toJSON(), events, retaliation, focusGained: 1, countered };
  }

  interrupt({ playerId, equipmentEffect = 'none', now = new Date().toISOString() }) {
    this.#assertCombat();
    const events = [];
    this.#resolveDueIntent(events, now);
    const participant = this.#actingParticipant(playerId);
    this.#assertReady(participant, 'interrupt');
    if (!this.state.enemyIntent) throw new Error('There is no enemy action to interrupt.');
    if (this.state.enemyIntent.counter !== 'interrupt') throw new Error(`${this.state.enemyIntent.name} cannot be interrupted; ${this.#counterLabel(this.state.enemyIntent.counter)} it instead.`);
    const interrupted = structuredClone(this.state.enemyIntent);
    this.state.enemyIntent = null;
    participant.threat += INTERRUPT_THREAT;
    this.#gainFocus(participant, 2);
    this.state.enemy.staggeredHits = Math.max(this.state.enemy.staggeredHits, 1);
    this.#finishAction(participant, 'interrupt', equipmentEffect === 'interrupt_refund' ? 1 : 2);
    if (equipmentEffect === 'interrupt_refund') participant.cooldowns.powerStrike = 0;
    events.push({ type: 'EnemyInterrupted', playerId, runId: this.state.id, intentId: interrupted.id, enemyId: this.state.enemy.id });
    events.push({ type: 'EnemyStaggered', playerId, runId: this.state.id, enemyId: this.state.enemy.id, hits: 1 });
    return { state: this.toJSON(), events, interrupted, focusGained: 2, countered: true, staggered: true };
  }

  mend({ playerId, targetPlayerId, equipmentEffect = 'none', now = new Date().toISOString() }) {
    this.#assertCombat();
    const events = [];
    this.#resolveDueIntent(events, now);
    const participant = this.#actingParticipant(playerId);
    this.#assertReady(participant, 'mend');
    const target = this.participant(targetPlayerId);
    if (!target) throw new Error('Mend target is not a participant in this run.');
    if (target.hp <= 0) throw new Error('Mend cannot heal a downed player; use Revive.');
    if (target.hp >= target.maxHp) throw new Error('Mend target is already at full health.');

    participant.threat += MEND_THREAT;
    const amount = MEND_AMOUNT + this.state.runModifiers.mendBonus + (equipmentEffect === 'mender' ? 3 : 0);
    const healed = Math.min(amount, target.maxHp - target.hp);
    target.hp += healed;
    participant.healingDone += healed;
    events.push({ type: 'PlayerHealed', playerId, targetPlayerId, runId: this.state.id, amount: healed });
    const retaliation = this.#retaliate(events);
    this.#finishAction(participant, 'mend', 2);
    if (this.state.phase !== 'failed') this.#maybeTelegraphIntent(events, now);
    return { state: this.toJSON(), events, healed, retaliation };
  }

  revive({ playerId, targetPlayerId, now = new Date().toISOString() }) {
    this.#assertCombat();
    const events = [];
    this.#resolveDueIntent(events, now);
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
    const eventsOut = [{ type: 'PlayerRevived', playerId, targetPlayerId, runId: this.state.id, restoredHp: target.hp }];
    events.push(...eventsOut);
    const retaliation = this.#retaliate(events);
    this.#finishAction(participant);
    if (this.state.phase !== 'failed') this.#maybeTelegraphIntent(events, now);
    return { state: this.toJSON(), events, restoredHp: target.hp, retaliation };
  }

  chooseUpgrade(upgradeId) {
    if (this.state.phase !== 'upgrade') throw new Error('An upgrade can only be chosen between encounters.');
    const upgrade = RUN_UPGRADES[upgradeId];
    if (!upgrade) throw new Error(`Unknown run upgrade: ${upgradeId}`);
    this.state.selectedUpgrade = upgrade.id;
    this.state.selectedUpgrades.push(upgrade.id);
    this.state.runAttackBonus += Number(upgrade.attackBonus || 0);
    for (const [key, amount] of Object.entries(upgrade.modifiers || {})) {
      this.state.runModifiers[key] = Number(this.state.runModifiers[key] || 0) + Number(amount || 0);
    }
    this.state.runModifiers.powerStrikeCost = Math.max(1, this.state.runModifiers.powerStrikeCost);
    this.state.runModifiers.cooldownReduction = Math.min(1, Math.max(0, this.state.runModifiers.cooldownReduction));
    for (const participant of this.state.participants) {
      participant.hp = Math.min(participant.maxHp, participant.hp + Number(upgrade.heal || 0));
      this.#resetEncounterParticipant(participant);
    }

    const dungeon = this.#dungeon();
    if (this.state.pendingNextEncounterIndex === 'boss') {
      this.state.phase = 'boss';
      this.state.enemy = cloneEnemy(dungeon.boss, this.state.participants.length, true);
    } else {
      this.state.encounterIndex = Number(this.state.pendingNextEncounterIndex);
      this.state.phase = 'combat';
      this.state.enemy = cloneEnemy(dungeon.encounters[this.state.encounterIndex], this.state.participants.length);
    }
    this.state.pendingNextEncounterIndex = null;
    this.state.enemyIntent = null;
    this.state.actionsSinceIntent = 0;
    return {
      state: this.toJSON(),
      events: [{ type: 'RunUpgradeChosen', runId: this.state.id, upgradeId, selectedUpgrades: [...this.state.selectedUpgrades], nextEnemyId: this.state.enemy?.id || null }],
    };
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

  #ensureParticipantCombatState(participant) {
    participant.focus = Math.max(0, Number(participant.focus) || 0);
    participant.maxFocus = Math.max(1, Number(participant.maxFocus) || MAX_FOCUS);
    participant.riposteBonus = Math.max(0, Number(participant.riposteBonus) || 0);
    participant.cooldowns = { powerStrike: 0, guard: 0, interrupt: 0, mend: 0, ...(participant.cooldowns || {}) };
    participant.reviveCharges = Number.isInteger(participant.reviveCharges) ? participant.reviveCharges : 1;
  }

  #ensureEnemyCombatState(enemy) {
    enemy.behavior = normalizeBehavior(enemy);
    enemy.intentCursor = Math.max(0, Number(enemy.intentCursor) || 0);
    enemy.fortifiedHits = Math.max(0, Number(enemy.fortifiedHits) || 0);
    enemy.staggeredHits = Math.max(0, Number(enemy.staggeredHits) || 0);
  }

  #actingParticipant(playerId) {
    const participant = this.participant(playerId);
    if (!participant) throw new Error('Player is not a participant in this run.');
    if (participant.hp <= 0) throw new Error('A downed player cannot act until revived.');
    this.#ensureParticipantCombatState(participant);
    return participant;
  }

  #assertReady(participant, skill) {
    const remaining = Number(participant.cooldowns?.[skill] || 0);
    if (remaining > 0) throw new Error(`${this.#skillLabel(skill)} is cooling down for ${remaining} more action${remaining === 1 ? '' : 's'}.`);
  }

  #finishAction(participant, usedSkill = null, baseCooldown = 0) {
    for (const key of Object.keys(participant.cooldowns)) participant.cooldowns[key] = Math.max(0, Number(participant.cooldowns[key] || 0) - 1);
    if (usedSkill && baseCooldown > 0) participant.cooldowns[usedSkill] = Math.max(0, baseCooldown - this.state.runModifiers.cooldownReduction);
  }

  #gainFocus(participant, amount) {
    participant.focus = Math.min(participant.maxFocus, participant.focus + amount);
  }

  #damageEnemy(events, playerId, rawDamage, { source, ignoreFortify = false } = {}) {
    let damage = Math.max(0, Math.floor(rawDamage));
    let staggerConsumed = false;
    let fortified = false;
    if (this.state.enemy.staggeredHits > 0) {
      damage = Math.max(1, Math.ceil(damage * this.state.runModifiers.staggerMultiplier));
      this.state.enemy.staggeredHits -= 1;
      staggerConsumed = true;
    }
    if (!ignoreFortify && this.state.enemy.fortifiedHits > 0) {
      damage = Math.max(1, Math.ceil(damage * 0.4));
      this.state.enemy.fortifiedHits -= 1;
      fortified = true;
    }
    const enemyHpBefore = this.state.enemy.hp;
    this.state.enemy.hp = Math.max(0, this.state.enemy.hp - damage);
    const effectiveDamage = Math.min(enemyHpBefore, damage);
    const participant = this.participant(playerId);
    participant.contributionDamage += effectiveDamage;
    participant.threat += effectiveDamage;
    events.push({ type: 'EnemyDamaged', playerId, runId: this.state.id, enemyId: this.state.enemy.id, damage: effectiveDamage, source, staggerConsumed, fortified });
    return effectiveDamage;
  }

  #retaliate(events, forcedDamage = null) {
    const alive = this.state.participants.filter((participant) => participant.hp > 0);
    if (alive.length === 0) return 0;
    const target = alive.reduce((best, candidate) => candidate.threat > best.threat ? candidate : best, alive[0]);
    const rawDamage = forcedDamage ?? this.state.enemy.retaliation;
    const guarded = target.guarding;
    const damage = guarded ? Math.max(1, Math.ceil(rawDamage / 2)) : rawDamage;
    if (guarded) {
      target.damagePrevented += rawDamage - damage;
      target.riposteBonus = Math.max(target.riposteBonus, this.state.runModifiers.guardRiposteBonus);
    }
    target.guarding = false;
    target.hp = Math.max(0, target.hp - damage);
    events.push({ type: 'PlayerDamaged', playerId: target.playerId, runId: this.state.id, damage, rawDamage, guarded });
    if (guarded) events.push({ type: 'RipostePrimed', playerId: target.playerId, runId: this.state.id, bonusDamage: target.riposteBonus });
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
    this.state.actionsSinceIntent = (this.state.actionsSinceIntent || 0) + 1;
    const behavior = normalizeBehavior(this.state.enemy);
    if (this.state.actionsSinceIntent < behavior.intentEvery) return;
    this.state.actionsSinceIntent = 0;
    const definition = behavior.intents[this.state.enemy.intentCursor % behavior.intents.length];
    this.state.enemy.intentCursor = (this.state.enemy.intentCursor + 1) % behavior.intents.length;
    const dueAt = new Date(new Date(now).getTime() + INTENT_WINDOW_MS).toISOString();
    const damage = definition.kind === 'damage' ? Math.max(1, this.state.enemy.retaliation + definition.damageBonus) : this.state.enemy.retaliation;
    this.state.enemyIntent = {
      id: definition.id,
      name: definition.name,
      counter: definition.counter,
      counterLabel: this.#counterLabel(definition.counter),
      kind: definition.kind,
      damage,
      fortifyHits: definition.fortifyHits,
      hint: definition.hint,
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
    let damage = 0;
    if (intent.kind === 'fortify') {
      this.state.enemy.fortifiedHits = Math.max(this.state.enemy.fortifiedHits, intent.fortifyHits || 2);
      events.push({ type: 'EnemyFortified', runId: this.state.id, enemyId: this.state.enemy.id, hits: this.state.enemy.fortifiedHits });
      damage = this.#retaliate(events);
    } else damage = this.#retaliate(events, intent.damage);
    events.push({ type: 'EnemyIntentResolved', runId: this.state.id, enemyId: this.state.enemy?.id || null, intentId: intent.id, damage, kind: intent.kind });
    return damage;
  }

  #resetEncounterParticipant(participant) {
    participant.firstStrikeUsed = false;
    participant.guarding = false;
    participant.threat = 0;
    participant.riposteBonus = 0;
    participant.cooldowns = { powerStrike: 0, guard: 0, interrupt: 0, mend: 0 };
    participant.focus = Math.min(participant.maxFocus, Math.max(0, participant.focus));
  }

  #defeatOutcome(events, playerId, damage, now, extras = {}) {
    const defeated = structuredClone(this.state.enemy);
    events.push({ type: 'EnemyDefeated', playerId, runId: this.state.id, dungeonId: this.state.dungeonId, enemyId: defeated.id, isBoss: defeated.isBoss });
    this.#advanceAfterDefeat(events, now);
    return { state: this.toJSON(), events, damage, retaliation: 0, ...extras };
  }

  #advanceAfterDefeat(events, now) {
    const dungeon = this.#dungeon();
    this.state.enemyIntent = null;
    this.state.actionsSinceIntent = 0;
    if (this.state.phase === 'boss') {
      this.state.phase = 'complete';
      this.state.enemy = null;
      this.state.completedAt = now;
      events.push({ type: 'BossDefeated', runId: this.state.id, dungeonId: this.state.dungeonId });
      events.push({ type: 'DungeonCompleted', runId: this.state.id, dungeonId: this.state.dungeonId, participantIds: this.state.participants.map((participant) => participant.playerId) });
      return;
    }

    this.state.phase = 'upgrade';
    this.state.enemy = null;
    this.state.pendingNextEncounterIndex = this.state.encounterIndex < dungeon.encounters.length - 1
      ? this.state.encounterIndex + 1
      : 'boss';
  }

  #counterLabel(counter) {
    return counter === 'power-strike' ? 'Power Strike' : counter[0].toUpperCase() + counter.slice(1);
  }

  #skillLabel(skill) {
    return skill === 'powerStrike' ? 'Power Strike' : skill[0].toUpperCase() + skill.slice(1);
  }
}
