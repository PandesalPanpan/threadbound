import test from 'node:test';
import assert from 'node:assert/strict';
import { ShopService } from '../src/application/ShopService.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function setup() {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-1' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'threaded-1', displayName: 'Test Adventurer' });
  const events = [];
  let itemSequence = 0;
  const service = new ShopService({
    repository,
    eventBus: { publish: (event) => events.push(event) },
    idFactory: () => `shop-item-${++itemSequence}`,
  });
  return { repository, player, service, events };
}

test('shop browse projects server-owned equipment and potion stock in Gold with affordability', () => {
  const { repository, player, service } = setup();
  repository.addThreadDust(player.id, 7);

  const shop = service.browse(player.id);

  assert.equal(shop.vendor.name, 'Mara');
  assert.deepEqual(shop.currency, { code: 'gold', label: 'Gold', balance: 7 });
  assert.deepEqual(shop.offers.map(({ sku, kind, cost, affordable }) => ({ sku, kind, cost, affordable })), [
    { sku: 'bronze-sword', kind: 'equipment', cost: 18, affordable: false },
    { sku: 'single', kind: 'health_potion', cost: 5, affordable: true },
    { sku: 'satchel', kind: 'health_potion', cost: 12, affordable: false },
  ]);
  assert.equal(shop.offers[0].visualAssetId, 'item.steel-sword.v1');
  assert.equal('itemTemplate' in shop.offers[0], false, 'private item construction data is not projected to the browser');
});

test('shop potion purchases use catalog price and preserve legacy balance storage atomically', () => {
  const { repository, player, service, events } = setup();
  repository.addThreadDust(player.id, 12);

  const purchase = service.purchase(player.id, 'satchel');

  assert.equal(purchase.kind, 'health_potion');
  assert.equal(purchase.sku, 'satchel');
  assert.equal(purchase.cost, 12);
  assert.equal(purchase.quantity, 3);
  assert.equal(purchase.gold, 0);
  assert.equal(purchase.threadDust, 0);
  assert.equal(repository.getPlayer(player.id).healthPotions, 4);
  assert.equal(repository.getPlayer(player.id).threadDust, 0);
  assert.equal(events.at(-1).type, 'HealthPotionPurchased');
  assert.equal(events.at(-1).offerName, 'Potion Satchel');
});

test('shop equipment purchase atomically spends Gold and persists a normal owned item', () => {
  const { repository, player, service, events } = setup();
  repository.addThreadDust(player.id, 20);

  const purchase = service.purchase(player.id, 'bronze-sword');
  const items = repository.listItems(player.id);

  assert.equal(purchase.kind, 'equipment');
  assert.equal(purchase.cost, 18);
  assert.equal(purchase.gold, 2);
  assert.equal(purchase.item.id, 'shop-item-1');
  assert.equal(items.length, 1);
  assert.equal(items[0].name, 'Bronze Sword');
  assert.equal(items[0].slot, 'weapon');
  assert.equal(items[0].rarity, 'common');
  assert.equal(items[0].visualAssetId, 'item.steel-sword.v1');
  assert.equal(repository.getPlayer(player.id).threadDust, 2);
  assert.equal(events.at(-1).type, 'ShopEquipmentPurchased');
  assert.equal(events.at(-1).itemId, 'shop-item-1');
});

test('failed equipment purchase does not create an item or spend Gold', () => {
  const { repository, player, service } = setup();
  repository.addThreadDust(player.id, 17);

  assert.throws(() => service.purchase(player.id, 'bronze-sword'), (error) => error.code === 'insufficient_gold');
  assert.equal(repository.getPlayer(player.id).threadDust, 17);
  assert.deepEqual(repository.listItems(player.id), []);
});

test('shop rejects unknown SKUs instead of falling back to a default price', () => {
  const { player, service } = setup();

  assert.throws(() => service.purchase(player.id, 'not-real'), (error) => error.code === 'shop_offer_not_found');
});

test('shop translates legacy insufficient potion balance errors into Gold copy', () => {
  const { player, service } = setup();

  assert.throws(() => service.purchase(player.id, 'single'), (error) => {
    assert.equal(error.code, 'insufficient_gold');
    assert.equal(error.legacyCode, 'insufficient_thread_dust');
    assert.match(error.message, /5 Gold/);
    return true;
  });
});
