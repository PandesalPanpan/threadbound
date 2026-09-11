import { SHOP_OFFERS, SHOP_VENDOR, shopOffer } from '../content/ShopCatalog.js';

export class ShopService {
  constructor({ repository, eventBus }) {
    this.repository = repository;
    this.eventBus = eventBus;
  }

  browse(playerId) {
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const available = !this.repository.getActiveRun(playerId);
    return {
      vendor: SHOP_VENDOR,
      currency: {
        code: 'thread_dust',
        label: 'Thread Dust',
        balance: player.threadDust,
      },
      available,
      unavailableReason: available ? null : 'Finish the active dungeon before visiting the shop.',
      offers: SHOP_OFFERS.map((offer) => ({
        ...offer,
        affordable: player.threadDust >= offer.cost,
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

    const result = this.repository.buyHealthPotion(playerId, {
      cost: offer.cost,
      quantity: offer.quantity,
    });
    const purchase = { sku: offer.sku, ...result };
    this.eventBus.publish({
      type: 'HealthPotionPurchased',
      playerId,
      offerName: offer.name,
      ...purchase,
    });
    return purchase;
  }
}
