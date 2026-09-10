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
    const result = resolveHunt({
      attackPower: character.attackPower,
      maxHealth: character.maxHealth,
      enemyRoll: this.rng(),
    });

    let item = null;
    if (result.victory) {
      this.repository.addThreadDust(playerId, result.threadDust);
      if (this.rng() < result.dropChance) {
        item = capHuntDrop(this.itemGenerator.generateReward({ source: 'hunt' }));
        this.repository.addItem(playerId, item);
      }
    }

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
      threadDust: result.threadDust,
      itemId: item?.id || null,
      itemName: item?.name || null,
      itemRarity: item?.rarity || null,
      itemAttackBonus: item?.attackBonus || 0,
    });
    if (item) this.eventBus.publish({ type: 'ItemGenerated', playerId, itemId: item.id, source: 'hunt', silentStream: true });

    return {
      ...result,
      item: item ? this.repository.getItem(item.id) : null,
      character: {
        attackPower: character.attackPower,
        maxHealth: character.maxHealth,
        threadDust: this.repository.getPlayer(playerId)?.threadDust ?? player.threadDust,
      },
    };
  }
}
