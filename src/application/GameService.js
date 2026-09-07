import { randomUUID } from 'node:crypto';
import { Character } from '../domain/Character.js';
import { DUNGEONS, DungeonRun, RUN_UPGRADES } from '../domain/DungeonRun.js';
import { ItemGenerator } from '../domain/ItemGenerator.js';

function withPlayerId(events, playerId) {
  return events.map((event) => ({ ...event, playerId }));
}

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
      inventory: this.repository.listItems(playerId),
      activeRun: this.repository.getActiveRun(playerId),
      achievements: this.repository.listAchievements(playerId),
      world: this.repository.getWorldState(),
      dungeons: Object.values(DUNGEONS).map(({ id, name, recommendedPlayers }) => ({ id, name, recommendedPlayers })),
      runUpgrades: Object.values(RUN_UPGRADES),
    };
  }

  startDungeon(playerId, dungeonId) {
    if (this.repository.getActiveRun(playerId)) throw new Error('Finish or fail the active run before starting another.');
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const run = DungeonRun.start({ id: this.idFactory(), playerId, dungeonId, playerMaxHealth: player.maxHealth });
    this.repository.createRun(run.toJSON());
    this.eventBus.publish({ type: 'DungeonStarted', playerId, runId: run.state.id, dungeonId });
    return run.toJSON();
  }

  attack(playerId, runId) {
    const runState = this.repository.getRun(runId);
    if (!runState || runState.playerId !== playerId) throw new Error('Run not found.');
    const player = this.repository.getPlayer(playerId);
    const equipped = player.equippedItemId ? this.repository.getItem(player.equippedItemId) : null;
    const character = new Character({ ...player, equippedItem: equipped });
    const run = new DungeonRun(runState);
    const outcome = run.attack({ attackPower: character.attackPower, equipmentEffect: equipped?.effectCode ?? 'none' });
    this.repository.saveRun(outcome.state);
    this.eventBus.publishAll(withPlayerId(outcome.events, playerId));

    let reward = null;
    if (outcome.state.phase === 'complete' && !outcome.state.rewardItemId) {
      reward = this.itemGenerator.generateReward({ source: outcome.state.dungeonId });
      this.repository.addItem(playerId, reward);
      this.repository.addThreadDust(playerId, 15);
      this.repository.incrementWorldProgress('arc-1-frayed-hollow-clears', 1);
      run.markReward(reward.id);
      this.repository.saveRun(run.toJSON());
      this.eventBus.publish({ type: 'ItemGenerated', playerId, itemId: reward.id, source: outcome.state.dungeonId });
      outcome.state = run.toJSON();
    }
    return { ...outcome, reward };
  }

  chooseUpgrade(playerId, runId, upgradeId) {
    const runState = this.repository.getRun(runId);
    if (!runState || runState.playerId !== playerId) throw new Error('Run not found.');
    const run = new DungeonRun(runState);
    const outcome = run.chooseUpgrade(upgradeId);
    this.repository.saveRun(outcome.state);
    this.eventBus.publishAll(withPlayerId(outcome.events, playerId));
    return outcome.state;
  }

  equipItem(playerId, itemId) {
    const item = this.repository.getItem(itemId);
    if (!item || item.playerId !== playerId) throw new Error('Item not found.');
    this.repository.equipItem(playerId, itemId);
    this.eventBus.publish({ type: 'ItemEquipped', playerId, itemId });
    return this.dashboard(playerId);
  }
}
