import { randomUUID } from 'node:crypto';
import { Character } from '../domain/Character.js';
import { publicCombatSkills } from '../domain/CombatSkillCatalog.js';
import { AdventureRun as DungeonRun, DUNGEONS, RUN_UPGRADES } from '../domain/AdventureRun.js';
import { ItemGenerator } from '../domain/ItemGenerator.js';
import { Party } from '../domain/Party.js';
import { publicRelicAttunements, relicProgression } from '../domain/RelicProgressionPolicy.js';

export class GameService {
  constructor({ repository, eventBus, arcManifestService = null, itemGenerator = new ItemGenerator(), idFactory = randomUUID }) {
    this.repository = repository;
    this.eventBus = eventBus;
    this.arcManifestService = arcManifestService;
    this.itemGenerator = itemGenerator;
    this.idFactory = idFactory;
  }

  ensurePlayer(identityProfile) {
    return this.repository.getOrCreatePlayer({
      threadedUserId: identityProfile.id,
      displayName: identityProfile.name || identityProfile.username || `Weaver ${identityProfile.id}`,
    });
  }

  dashboard(playerId) {
    const row = this.repository.getPlayer(playerId);
    if (!row) throw new Error('Player not found.');
    const equippedItem = row.equippedItemId ? this.repository.getItem(row.equippedItemId) : null;
    const character = new Character({ ...row, equippedItem });
    const party = this.repository.getPartyForPlayer(playerId);
    const activeRun = this.repository.getActiveRun(playerId);
    const generatedDungeons = this.arcManifestService?.runtimeDungeons() || [];
    const allDungeons = [...Object.values(DUNGEONS), ...generatedDungeons];
    const decorateItem = (item) => item ? { ...item, progression: relicProgression(item) } : null;

    return {
      character: {
        id: character.id,
        displayName: character.displayName,
        baseAttack: character.baseAttack,
        attackPower: character.attackPower,
        maxHealth: character.maxHealth,
        currentHealth: row.currentHealth,
        healthPotions: row.healthPotions,
        threadDust: character.threadDust,
        equippedItem: decorateItem(equippedItem),
      },
      party: party ? this.#decorateParty(party, playerId) : null,
      inventory: this.repository.listItems(playerId).map(decorateItem),
      activeRun: activeRun ? this.#decorateRun(activeRun, playerId) : null,
      achievements: this.repository.listAchievements(playerId),
      world: this.repository.getWorldState(),
      dungeons: allDungeons.map(({ id, name, recommendedPlayers, minPlayers, maxPlayers, arcId, arcTitle, sourceManifestRevision }) => ({ id, name, recommendedPlayers, minPlayers, maxPlayers, arcId: arcId || 'arc-1', arcTitle: arcTitle || 'The First Unraveling', sourceManifestRevision: sourceManifestRevision || null })),
      runUpgrades: Object.values(RUN_UPGRADES),
      combatSkills: publicCombatSkills(),
      relicAttunements: publicRelicAttunements(),
    };
  }

  startDungeon(playerId, dungeonId) {
    if (this.repository.getActiveRun(playerId)) throw new Error('Finish or fail the active run before starting another.');
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const dungeonDefinition = DUNGEONS[dungeonId] || this.arcManifestService?.resolveDungeon(dungeonId);
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

    const run = DungeonRun.start({
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
      enemyId: persisted.enemy?.id || null,
      enemyName: persisted.enemy?.name || null,
      enemyHp: persisted.enemy?.hp ?? null,
      enemyMaxHp: persisted.enemy?.maxHp ?? null,
      actorHp: actor?.hp ?? null,
      actorMaxHp: actor?.maxHp ?? null,
      phase: persisted.phase,
    });
    return this.#decorateRun(persisted, playerId);
  }

