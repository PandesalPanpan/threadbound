const SALVAGE_BY_RARITY = Object.freeze({
  common: 4,
  uncommon: 7,
  rare: 12,
  epic: 20,
  legendary: 32,
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
    this.eventBus.publish({ type: 'ItemSalvaged', playerId, itemId, itemName: item.name, rarity: item.rarity, threadDust });
    return { salvaged, dashboard: null };
  }
}

export { SALVAGE_BY_RARITY };
