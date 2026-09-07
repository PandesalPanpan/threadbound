import { randomUUID } from 'node:crypto';
import { Character } from '../domain/Character.js';
import { DUNGEONS, DungeonRun, RUN_UPGRADES } from '../domain/DungeonRun.js';
import { ItemGenerator } from '../domain/ItemGenerator.js';
import { Party } from '../domain/Party.js';

export class GameService {
  constructor({ repository, eventBus, itemGenerator = new ItemGenerator(), idFactory = randomUUID }) {
    this.repository = repository;
    this.eventBus = eventBus;
    this.itemGenerator = itemGenerator;
    this.idFactory = idFactory;
  }

  ensurePlayer(threadedProfile) {
    return this.repository.getOrCreatePlayer({
      threadedUserId: threadedProfile.id,
      displayName: threadedProfile.name || threadedProfile.username || `Threaded ${threadedProfile.id}`,
    });
  }

  dashboard(playerId) {
    const row = this.repository.getPlayer(playerId);
    if (!row) throw new Error('Player not found.');
    const equippedItem = row.equippedItemId ? this.repository.getItem(row.equippedItemId) : null;
    const character = new Character({ ...row, equippedItem });
    const party = this.repository.getPartyForPlayer(playerId);
    const activeRun = this.repository.getActiveRun(playerId);

    return {
      character: {
        id: character.id,
        displayName: character.displayName,
        baseAttack: character.baseAttack,
        attackPower: character.attackPower,
        maxHealth: character.maxHealth,
        threadDust: character.threadDust,
        equippedItem,
      },
      party: party ? this.#decorateParty(party, playerId) : null,
      inventory: this.repository.listItems(playerId),
      activeRun: activeRun ? this.#decorateRun(activeRun, playerId) : null,
      achievements: this.repository.listAchievements(playerId),
      world: this.repository.getWorldState(),
      dungeons: Object.values(DUNGEONS).map(({ id, name, recommendedPlayers, minPlayers, maxPlayers }) => ({ id, name, recommendedPlayers, minPlayers, maxPlayers })),
      runUpgrades: Object.values(RUN_UPGRADES),
    };
  }

  startDungeon(playerId, dungeonId) {
    if (this.repository.getActiveRun(playerId)) throw new Error('Finish or fail the active run before starting another.');
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');

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
    });
    this.repository.createRun(run.toJSON());
    this.eventBus.publish({ type: 'DungeonStarted', playerId, runId: run.state.id, dungeonId, ownerType, ownerId });
    return this.#decorateRun(run.toJSON(), playerId);
  }

  attack(playerId, runId) {
    const runState = this.repository.getRun(runId);
    if (!runState) throw new Error('Run not found.');
    const run = new DungeonRun(runState);
    if (!run.hasParticipant(playerId)) throw new Error('Run not found.');

    const player = this.repository.getPlayer(playerId);
    const equipped = player.equippedItemId ? this.repository.getItem(player.equippedItemId) : null;
    const character = new Character({ ...player, equippedItem: equipped });
    const outcome = run.attack({ playerId, attackPower: character.attackPower, equipmentEffect: equipped?.effectCode ?? 'none' });
    this.repository.saveRun(outcome.state);
    this.eventBus.publishAll(outcome.events);

    let rewards = null;
    if (outcome.state.phase === 'complete' && !outcome.state.rewardsGranted) {
      const rewardsByPlayer = {};
      const rewardItemIds = {};
      for (const participant of outcome.state.participants) {
        const reward = this.itemGenerator.generateReward({ source: outcome.state.dungeonId });
        rewardsByPlayer[participant.playerId] = reward;
        rewardItemIds[participant.playerId] = reward.id;
      }

      run.markRewards(rewardItemIds);
      const completedState = run.toJSON();
      const completion = this.repository.completeRunWithRewards(completedState, rewardsByPlayer, {
        threadDust: 15,
        worldProgressKey: 'arc-1-frayed-hollow-clears',
      });

      outcome.state = completion.state;
      if (completion.applied) {
        rewards = Object.entries(rewardsByPlayer).map(([participantId, item]) => ({ playerId: participantId, item }));
        for (const participant of completion.state.participants) {
          this.eventBus.publish({ type: 'DungeonCompleted', playerId: participant.playerId, runId, dungeonId: completion.state.dungeonId });
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
    this.repository.saveRun(outcome.state);
    this.eventBus.publishAll(outcome.events.map((event) => ({ ...event, playerId })));
    return this.#decorateRun(outcome.state, playerId);
  }

  equipItem(playerId, itemId) {
    const item = this.repository.getItem(itemId);
    if (!item || item.playerId !== playerId) throw new Error('Item not found.');
    this.repository.equipItem(playerId, itemId);
    this.eventBus.publish({ type: 'ItemEquipped', playerId, itemId });
    return this.dashboard(playerId);
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
