import { DUNGEONS, DungeonRun as CombatDungeonRun, RUN_UPGRADES as LEGACY_RUN_UPGRADES } from './DungeonRun.js';
import { runEventChoice, selectRunEvent, snapshotRunEventSchedule } from './RunEventCatalog.js';
import { applyRelicCombatAttunement } from './RelicCombatPolicy.js';
import { RUN_UPGRADES, runUpgrade } from './RunPowerCatalog.js';
import { offeredRunUpgradeIds, RUN_UPGRADE_OFFER_VERSION } from './RunUpgradeOfferPolicy.js';
import { prepareSimpleDungeon, recoverBetweenEncounters } from './SimpleDungeonPolicy.js';

export { DUNGEONS, RUN_UPGRADES };

function aliveParticipants(state) {
  return state.participants.filter((participant) => participant.hp > 0);
}

function resetSimpleParticipant(participant) {
  participant.focus = 0;
  participant.skillCooldowns = {};
  participant.reactionDamageBonus = 0;
  participant.guarding = false;
  participant.mendCharges = 0;
  participant.reviveCharges = 0;
}

function simpleEvent(event) {
  return !new Set([
    'EnemyIntentTelegraphed',
    'EnemyIntentResolved',
    'EnemyIntentIgnored',
    'EnemyIntentCancelledByDefeat',
    'CombatReactionSucceeded',
    'CombatSkillUsed',
    'FocusChanged',
    'EnemyStatusApplied',
    'SkillComboTriggered',
    'RunPowerTriggered',
    'BossPhaseChanged',
  ]).has(event.type);
}

/**
 * Aggregate facade for the whole dungeon run lifecycle.
 *
 * Legacy runs still support the tactical systems while new player-facing simple
 * runs use a much smaller state machine: Attack -> next enemy -> boss -> reward.
 * The migration is explicit so persisted old runs can still hydrate safely.
 */
export class AdventureRun {
  constructor(state) {
    this.state = structuredClone(state);
    this.state.runEventSchedule ??= null;
    this.state.runEvent ??= null;
    this.state.runEventResume ??= null;
    this.state.runEventHistory ??= [];
    this.state.runUpgradeOfferVersion ??= RUN_UPGRADE_OFFER_VERSION;
    this.state.runUpgradeOfferIds ??= [];
    this.state.runUpgradeDraftIndex ??= 0;
    this.state.runUpgradeResume ??= null;
    this.state.selectedUpgrades ??= this.state.selectedUpgrade ? [this.state.selectedUpgrade] : [];
    this.state.runPowerDraftsEnabled = state.runPowerDraftsEnabled === true;
    this.state.simpleCombat = state.simpleCombat === true;
    if (this.state.simpleCombat) {
      this.state.runPowerDraftsEnabled = false;
      this.state.runEventSchedule = null;
      this.state.runEvent = null;
      this.state.runEventResume = null;
      this.state.runUpgradeResume = null;
      this.state.runUpgradeOfferIds = [];
      this.state.selectedUpgrade = null;
      this.state.selectedUpgrades = [];
      this.state.runAttackBonus = 0;
      this.state.reactionStyle = null;
      this.state.enemyIntent = null;
      this.state.attacksSinceIntent = 0;
      this.state.intentCount = 0;
      for (const participant of this.state.participants || []) resetSimpleParticipant(participant);
    }
  }

  static start(args) {
    const combat = CombatDungeonRun.start(args);
    const state = combat.toJSON();
    state.runEventSchedule = snapshotRunEventSchedule(state.dungeonId, state.dungeonDefinition?.runEventSchedule || null);
    state.runEvent = null;
    state.runEventResume = null;
    state.runEventHistory = [];
    state.runUpgradeOfferVersion = RUN_UPGRADE_OFFER_VERSION;
    state.runUpgradeOfferIds = [];
    state.runUpgradeDraftIndex = 0;
    state.runUpgradeResume = null;
    state.selectedUpgrades = [];
    state.runPowerDraftsEnabled = true;
    state.simpleCombat = false;
    return new AdventureRun(state);
  }