  attack(playerId, runId) {
    const { run, character, equipped } = this.#combatContext(playerId, runId);
    const outcome = run.attack({
      playerId,
      attackPower: character.attackPower,
      equipmentEffect: equipped?.effectCode ?? 'none',
      attunementCode: equipped?.effect?.attunementCode ?? null,
    });
    return this.#persistCombatOutcome(playerId, run, outcome, 'attack');
  }

  guard(playerId, runId) {
    const { run, equipped } = this.#combatContext(playerId, runId);
    return this.#persistCombatOutcome(playerId, run, run.guard({ playerId, attunementCode: equipped?.effect?.attunementCode ?? null }), 'guard');
  }

  interrupt(playerId, runId) {
    const { run, equipped } = this.#combatContext(playerId, runId);
    return this.#persistCombatOutcome(playerId, run, run.interrupt({ playerId, attunementCode: equipped?.effect?.attunementCode ?? null }), 'interrupt');
  }

  mend(playerId, runId, targetPlayerId) {
    const { run, equipped } = this.#combatContext(playerId, runId);
    return this.#persistCombatOutcome(playerId, run, run.mend({ playerId, targetPlayerId, attunementCode: equipped?.effect?.attunementCode ?? null }), 'mend');
  }

  revive(playerId, runId, targetPlayerId) {
    const { run, equipped } = this.#combatContext(playerId, runId);
    return this.#persistCombatOutcome(playerId, run, run.revive({ playerId, targetPlayerId, attunementCode: equipped?.effect?.attunementCode ?? null }), 'revive');
  }

  useSkill(playerId, runId, skillId) {
    const { run, character, equipped } = this.#combatContext(playerId, runId);
    const outcome = run.useSkill({ playerId, skillId, attackPower: character.attackPower, attunementCode: equipped?.effect?.attunementCode ?? null });
    return this.#persistCombatOutcome(playerId, run, outcome, 'skill');
  }

  chooseRunEvent(playerId, runId, choiceId) {
    const runState = this.repository.getRun(runId);
    if (!runState) throw new Error('Run not found.');
    const run = new DungeonRun(runState);
    if (!run.hasParticipant(playerId)) throw new Error('Run not found.');
    if (runState.ownerType === 'party') {
      const party = this.repository.getParty(runState.ownerId);
      if (!party || party.leaderPlayerId !== playerId) throw new Error('Only the party leader can choose the shared run event.');
    }
    const outcome = run.chooseRunEvent(choiceId);
    outcome.state = this.repository.saveRun(outcome.state);
    this.eventBus.publishAll(outcome.events.map((event) => ({ ...event, playerId, participantIds: outcome.state.participants.map((participant) => participant.playerId) })));
    return this.#decorateRun(outcome.state, playerId);
  }

  chooseUpgrade(playerId, runId, upgradeId) {
    const runState = this.repository.getRun(runId);
    if (!runState) throw new Error('Run not found.');
    const run = new DungeonRun(runState);
    if (!run.hasParticipant(playerId)) throw new Error('Run not found.');
    if (runState.ownerType === 'party') {
      const party = this.repository.getParty(runState.ownerId);
      if (!party || party.leaderPlayerId !== playerId) throw new Error('Only the party leader can choose the shared run upgrade.');
    }
    const outcome = run.chooseUpgrade(upgradeId);
    outcome.state = this.repository.saveRun(outcome.state);
    this.eventBus.publishAll(outcome.events.map((event) => ({ ...event, playerId })));
    return this.#decorateRun(outcome.state, playerId);
  }

  equipItem(playerId, itemId) {
    const item = this.repository.getItem(itemId);
    if (!item || item.playerId !== playerId) throw new Error('Item not found.');
    if (this.repository.getActiveRun(playerId)) {
      const error = new Error('Finish the active dungeon before changing equipped relics.');
      error.code = 'item_equip_during_run';
      throw error;
    }
    this.repository.equipItem(playerId, itemId);
    this.eventBus.publish({ type: 'ItemEquipped', playerId, itemId });
    return this.dashboard(playerId);
  }

