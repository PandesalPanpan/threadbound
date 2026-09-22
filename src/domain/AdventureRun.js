import { DUNGEONS, DungeonRun as CombatDungeonRun, RUN_UPGRADES as LEGACY_RUN_UPGRADES } from './DungeonRun.js';
import { runEventChoice, selectRunEvent, snapshotRunEventSchedule } from './RunEventCatalog.js';
import { applyRelicCombatAttunement } from './RelicCombatPolicy.js';
import { RUN_UPGRADES, runUpgrade } from './RunPowerCatalog.js';
import { offeredRunUpgradeIds, RUN_UPGRADE_OFFER_VERSION } from './RunUpgradeOfferPolicy.js';
import {
  instantiateSimpleStage,
  prepareSimpleDungeon,
  simpleStageFor,
} from './SimpleDungeonPolicy.js';
import { resolveSimpleEncounter as resolveSimpleEncounterPolicy } from './SimpleEncounterBattle.js';

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

function compatibilityCombatant(enemy, encounterIndex = 0) {
  if (!enemy) return null;
  return {
    ...structuredClone(enemy),
    combatantId: enemy.combatantId || `legacy-room-${encounterIndex}:${enemy.id || enemy.definitionId || 'enemy'}:0`,
    definitionId: enemy.definitionId || enemy.id,
    targetingProfile: enemy.targetingProfile || 'random',
  };
}

function simpleCompatibilityProjection(state, roster, encounterIndex = 0) {
  const primary = roster.find((enemy) => Number(enemy.hp || 0) > 0) || roster[0] || null;
  if (!primary) return null;
  if (Number(state.simpleCombatVersion || 1) < 2) return primary;
  const legacyDefinition = state.dungeonDefinition?.encounters?.[encounterIndex]
    || (Number(encounterIndex) === Number(state.simpleStageCount) ? state.dungeonDefinition?.boss : null)
    || primary;
  const legacyMaxHp = Math.max(1, Number(legacyDefinition.maxHp || legacyDefinition.hp || primary.maxHp || 1));
  const roomHp = roster.reduce((sum, enemy) => sum + Math.max(0, Number(enemy.hp || 0)), 0);
  return {
    ...structuredClone(primary),
    hp: Math.min(legacyMaxHp, roomHp),
    maxHp: legacyMaxHp,
    // `enemy` is a compatibility room projection; the authoritative individual
    // values remain in `enemies` and in replay actions.
    combatantId: primary.combatantId,
  };
}

function syncSimpleCompatibility(state) {
  if (Array.isArray(state.enemies)) {
    state.enemy = simpleCompatibilityProjection(state, state.enemies, state.encounterIndex || 0);
  }
  if (state.nextEncounter) {
    if (Array.isArray(state.nextEncounter.enemies)) {
      state.nextEncounter.enemy = simpleCompatibilityProjection(state, state.nextEncounter.enemies, state.nextEncounter.encounterIndex || 0);
    } else if (state.nextEncounter.enemy) {
      state.nextEncounter.enemies = [compatibilityCombatant(state.nextEncounter.enemy, state.nextEncounter.encounterIndex)];
      state.nextEncounter.enemy = state.nextEncounter.enemies[0];
    }
  }
  return state;
}

function simpleStage(state, encounterIndex) {
  const normalStages = state.dungeonDefinition?.simpleStages || [];
  if (encounterIndex < normalStages.length) return { stage: normalStages[encounterIndex], boss: false };
  if (encounterIndex === normalStages.length && state.dungeonDefinition?.boss) {
    return { stage: [state.dungeonDefinition.boss], boss: true };
  }
  return null;
}

function preparedSimpleStageCount(definition) {
  return Array.isArray(definition?.simpleStages) ? definition.simpleStages.length : 0;
}

