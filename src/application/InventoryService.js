import { planRelicUpgrade } from '../domain/RelicProgressionPolicy.js';

const SALVAGE_BY_RARITY = Object.freeze({
  common: 4,
  uncommon: 7,
  rare: 12,
  epic: 20,
  legendary: 32,
  mythic: 50,
});

export class InventoryService {
  constructor({ inventoryRepository, gameRepository, eventBus }) {
    this.inventoryRepository = inventoryRepository;
    this.gameRepository = gameRepository;
    this.eventBus = eventBus;
  }

  salvage(playerId, itemId) {
    const item = this.gameRepository.getItem(itemId);
    if (!item || item.playerId !== playerId) throw new Error('Item not found.');
    const base = SALVAGE_BY_RARITY[String(item.rarity || '').toLowerCase()] ?? SALVAGE_BY_RARITY.common;
    const threadDust = base + Math.max(0, Math.floor(Number(item.attackBonus || 0) / 2));
    const salvaged = this.inventoryRepository.salvageItem({ playerId, itemId, threadDust });
    this.eventBus.publish({ type: 'ItemSalvaged', playerId, itemId, itemName: item.name, rarity: item.rarity, gold: threadDust, threadDust });
    return { salvaged, gold: threadDust, threadDust, dashboard: null };
  }

  upgrade(playerId, itemId, attunementCode = null) {
    if (this.gameRepository.getActiveRun(playerId)) {
      const error = new Error('Finish the active dungeon before upgrading equipment.');
      error.code = 'relic_upgrade_during_run';
      throw error;
    }
    const item = this.gameRepository.getItem(itemId);
    if (!item || item.playerId !== playerId) throw new Error('Item not found.');
    const plan = planRelicUpgrade(item, attunementCode);
    const result = this.inventoryRepository.upgradeItem({
      playerId,
      itemId,
      expectedLevel: plan.expectedLevel,
      cost: plan.cost,
      attackIncrease: plan.attackIncrease,
      attunementCode: plan.attunementCode,
    });
    const upgraded = this.gameRepository.getItem(itemId);
    this.eventBus.publish({
      type: 'ItemUpgraded',
      playerId,
      itemId,
      itemName: upgraded?.name || item.name,
      level: plan.nextLevel,
      maxLevel: plan.maxLevel,
      attackIncrease: plan.attackIncrease,
      goldSpent: plan.cost,
      // Migration aliases for persisted/event consumers that still use old names.
      threadDustSpent: plan.cost,
      attunementCode: plan.attunementCode,
      attunementName: plan.attunement?.name || null,
    });
    return {
      upgraded,
      upgrade: result,
      // Legacy API alias while older browser/tests migrate.
      temper: result,
      dashboard: null,
    };
  }
}

export { SALVAGE_BY_RARITY };