  static startSimple(args) {
    const sourceDefinition = args.dungeonDefinition || DUNGEONS[args.dungeonId];
    const combat = CombatDungeonRun.start({
      ...args,
      dungeonDefinition: prepareSimpleDungeon(sourceDefinition),
    });
    const state = combat.toJSON();
    state.simpleCombat = true;
    state.runEventSchedule = null;
    state.runEvent = null;
    state.runEventResume = null;
    state.runEventHistory = [];
    state.runUpgradeOfferVersion = RUN_UPGRADE_OFFER_VERSION;
    state.runUpgradeOfferIds = [];
    state.runUpgradeDraftIndex = 0;
    state.runUpgradeResume = null;
    state.selectedUpgrade = null;
    state.selectedUpgrades = [];
    state.runPowerDraftsEnabled = false;
    state.runAttackBonus = 0;
    state.reactionStyle = null;
    state.enemyIntent = null;
    state.attacksSinceIntent = 0;
    state.intentCount = 0;
    for (const participant of state.participants) resetSimpleParticipant(participant);
    return new AdventureRun(state);
  }

  hasParticipant(playerId) {
    return this.state.participants.some((participant) => participant.playerId === playerId);
  }

  participant(playerId) {
    return this.state.participants.find((participant) => participant.playerId === playerId) || null;
  }