/**
 * Aggregate facade for the whole dungeon run lifecycle.
 *
 * Legacy runs still support the tactical systems while new player-facing simple
 * runs use a much smaller state machine: enter/continue -> automatic room
 * replay -> next enemy -> boss -> reward.
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
    this.state.nextEncounter ??= null;
    this.state.runPowerDraftsEnabled = state.runPowerDraftsEnabled === true;
    this.state.simpleCombat = state.simpleCombat === true;
    if (this.state.simpleCombat) {
      // Runs created before multi-enemy combat only persisted `enemy`. Hydrate
      // that singleton into a stable one-member roster without changing its
      // old combat semantics; v2 runs always keep `enemies` authoritative.
      if (!Array.isArray(this.state.enemies)) {
        this.state.enemies = this.state.enemy
          ? [compatibilityCombatant(this.state.enemy, this.state.encounterIndex || 0)]
          : [];
        this.state.simpleCombatVersion ??= 1;
      }
      if (this.state.nextEncounter && !Array.isArray(this.state.nextEncounter.enemies) && this.state.nextEncounter.enemy) {
        this.state.nextEncounter.enemies = [compatibilityCombatant(this.state.nextEncounter.enemy, this.state.nextEncounter.encounterIndex || 0)];
      }
      this.state.simpleCombatVersion ??= 2;
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
      syncSimpleCompatibility(this.state);
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

  static startSimple({ sharedSurface = true, ...args }) {
    const sourceDefinition = args.dungeonDefinition || DUNGEONS[args.dungeonId];
    const combat = CombatDungeonRun.start({
      ...args,
      dungeonDefinition: prepareSimpleDungeon(sourceDefinition),
    });
    const state = combat.toJSON();
    state.simpleCombat = true;
    state.simpleCombatVersion = 2;
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
    state.nextEncounter = null;
    state.sharedSurface = Boolean(sharedSurface);
    state.simpleRoundIndex = 0;
    if (!sharedSurface) {
      // `/start-simple` is a compatibility route for the former local surface.
      // Keep its singleton semantics stable while the shared chat route uses the
      // new v2 multi-enemy contract.
      state.simpleCombatVersion = 1;
      state.enemies = state.enemy ? [compatibilityCombatant(state.enemy, 0)] : [];
      for (const participant of state.participants) resetSimpleParticipant(participant);
      syncSimpleCompatibility(state);
      return new AdventureRun(state);
    }
    state.simpleStageCount = preparedSimpleStageCount(state.dungeonDefinition);
    state.enemies = instantiateSimpleStage({
      definition: state.dungeonDefinition,
      stage: simpleStageFor(state.dungeonDefinition, 0),
      roomIndex: 0,
      participantCount: state.participants.length,
    });
    for (const participant of state.participants) resetSimpleParticipant(participant);
    syncSimpleCompatibility(state);
    return new AdventureRun(state);
  }

  hasParticipant(playerId) {
    return this.state.participants.some((participant) => participant.playerId === playerId);
  }

  participant(playerId) {
    return this.state.participants.find((participant) => participant.playerId === playerId) || null;
  }

  attack(args) { return this.#combat('attack', args); }

  /**
   * Resolve one public automatic battle command. Every living Weaver acts once
   * per round, followed by every enemy still alive after that phase. The
   * resulting atomic action list is retained for the shared replay projection.
   */
  resolveSimpleEncounter({ playerActions = {}, now = new Date().toISOString() } = {}) {
    if (!this.state.simpleCombat || Number(this.state.simpleCombatVersion || 1) < 2) {
      throw new Error('This run uses the legacy single-enemy combat resolver.');
    }
    if (!['combat', 'boss'].includes(this.state.phase)) {
      throw new Error('The run is not currently in combat.');
    }

    const roomIndex = Number(this.state.encounterIndex || 0);
    const result = resolveSimpleEncounterPolicy({
      runId: this.state.id,
      roomIndex,
      participants: this.state.participants,
      enemies: this.state.enemies,
      playerActions,
    });
    this.state.participants = result.participants;
    this.state.enemies = result.enemies;
    this.state.simpleRoundIndex = Number(this.state.simpleRoundIndex || 0) + Number(result.rounds || 0);
    this.state.enemyIntent = null;
    this.state.attacksSinceIntent = 0;
    this.state.intentCount = 0;
    this.state.runAttackBonus = 0;
    this.state.reactionStyle = null;
    const events = [...result.events];

    if (result.outcome === 'defeat') {
      this.state.phase = 'failed';
      this.state.completedAt = now;
      this.state.nextEncounter = null;
      events.push({
        type: 'DungeonFailed',
        runId: this.state.id,
        dungeonId: this.state.dungeonId,
        participantIds: this.state.participants.map((participant) => participant.playerId),
      });
    } else if (result.outcome === 'room_clear') {
      const current = simpleStage(this.state, roomIndex);
      if (current?.boss) {
        this.state.phase = 'complete';
        this.state.enemies = [];
        this.state.enemy = null;
        this.state.nextEncounter = null;
        this.state.completedAt = now;
        events.push({
          type: 'BossDefeated',
          runId: this.state.id,
          dungeonId: this.state.dungeonId,
          enemyId: this.state.dungeonDefinition?.boss?.id || null,
          enemyCombatantId: result.actions.find((action) => action.phase === 'player' && action.defeated)?.targetCombatantId || null,
        });
        events.push({
          type: 'DungeonCompleted',
          runId: this.state.id,
          dungeonId: this.state.dungeonId,
          participantIds: this.state.participants.map((participant) => participant.playerId),
        });
      } else {
        const nextIndex = roomIndex + 1;
        const next = simpleStage(this.state, nextIndex);
        if (!next) throw new Error('The simple Dungeon has no next encounter stage.');
        const nextEnemies = instantiateSimpleStage({
          definition: this.state.dungeonDefinition,
          stage: next.stage,
          roomIndex: nextIndex,
          participantCount: this.state.participants.length,
          boss: next.boss,
        });
        this.state.nextEncounter = {
          phase: next.boss ? 'boss' : 'combat',
          encounterIndex: nextIndex,
          enemies: nextEnemies,
          enemy: nextEnemies[0],
        };
        this.state.phase = 'between_encounter';
        this.state.enemies = [];
        this.state.enemy = null;
        for (const participant of this.state.participants) resetSimpleParticipant(participant);
        const primary = nextEnemies[0] || null;
        events.push({
          type: 'DungeonRoomCleared',
          runId: this.state.id,
          dungeonId: this.state.dungeonId,
          encounterIndex: roomIndex,
          nextEncounterIndex: nextIndex,
          nextEnemyId: primary?.id || null,
          nextEnemyName: primary?.name || null,
          nextEnemyVisualAssetId: primary?.visualAssetId || null,
          nextEnemyHp: primary?.hp ?? null,
          nextEnemyMaxHp: primary?.maxHp ?? null,
          nextEnemyIsBoss: Boolean(primary?.isBoss),
          nextEnemies: structuredClone(nextEnemies),
          participantIds: this.state.participants.map((candidate) => candidate.playerId),
        });
      }
    }

    syncSimpleCompatibility(this.state);
    return {
      state: this.toJSON(),
      events,
      actions: structuredClone(result.actions),
      rounds: result.rounds,
      damage: result.actions.filter((action) => action.phase === 'player').reduce((sum, action) => sum + Number(action.damage || 0), 0),
      retaliation: result.actions.filter((action) => action.phase === 'enemy').reduce((sum, action) => sum + Number(action.damage || 0), 0),
      simpleCombat: true,
    };
  }

  continueEncounter({ playerId } = {}) {
    if (!this.state.simpleCombat) throw new Error('Continue is only available for a simple Dungeon run.');
    if (this.state.phase !== 'between_encounter' || !this.state.nextEncounter) {
      const error = new Error('There is no Dungeon encounter waiting to continue.');
      error.code = 'dungeon_continue_not_available';
      throw error;
    }
    const participant = this.participant(playerId);
    if (!participant) throw new Error('Run not found.');
    if (participant.hp <= 0) throw new Error('A downed player cannot continue the Dungeon.');

    const next = this.#activateNextEncounter();
    const primaryNext = next.enemies.find((enemy) => Number(enemy.hp || 0) > 0) || next.enemies[0] || null;
    return {
      state: this.toJSON(),
      events: [{
        type: 'DungeonEncounterContinued',
        playerId,
        runId: this.state.id,
        dungeonId: this.state.dungeonId,
        phase: this.state.phase,
        encounterIndex: this.state.encounterIndex,
        enemyId: primaryNext?.id || null,
        enemyName: primaryNext?.name || null,
        enemyVisualAssetId: primaryNext?.visualAssetId || null,
        enemyHp: primaryNext?.hp ?? null,
        enemyMaxHp: primaryNext?.maxHp ?? null,
        enemyIsBoss: Boolean(primaryNext?.isBoss),
        enemies: structuredClone(next.enemies),
        participantIds: this.state.participants.map((candidate) => candidate.playerId),
        participants: this.state.participants.map((candidate) => ({
          playerId: candidate.playerId,
          hp: candidate.hp,
          maxHp: candidate.maxHp,
        })),
      }],
      simpleCombat: true,
    };
  }

  usePotionBetweenEncounters({ playerId, healed } = {}) {
    if (!this.state.simpleCombat) throw new Error('Dungeon potions are only available for a simple Dungeon run.');
    if (this.state.phase !== 'between_encounter' || !this.state.nextEncounter) {
      throw new Error('A Dungeon potion can only be used between encounters.');
    }
    const participant = this.participant(playerId);
    if (!participant) throw new Error('Run not found.');
    if (participant.hp <= 0) throw new Error('A downed player cannot use a Dungeon potion.');
    const amount = Math.floor(Number(healed));
    if (!Number.isInteger(amount) || amount <= 0) throw new Error('Dungeon potion healing must be positive.');
    const beforeHp = participant.hp;
    participant.hp = Math.min(participant.maxHp, participant.hp + amount);
    const next = this.#activateNextEncounter();
    const primaryNext = next.enemies.find((enemy) => Number(enemy.hp || 0) > 0) || next.enemies[0] || null;
    return {
      state: this.toJSON(),
      events: [{
        type: 'DungeonPotionUsed',
        playerId,
        runId: this.state.id,
        dungeonId: this.state.dungeonId,
        healed: participant.hp - beforeHp,
        actorHp: participant.hp,
        actorMaxHp: participant.maxHp,
        phase: this.state.phase,
        encounterIndex: this.state.encounterIndex,
        enemyId: primaryNext?.id || null,
        enemyName: primaryNext?.name || null,
        enemyVisualAssetId: primaryNext?.visualAssetId || null,
        enemyHp: primaryNext?.hp ?? null,
        enemyMaxHp: primaryNext?.maxHp ?? null,
        enemyIsBoss: Boolean(primaryNext?.isBoss),
        enemies: structuredClone(next.enemies),
        participantIds: this.state.participants.map((candidate) => candidate.playerId),
        participants: this.state.participants.map((candidate) => ({
          playerId: candidate.playerId,
          hp: candidate.hp,
          maxHp: candidate.maxHp,
        })),
      }],
      healed: participant.hp - beforeHp,
      simpleCombat: true,
    };
  }

  retreat({ playerId, now = new Date().toISOString() } = {}) {
    if (!this.state.simpleCombat) throw new Error('Retreat is only available for a simple Dungeon run.');
    if (this.state.phase !== 'between_encounter' || !this.state.nextEncounter) {
      const error = new Error('Retreat is only available between Dungeon encounters.');
      error.code = 'dungeon_retreat_not_available';
      throw error;
    }
    if (!this.hasParticipant(playerId)) throw new Error('Run not found.');
    this.state.phase = 'retreated';
    this.state.enemy = null;
    this.state.enemies = [];
    this.state.nextEncounter = null;
    this.state.enemyIntent = null;
    this.state.completedAt = now;
    return {
      state: this.toJSON(),
      events: [{
        type: 'DungeonRetreated',
        playerId,
        runId: this.state.id,
        dungeonId: this.state.dungeonId,
        participantIds: this.state.participants.map((candidate) => candidate.playerId),
        encounterIndex: this.state.encounterIndex,
        securedRewards: false,
      }],
      simpleCombat: true,
    };
  }

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
      const error = new Error('This dungeon resolves rooms automatically. Choose Continue, use a Health Potion, or Leave between rooms.');
      error.code = 'simple_combat_attack_only';
      throw error;
    }
    if (!['combat', 'boss'].includes(this.state.phase)) throw new Error('The run is not currently in combat.');

    if (Number(this.state.simpleCombatVersion || 1) >= 2) {
      return this.resolveSimpleEncounter({
        playerActions: {
          [args.playerId]: {
            attackPower: args.attackPower,
            equipmentEffect: args.equipmentEffect,
          },
        },
        now: args.now,
      });
    }

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
    const defeatedEvent = events.find((event) => event.type === 'EnemyDefeated');
    if (defeatedEvent && before.enemy) {
      defeatedEvent.enemyName = before.enemy.name;
      defeatedEvent.enemyMaxHp = before.enemy.maxHp;
    }
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
        enemyVisualAssetId: this.state.enemy?.visualAssetId || null,
        enemyHp: this.state.enemy?.hp ?? null,
        enemyMaxHp: this.state.enemy?.maxHp ?? null,
      });
    }

    const defeatedEnemy = events.find((event) => event.type === 'EnemyDefeated');
    if (defeatedEnemy && !defeatedEnemy.isBoss && this.state.enemy && before.enemy?.id !== this.state.enemy?.id) {
      const next = structuredClone(this.state.enemy);
      events = events.filter((event) => event.type !== 'BossEncounterStarted');
      this.state.nextEncounter = {
        phase: next.isBoss ? 'boss' : 'combat',
        encounterIndex: this.state.encounterIndex,
        enemy: next,
      };
      this.state.phase = 'between_encounter';
      this.state.enemy = null;
      this.state.enemyIntent = null;
      this.state.attacksSinceIntent = 0;
      this.state.intentCount = 0;
      events.push({
        type: 'DungeonRoomCleared',
        runId: this.state.id,
        dungeonId: this.state.dungeonId,
        encounterIndex: this.state.encounterIndex,
        nextEnemyId: next.id,
        nextEnemyName: next.name,
        nextEnemyVisualAssetId: next.visualAssetId || null,
        nextEnemyHp: next.hp,
        nextEnemyMaxHp: next.maxHp,
        nextEnemyIsBoss: Boolean(next.isBoss),
        participantIds: this.state.participants.map((candidate) => candidate.playerId),
      });
    }

    // Keep the migration roster projection synchronized for legacy persisted
    // simple runs whose authoritative state is still the singleton `enemy`.
    if (Number(this.state.simpleCombatVersion || 1) < 2) {
      this.state.enemies = this.state.enemy
        ? [compatibilityCombatant(this.state.enemy, this.state.encounterIndex || 0)]
        : [];
      if (this.state.nextEncounter?.enemy) {
        this.state.nextEncounter.enemies = [compatibilityCombatant(this.state.nextEncounter.enemy, this.state.nextEncounter.encounterIndex || 0)];
      }
    }

    return {
      ...outcome,
      events,
      state: this.toJSON(),
      simpleCombat: true,
    };
  }

  #activateNextEncounter() {
    const pending = this.state.nextEncounter;
    this.state.phase = pending.phase;
    this.state.encounterIndex = pending.encounterIndex;
    this.state.enemies = Array.isArray(pending.enemies)
      ? structuredClone(pending.enemies)
      : [compatibilityCombatant(pending.enemy, pending.encounterIndex)];
    this.state.enemy = this.state.enemies[0] || null;
    this.state.nextEncounter = null;
    this.state.enemyIntent = null;
    this.state.attacksSinceIntent = 0;
    this.state.intentCount = 0;
    this.state.runAttackBonus = 0;
    this.state.reactionStyle = null;
    for (const participant of this.state.participants) resetSimpleParticipant(participant);
    syncSimpleCompatibility(this.state);
    return { phase: this.state.phase, enemy: structuredClone(this.state.enemy), enemies: structuredClone(this.state.enemies) };
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