  #combatContext(playerId, runId) {
    const runState = this.repository.getRun(runId);
    if (!runState) throw new Error('Run not found.');
    const run = new DungeonRun(runState);
    if (!run.hasParticipant(playerId)) throw new Error('Run not found.');
    const player = this.repository.getPlayer(playerId);
    const equipped = player.equippedItemId ? this.repository.getItem(player.equippedItemId) : null;
    return { run, player, equipped, character: new Character({ ...player, equippedItem: equipped }) };
  }

  #publishResolvedAction(playerId, action, outcome) {
    const state = outcome.state;
    const actor = state.participants.find((participant) => participant.playerId === playerId) || null;
    const damaged = outcome.events.find((event) => event.type === 'PlayerDamaged') || null;
    const damagedTarget = damaged ? state.participants.find((participant) => participant.playerId === damaged.playerId) || null : null;
    const defeated = outcome.events.find((event) => event.type === 'EnemyDefeated') || null;
    const healed = outcome.events.find((event) => event.type === 'PlayerHealed') || null;
    const revived = outcome.events.find((event) => event.type === 'PlayerRevived') || null;
    const interrupted = outcome.events.find((event) => event.type === 'EnemyInterrupted') || null;
    const combo = outcome.events.find((event) => event.type === 'SkillComboTriggered') || null;
    const protectedAlly = outcome.events.find((event) => event.type === 'PlayerProtected') || null;
    const bossPhaseChanged = outcome.events.find((event) => event.type === 'BossPhaseChanged') || null;
    const relicTrigger = outcome.events.find((event) => event.type === 'RelicAttunementTriggered') || null;
    const prevented = protectedAlly
      ? Number(protectedAlly.prevented || 0)
      : damaged
        ? Math.max(0, Number(damaged.rawDamage || 0) - Number(damaged.damage || 0))
        : 0;

    this.eventBus.publish({
      type: 'CombatActionResolved',
      playerId,
      participantIds: state.participants.map((participant) => participant.playerId),
      runId: state.id,
      dungeonId: state.dungeonId,
      action,
      skillId: outcome.skillId || null,
      combo: combo?.combo || null,
      comboBonus: Number(combo?.bonusDamage || 0),
      damage: Number(outcome.damage || 0),
      retaliation: Number(outcome.retaliation || damaged?.damage || 0),
      prevented,
      healed: Number(outcome.healed || healed?.amount || 0),
      restoredHp: Number(outcome.restoredHp || revived?.restoredHp || 0),
      targetPlayerId: healed?.targetPlayerId || revived?.targetPlayerId || damaged?.playerId || null,
      protectedPlayerId: protectedAlly?.targetPlayerId || null,
      protectionRawDamage: Number(protectedAlly?.rawDamage || 0),
      relicAttunement: relicTrigger ? {
        code: relicTrigger.attunementCode,
        name: relicTrigger.attunementName,
        effect: relicTrigger.effect,
        amount: Number(relicTrigger.amount || 0),
      } : null,
      actorHp: actor?.hp ?? null,
      actorMaxHp: actor?.maxHp ?? null,
      actorFocus: actor?.focus ?? null,
      actorMaxFocus: actor?.maxFocus ?? null,
      actorSkillCooldowns: actor?.skillCooldowns ? structuredClone(actor.skillCooldowns) : {},
      targetHp: damagedTarget?.hp ?? null,
      targetMaxHp: damagedTarget?.maxHp ?? null,
      enemyId: state.enemy?.id || defeated?.enemyId || null,
      enemyName: state.enemy?.name || null,
      enemyHp: state.enemy?.hp ?? null,
      enemyMaxHp: state.enemy?.maxHp ?? null,
      enemyStatuses: state.enemy?.statuses ? structuredClone(state.enemy.statuses) : {},
      bossBattlePhase: state.enemy?.isBoss ? Number(state.enemy.battlePhase || 1) : null,
      bossPhaseName: state.enemy?.isBoss ? state.enemy.phaseName || null : null,
      bossPhaseChanged: bossPhaseChanged ? {
        fromBattlePhase: bossPhaseChanged.fromBattlePhase,
        battlePhase: bossPhaseChanged.battlePhase,
        phaseName: bossPhaseChanged.phaseName,
      } : null,
      runEvent: state.runEvent ? structuredClone(state.runEvent) : null,
      defeatedEnemyId: defeated?.enemyId || null,
      defeatedBoss: Boolean(defeated?.isBoss),
      interruptedIntentId: interrupted?.intentId || null,
      enemyIntent: state.enemyIntent ? structuredClone(state.enemyIntent) : null,
      phase: state.phase,
      encounterIndex: state.encounterIndex,
    });
  }

  #persistCombatOutcome(playerId, run, outcome, action) {
    outcome.state = this.repository.saveRun(outcome.state);
    this.eventBus.publishAll(outcome.events);
    this.#publishResolvedAction(playerId, action, outcome);

    let rewards = null;
    if (outcome.state.phase === 'complete' && !outcome.state.rewardsGranted) {
      const rewardsByPlayer = {};
      const rewardItemIds = {};
      for (const participant of outcome.state.participants) {
        const reward = this.arcManifestService?.generateReward(outcome.state.dungeonId) || this.itemGenerator.generateReward({ source: outcome.state.dungeonId });
        rewardsByPlayer[participant.playerId] = reward;
        rewardItemIds[participant.playerId] = reward.id;
      }

      const completedRun = new DungeonRun(outcome.state);
      completedRun.markRewards(rewardItemIds);
      const generatedArcId = outcome.state.dungeonDefinition?.arcId;
      const completion = this.repository.completeRunWithRewards(completedRun.toJSON(), rewardsByPlayer, {
        threadDust: 15,
        worldProgressKey: generatedArcId ? `arc:${generatedArcId}:${outcome.state.dungeonId}:clears` : 'arc-1-frayed-hollow-clears',
      });

      outcome.state = completion.state;
      if (completion.applied) {
        rewards = Object.entries(rewardsByPlayer).map(([participantId, item]) => ({ playerId: participantId, item }));
        const participantIds = completion.state.participants.map((participant) => participant.playerId);
        for (const participant of completion.state.participants) {
          this.eventBus.publish({
            type: 'DungeonCompleted',
            playerId: participant.playerId,
            participantIds,
            runId: completion.state.id,
            dungeonId: completion.state.dungeonId,
          });
          this.eventBus.publish({ type: 'ItemGenerated', playerId: participant.playerId, itemId: rewardItemIds[participant.playerId], source: completion.state.dungeonId });
        }
      }
    }

    return {
      ...outcome,
      state: this.#decorateRun(outcome.state, playerId),
      rewards,
      reward: rewards?.find((entry) => entry.playerId === playerId)?.item ?? null,
    };
  }

  #decorateParty(party, viewerPlayerId) {
    const model = new Party(party);
    return {
      ...party,
      isLeader: party.leaderPlayerId === viewerPlayerId,
      allReady: model.allReady,
      canStart: model.canStart(viewerPlayerId),
    };
  }

  #decorateRun(runState, viewerPlayerId) {
    const participants = runState.participants.map((participant) => ({
      ...participant,
      displayName: this.repository.getPlayer(participant.playerId)?.displayName || 'Unknown Weaver',
    }));
    return {
      ...runState,
      participants,
      viewer: participants.find((participant) => participant.playerId === viewerPlayerId) || null,
      isLeader: runState.ownerType === 'player'
        ? runState.startedByPlayerId === viewerPlayerId
        : this.repository.getParty(runState.ownerId)?.leaderPlayerId === viewerPlayerId,
    };
  }
}
