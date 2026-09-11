import { SHOP_OFFERS, SHOP_VENDOR, shopOffer } from '../content/ShopCatalog.js';

function goldBalance(player) {
  return Math.max(0, Math.floor(Number(player?.gold ?? player?.threadDust ?? 0)) || 0);
}

export class ShopService {
  constructor({ repository, eventBus }) {
    this.repository = repository;
    this.eventBus = eventBus;
  }

  browse(playerId) {
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const available = !this.repository.getActiveRun(playerId);
    const gold = goldBalance(player);
    return {
      vendor: SHOP_VENDOR,
      currency: {
        code: 'gold',
        label: 'Gold',
        balance: gold,
      },
      available,
      unavailableReason: available ? null : 'Finish the active dungeon before visiting the shop.',
      offers: SHOP_OFFERS.map((offer) => ({
        ...offer,
        affordable: gold >= offer.cost,
        available,
      })),
    };
  }

  purchase(playerId, sku) {
    if (this.repository.getActiveRun(playerId)) {
      const error = new Error('The shop is unavailable during a dungeon.');
      error.code = 'shop_during_dungeon';
      throw error;
    }
    const offer = shopOffer(sku);
    if (!offer) {
      const error = new Error('That shop offer is not available.');
      error.code = 'shop_offer_not_found';
      throw error;
    }
    if (offer.kind !== 'health_potion') {
      const error = new Error('That shop offer cannot be purchased yet.');
      error.code = 'unsupported_shop_offer';
      throw error;
    }

    let result;
    try {
      // The repository still persists Gold in the legacy thread_dust column.
      result = this.repository.buyHealthPotion(playerId, {
        cost: offer.cost,
        quantity: offer.quantity,
      });
    } catch (error) {
      if (error?.code !== 'insufficient_thread_dust') throw error;
      const translated = new Error(`You need ${offer.cost} Gold to buy ${offer.name.toLowerCase()}.`);
      translated.code = 'insufficient_gold';
      translated.legacyCode = error.code;
      throw translated;
    }

    const gold = Number(result.gold ?? result.threadDust ?? 0);
    const purchase = {
      sku: offer.sku,
      ...result,
      gold,
      // Compatibility alias for older API consumers.
      threadDust: gold,
    };
    this.eventBus.publish({
      type: 'HealthPotionPurchased',
      playerId,
      offerName: offer.name,
      ...purchase,
    });
    return purchase;
  }
}
