import { assertEquipmentSellable, equipmentSellValue } from '../domain/EquipmentSellPolicy.js';
import { planRelicUpgrade } from '../domain/RelicProgressionPolicy.js';

export class InventoryService {
  constructor({ inventoryRepository, gameRepository, eventBus }) {
    this.inventoryRepository = inventoryRepository;
    this.gameRepository = gameRepository;
    this.eventBus = eventBus;
  }

  sell(playerId, itemId) {
    if (this.gameRepository.getActiveRun(playerId)) {
      const error = new Error('Finish the active dungeon before selling equipment.');
      error.code = 'item_sell_during_run';
      throw error;
    }
    const item = this.gameRepository.getItem(itemId);
    if (!item || item.playerId !== playerId) throw new Error('Item not found.');
    assertEquipmentSellable(item);
    const gold = equipmentSellValue(item);
    const sold = this.inventoryRepository.sellItem({ playerId, itemId, gold });
    this.eventBus.publish({
      type: 'ItemSold',
      playerId,
      itemId,
      itemName: item.name,
      rarity: item.rarity,
      gold,
    });
    return {
      sold,
      gold,
      goldEarned: gold,
      // Migration aliases for older callers while /salvage is retired.
      salvaged: sold,
      threadDust: gold,
      dashboard: null,
    };
  }

  salvage(playerId, itemId) {
    return this.sell(playerId, itemId);
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
