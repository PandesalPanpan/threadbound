import test from 'node:test';
import assert from 'node:assert/strict';
import { ShopService } from '../src/application/ShopService.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function setup() {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-1' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'threaded-1', displayName: 'Test Weaver' });
  const events = [];
  const service = new ShopService({ repository, eventBus: { publish: (event) => events.push(event) } });
  return { repository, player, service, events };
}

test('shop browse projects the server-owned catalog with current affordability', () => {
  const { repository, player, service } = setup();
  repository.addThreadDust(player.id, 7);

  const shop = service.browse(player.id);

  assert.equal(shop.vendor.name, 'Mara');
  assert.equal(shop.currency.balance, 7);
  assert.deepEqual(shop.offers.map(({ sku, cost, quantity, affordable }) => ({ sku, cost, quantity, affordable })), [
    { sku: 'single', cost: 5, quantity: 1, affordable: true },
    { sku: 'satchel', cost: 12, quantity: 3, affordable: false },
  ]);
});

test('shop purchases use catalog price and grant definitions atomically', () => {
  const { repository, player, service, events } = setup();
  repository.addThreadDust(player.id, 12);

  const purchase = service.purchase(player.id, 'satchel');

  assert.deepEqual(purchase, { sku: 'satchel', cost: 12, quantity: 3, threadDust: 0, healthPotions: 4 });
  assert.equal(repository.getPlayer(player.id).healthPotions, 4);
  assert.equal(events.at(-1).type, 'HealthPotionPurchased');
  assert.equal(events.at(-1).offerName, 'Potion satchel');
});

test('shop rejects unknown SKUs instead of falling back to a default price', () => {
  const { player, service } = setup();

  assert.throws(() => service.purchase(player.id, 'not-real'), (error) => error.code === 'shop_offer_not_found');
});

test('shop purchase still enforces insufficient Thread Dust in the repository transaction', () => {
  const { player, service } = setup();

  assert.throws(() => service.purchase(player.id, 'single'), (error) => error.code === 'insufficient_thread_dust');
});