  attack(args) { return this.#combat('attack', args); }
  guard(args) { return this.#combat('guard', args); }
  interrupt(args) { return this.#combat('interrupt', args); }
  mend(args) { return this.#combat('mend', args); }
  revive(args) { return this.#combat('revive', args); }
  useSkill(args) { return this.#combat('useSkill', args); }

  chooseUpgrade(choiceId) {
    if (this.state.simpleCombat) throw new Error('Simple dungeons do not use temporary run upgrades.');
    if (this.state.phase === 'event') return this.chooseRunEvent(choiceId);
    if (this.state.phase !== 'upgrade') throw new Error('An upgrade can only be chosen from a waiting run power draft.');

    const offered = this.#runUpgradeOffers();
    if (!offered.includes(choiceId)) throw new Error('An upgrade can only be chosen from this run\'s offered powers.');
    const upgrade = runUpgrade(choiceId);
    const resume = this.state.runUpgradeResume ? structuredClone(this.state.runUpgradeResume) : null;
    const previousReactionStyle = this.state.reactionStyle || null;
    const selectedUpgrades = [...(this.state.selectedUpgrades || [])];

    const combat = new CombatDungeonRun(this.state);
    const outcome = combat.chooseUpgrade('sharpen');
    this.state = outcome.state;
    this.state.runAttackBonus -= Number(LEGACY_RUN_UPGRADES.sharpen.attackBonus || 0);
    this.state.runAttackBonus += Number(upgrade.attackBonus || 0);
    this.state.reactionStyle = upgrade.reactionStyle || previousReactionStyle || null;
    for (const participant of aliveParticipants(this.state)) {
      participant.hp = Math.min(participant.maxHp, participant.hp + Number(upgrade.heal || 0));
    }
    this.state.selectedUpgrade = upgrade.id;
    selectedUpgrades.push(upgrade.id);
    this.state.selectedUpgrades = selectedUpgrades;

    if (resume) {
      this.state.phase = 'combat';
      this.state.encounterIndex = resume.encounterIndex;
      this.state.enemy = resume.enemy;
      this.state.enemyIntent = null;
      this.state.attacksSinceIntent = 0;
      this.state.intentCount = 0;
    }

    const draftIndex = Number(this.state.runUpgradeDraftIndex || 0);
    this.state.runUpgradeDraftIndex = draftIndex + 1;
    this.state.runUpgradeResume = null;
    this.state.runUpgradeOfferIds = [];
    const events = outcome.events.map((event) => event.type === 'RunUpgradeChosen'
      ? {
          ...event,
          upgradeId: upgrade.id,
          upgradeName: upgrade.name,
          draftIndex,
          resumedCombat: Boolean(resume),
          nextEnemyId: this.state.enemy?.id || null,
          nextEnemyName: this.state.enemy?.name || null,
          selectedUpgrades: [...selectedUpgrades],
        }
      : event);
    return { ...outcome, events, state: this.toJSON() };
  }

  chooseRunEvent(choiceId) {
    if (this.state.simpleCombat) throw new Error('Simple dungeons do not use temporary run events.');
    if (this.state.phase !== 'event' || !this.state.runEvent || !this.state.runEventResume) {
      throw new Error('There is no run event choice waiting for the party.');
    }
    const event = structuredClone(this.state.runEvent);
    const choice = runEventChoice(event, choiceId);
    const effects = choice.effects || {};
    const participantEffects = [];

    if (effects.runAttackBonus) this.state.runAttackBonus += Number(effects.runAttackBonus || 0);
    for (const participant of aliveParticipants(this.state)) {
      const before = { hp: participant.hp, focus: participant.focus };
      if (effects.healAll) participant.hp = Math.min(participant.maxHp, participant.hp + Number(effects.healAll));
      if (effects.damageAll) participant.hp = Math.max(1, participant.hp - Number(effects.damageAll));
      if (effects.focusAll) participant.focus = Math.max(0, Math.min(participant.maxFocus, participant.focus + Number(effects.focusAll)));
      participantEffects.push({
        playerId: participant.playerId,
        hpDelta: participant.hp - before.hp,
        focusDelta: participant.focus - before.focus,
      });
    }

    const resume = structuredClone(this.state.runEventResume);
    this.state.runEventHistory.push({ eventId: event.id, choiceId: choice.id });
    this.state.runEvent = null;
    this.state.runEventResume = null;
    this.state.phase = 'combat';
    this.state.encounterIndex = resume.encounterIndex;
    this.state.enemy = resume.enemy;
    this.state.enemyIntent = null;
    this.state.attacksSinceIntent = 0;
    this.state.intentCount = 0;

    return {
      state: this.toJSON(),
      events: [{
        type: 'RunEventChosen',
        runId: this.state.id,
        dungeonId: this.state.dungeonId,
        eventId: event.id,
        eventName: event.name,
        choiceId: choice.id,
        choiceName: choice.name,
        choiceSummary: choice.summary,
        participantEffects,
        runAttackBonus: this.state.runAttackBonus,
        nextEnemyId: this.state.enemy?.id || null,
        nextEnemyName: this.state.enemy?.name || null,
      }],
    };
  }

  markRewards(rewardItemIds) {
    const combat = new CombatDungeonRun(this.state);
    combat.markRewards(rewardItemIds);
    this.state = combat.toJSON();
  }

  toJSON() {
    return structuredClone(this.state);
  }

  #combat(method, args) {
    if (this.state.simpleCombat) return this.#simpleCombat(method, args);
    if (this.state.phase === 'event') throw new Error('Choose the run event before taking another combat action.');
    if (this.state.phase === 'upgrade') throw new Error('Choose a run power before taking another combat action.');
    const before = structuredClone(this.state);
    const combat = new CombatDungeonRun(this.state);
    const outcome = combat[method](args);
    this.state = outcome.state;

    const attuned = applyRelicCombatAttunement({
      state: this.state,
      events: outcome.events,
      method,
      args,
      attunementCode: args?.attunementCode || null,
    });
    this.state = attuned.state;
    if (attuned.triggered?.effect === 'bonus_healing') {
      outcome.healed = Number(outcome.healed || 0) + Number(attuned.triggered.amount || 0);
    }

    this.#pauseForRunEvent(before, outcome.events);
    this.#pauseForRunPowerDraft(before, outcome.events);
    if (this.state.phase === 'upgrade') this.#snapshotRunUpgradeOffers();
    return { ...outcome, relicTrigger: attuned.triggered, state: this.toJSON() };
  }

  #simpleCombat(method, args) {
    if (method !== 'attack') {
      const error = new Error('This dungeon uses the simple combat loop. Attack is the only combat action.');
      error.code = 'simple_combat_attack_only';
      throw error;
    }
    if (!['combat', 'boss'].includes(this.state.phase)) throw new Error('The run is not currently in combat.');

    this.state.enemyIntent = null;
    this.state.attacksSinceIntent = 0;
    this.state.intentCount = 0;
    this.state.runAttackBonus = 0;
    this.state.reactionStyle = null;
    for (const participant of this.state.participants) resetSimpleParticipant(participant);

    const before = structuredClone(this.state);
    const combat = new CombatDungeonRun(this.state);
    const outcome = combat.attack(args);
    this.state = outcome.state;
    let events = outcome.events.filter(simpleEvent);

    this.state.enemyIntent = null;
    this.state.attacksSinceIntent = 0;
    this.state.intentCount = 0;
    this.state.runAttackBonus = 0;
    this.state.reactionStyle = null;
    this.state.runEvent = null;
    this.state.runEventResume = null;
    this.state.runUpgradeResume = null;
    this.state.runUpgradeOfferIds = [];
    this.state.selectedUpgrade = null;
    this.state.selectedUpgrades = [];
    for (const participant of this.state.participants) resetSimpleParticipant(participant);

    // CombatDungeonRun historically pauses before the boss in an upgrade phase. The
    // simple loop removes that temporary-buff decision and transitions immediately.
    if (this.state.phase === 'upgrade') {
      const transition = new CombatDungeonRun(this.state).chooseUpgrade('sharpen');
      this.state = transition.state;
      this.state.runAttackBonus = Math.max(0, Number(this.state.runAttackBonus || 0) - Number(LEGACY_RUN_UPGRADES.sharpen.attackBonus || 0));
      this.state.selectedUpgrade = null;
      this.state.selectedUpgrades = [];
      this.state.reactionStyle = null;
      this.state.enemyIntent = null;
      this.state.attacksSinceIntent = 0;
      this.state.intentCount = 0;
      for (const participant of this.state.participants) resetSimpleParticipant(participant);
      events.push({
        type: 'BossEncounterStarted',
        runId: this.state.id,
        dungeonId: this.state.dungeonId,
        enemyId: this.state.enemy?.id || null,
        enemyName: this.state.enemy?.name || null,
        enemyHp: this.state.enemy?.hp ?? null,
        enemyMaxHp: this.state.enemy?.maxHp ?? null,
      });
    }

    const defeatedEnemy = events.some((event) => event.type === 'EnemyDefeated');
    if (defeatedEnemy && ['combat', 'boss'].includes(this.state.phase) && before.enemy?.id !== this.state.enemy?.id) {
      const recovered = recoverBetweenEncounters(this.state.participants);
      if (recovered.length) {
        events.push({
          type: 'DungeonRecoveryApplied',
          runId: this.state.id,
          dungeonId: this.state.dungeonId,
          recovered,
        });
      }
    }

    return {
      ...outcome,
      events,
      state: this.toJSON(),
      simpleCombat: true,
    };
  }

  #runUpgradeOffers() {
    const offered = offeredRunUpgradeIds(this.state, Object.values(RUN_UPGRADES));
    if (!this.state.runUpgradeOfferIds.length) this.state.runUpgradeOfferIds = [...offered];
    return offered;
  }

  #snapshotRunUpgradeOffers() {
    if (this.state.runUpgradeOfferIds.length) return;
    this.state.runUpgradeOfferIds = offeredRunUpgradeIds(this.state, Object.values(RUN_UPGRADES));
  }

  #pauseForRunEvent(before, events) {
    if (this.state.simpleCombat) return;
    const schedule = this.state.runEventSchedule;
    if (!schedule || this.state.runEventHistory.length > 0) return;
    if (before.phase !== 'combat' || this.state.phase !== 'combat') return;
    if (before.encounterIndex !== schedule.afterEncounterIndex) return;
    if (this.state.encounterIndex !== before.encounterIndex + 1) return;
    if (!events.some((event) => event.type === 'EnemyDefeated')) return;

    const selected = selectRunEvent(schedule, `${this.state.id}:${before.encounterIndex}`);
    if (!selected) return;
    this.state.runEventResume = {
      encounterIndex: this.state.encounterIndex,
      enemy: structuredClone(this.state.enemy),
    };
    this.state.phase = 'event';
    this.state.enemy = null;
    this.state.enemyIntent = null;
    this.state.attacksSinceIntent = 0;
    this.state.intentCount = 0;
    this.state.runEvent = selected;
    events.push({
      type: 'RunEventDiscovered',
      runId: this.state.id,
      dungeonId: this.state.dungeonId,
      event: structuredClone(selected),
    });
  }

  #pauseForRunPowerDraft(before, events) {
    if (this.state.simpleCombat || !this.state.runPowerDraftsEnabled) return;
    if (before.phase !== 'combat' || this.state.phase !== 'combat') return;
    if (!events.some((event) => event.type === 'EnemyDefeated')) return;
    if (this.state.encounterIndex !== before.encounterIndex + 1) return;
    if (this.state.runEventSchedule?.afterEncounterIndex === before.encounterIndex && this.state.runEventHistory.length === 0) return;

    this.state.runUpgradeResume = {
      encounterIndex: this.state.encounterIndex,
      enemy: structuredClone(this.state.enemy),
    };
    this.state.phase = 'upgrade';
    this.state.enemy = null;
    this.state.enemyIntent = null;
    this.state.attacksSinceIntent = 0;
    this.state.intentCount = 0;
    this.state.runUpgradeOfferIds = [];
    events.push({
      type: 'RunUpgradeOffered',
      runId: this.state.id,
      dungeonId: this.state.dungeonId,
      draftIndex: Number(this.state.runUpgradeDraftIndex || 0),
      afterEncounterIndex: before.encounterIndex,
    });
  }
}
