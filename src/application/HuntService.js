import { Character } from '../domain/Character.js';
import { ITEM_EFFECTS, ItemGenerator } from '../domain/ItemGenerator.js';
import { resolveHunt } from '../domain/HuntEncounter.js';

const RARITY_TIERS = Object.freeze({ common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 });

function capHuntDrop(item) {
  const tier = Number(item.rarityTier || RARITY_TIERS[item.rarity] || 1);
  if (tier <= 3) return item;
  return {
    ...item,
    rarity: 'rare',
    rarityTier: 3,
    attackBonus: Math.min(4, Math.max(3, Number(item.attackBonus || 3))),
    effectCode: item.effectCode || 'none',
    effect: item.effect || { ...ITEM_EFFECTS.none, upgradeLevel: 0, attunementCode: null },
  };
}

/**
 * Application service for the short-form progression loop. Hunts deliberately do
 * not create a persisted DungeonRun: one command resolves one small encounter.
 */
export class HuntService {
  constructor({ repository, eventBus, itemGenerator = new ItemGenerator(), rng = Math.random }) {
    this.repository = repository;
    this.eventBus = eventBus;
    this.itemGenerator = itemGenerator;
    this.rng = rng;
  }

  hunt(playerId) {
    if (this.repository.getActiveRun(playerId)) {
      const error = new Error('Finish the active dungeon before hunting again.');
      error.code = 'hunt_during_dungeon';
      throw error;
    }

    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const equipped = player.equippedItemId ? this.repository.getItem(player.equippedItemId) : null;
    const character = new Character({ ...player, equippedItem: equipped });
    if (player.currentHealth <= 0) {
      const error = new Error('You are too wounded to Hunt. Use a health potion or wait for out-of-combat recovery.');
      error.code = 'too_wounded_to_hunt';
      throw error;
    }
    const result = resolveHunt({
      attackPower: character.attackPower,
      maxHealth: character.maxHealth,
      currentHealth: player.currentHealth,
      enemyRoll: this.rng(),
    });

    let item = null;
    let healthPotionsFound = 0;
    if (result.victory) {
      // SQLite still stores this balance in the legacy thread_dust column during migration.
      this.repository.addThreadDust(playerId, result.gold);
      if (this.rng() < result.dropChance) {
        item = capHuntDrop(this.itemGenerator.generateReward({ source: 'hunt' }));
        this.repository.addItem(playerId, item);
      }
      if (this.rng() < 0.2) {
        healthPotionsFound = 1;
        this.repository.addHealthPotions(playerId, 1);
      }
    }
    this.repository.setPlayerHealth(playerId, result.remainingHp);

    this.eventBus.publish({
      type: 'HuntResolved',
      playerId,
      enemyId: result.enemy.id,
      enemyName: result.enemy.name,
      enemyHp: result.enemy.hp,
      attackPower: result.attackPower,
      attacksRequired: result.attacksRequired,
      damageTaken: result.damageTaken,
      remainingHp: result.remainingHp,
      maxHp: result.maxHealth,
      victory: result.victory,
      gold: result.gold,
      // Preserve the old event field until legacy consumers are migrated.
      threadDust: result.gold,
      itemId: item?.id || null,
      itemName: item?.name || null,
      itemRarity: item?.rarity || null,
      itemAttackBonus: item?.attackBonus || 0,
      healthPotionsFound,
    });
    if (item) this.eventBus.publish({ type: 'ItemGenerated', playerId, itemId: item.id, source: 'hunt', silentStream: true });

    const refreshed = this.repository.getPlayer(playerId) || player;
    const gold = Number(refreshed.gold ?? refreshed.threadDust ?? character.gold ?? 0);
    return {
      ...result,
      item: item ? this.repository.getItem(item.id) : null,
      character: {
        attackPower: character.attackPower,
        maxHealth: character.maxHealth,
        currentHealth: result.remainingHp,
        healthPotions: refreshed.healthPotions ?? player.healthPotions,
        gold,
        // Backward-compatible API alias while clients migrate to gold.
        threadDust: gold,
      },
    };
  }

  useHealthPotion(playerId) {
    if (this.repository.getActiveRun(playerId)) {
      const error = new Error('Health potions can only be used outside a dungeon.');
      error.code = 'potion_during_dungeon';
      throw error;
    }
    const recoveredPlayer = this.repository.getPlayer(playerId);
    this.repository.setPlayerHealth(playerId, recoveredPlayer.currentHealth);
    const recovery = this.repository.useHealthPotion(playerId);
    this.eventBus.publish({ type: 'HealthPotionUsed', playerId, ...recovery });
    return recovery;
  }
}
