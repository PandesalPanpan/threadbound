import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/application/EventBus.js';
import { InventoryService } from '../src/application/InventoryService.js';
import { SQLiteEquipmentRepository } from '../src/infrastructure/SQLiteEquipmentRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { SQLiteInventoryRepository } from '../src/infrastructure/SQLiteInventoryRepository.js';

function item(id, { rarity = 'rare', attackBonus = 6, slot = 'weapon', source = 'test', effect = null } = {}) {
  return {
    id,
    definitionId: `def-${id}`,
    name: `Equipment ${id}`,
    slot,
    rarity,
    attackBonus,
    effectCode: 'none',
    effect: effect || { name: 'Plain Weave', description: 'No special effect.' },
    source,
  };
}

function setup() {
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'p1' });
  const player = gameRepository.getOrCreatePlayer({ threadedUserId: 'u1', displayName: 'Adventurer' });
  const events = [];
  const eventBus = new EventBus();
  eventBus.subscribe((event) => events.push(event));
  const inventoryRepository = new SQLiteInventoryRepository({ database: gameRepository.db });
  const equipmentRepository = new SQLiteEquipmentRepository({ database: gameRepository.db });
  const service = new InventoryService({ inventoryRepository, gameRepository, eventBus });
  return { gameRepository, player, events, inventoryRepository, equipmentRepository, service };
}

test('selling unequipped equipment atomically removes it and credits Gold', () => {
  const { gameRepository, player, events, service } = setup();
  gameRepository.addItem(player.id, item('keep', { rarity: 'common', attackBonus: 2 }));
  gameRepository.addItem(player.id, item('sell', { rarity: 'rare', attackBonus: 6 }));
  gameRepository.equipItem(player.id, 'keep');

  const result = service.sell(player.id, 'sell');
  assert.equal(result.sold.goldEarned, 15);
  assert.equal(result.goldEarned, 15);
  assert.equal(result.gold, 15);
  assert.equal(result.threadDust, 15);
  assert.equal(gameRepository.getItem('sell'), null);
  assert.equal(gameRepository.getPlayer(player.id).threadDust, 15);
  assert.deepEqual(events.at(-1), {
    type: 'ItemSold',
    playerId: player.id,
    itemId: 'sell',
    itemName: 'Equipment sell',
    rarity: 'rare',
    gold: 15,
  });
  gameRepository.close();
});

test('Sell repository derives Gold from persisted item state instead of trusting a caller amount', () => {
  const { gameRepository, player, inventoryRepository } = setup();
  gameRepository.addItem(player.id, item('authoritative-value', { rarity: 'uncommon', attackBonus: 4 }));

  const sold = inventoryRepository.sellItem({ playerId: player.id, itemId: 'authoritative-value', gold: 999999 });
  assert.equal(sold.goldEarned, 9);
  assert.equal(gameRepository.getPlayer(player.id).threadDust, 9);
  assert.equal(gameRepository.getItem('authoritative-value'), null);
  gameRepository.close();
});

test('Sell rejects equipment in any canonical loadout slot and does not credit Gold', () => {
  const { gameRepository, player, equipmentRepository, service } = setup();
  gameRepository.addItem(player.id, item('helmet', { slot: 'helmet', attackBonus: 0 }));
  equipmentRepository.equip(player.id, 'helmet');

  assert.throws(() => service.sell(player.id, 'helmet'), (error) => error.code === 'equipped_item_cannot_be_sold');
  assert.ok(gameRepository.getItem('helmet'));
  assert.equal(gameRepository.getPlayer(player.id).threadDust, 0);
  gameRepository.close();
});

test('Sell refuses Honey-purchased and protected equipment without mutating inventory or Gold', () => {
  const { gameRepository, player, service } = setup();
  gameRepository.addItem(player.id, item('honey', { source: 'honey-purchase', rarity: 'common', attackBonus: 1 }));
  gameRepository.addItem(player.id, item('bound', { source: 'quest', effect: { name: 'Bound', protected: true } }));

  assert.throws(() => service.sell(player.id, 'honey'), (error) => error.code === 'honey_item_cannot_be_sold');
  assert.throws(() => service.sell(player.id, 'bound'), (error) => error.code === 'protected_item_cannot_be_sold');
  assert.ok(gameRepository.getItem('honey'));
  assert.ok(gameRepository.getItem('bound'));
  assert.equal(gameRepository.getPlayer(player.id).threadDust, 0);
  gameRepository.close();
});

test('Sell repository rechecks active-run state inside the write transaction', () => {
  const { gameRepository, player, inventoryRepository } = setup();
  gameRepository.addItem(player.id, item('race-item', { rarity: 'common', attackBonus: 2 }));
  gameRepository.createRun({
    id: 'sell-race-run',
    ownerType: 'player',
    ownerId: player.id,
    startedByPlayerId: player.id,
    participants: [{ playerId: player.id }],
    dungeonId: 'sell-race-dungeon',
    phase: 'combat',
    createdAt: '2026-09-13T08:00:00.000Z',
  });

  assert.throws(() => inventoryRepository.sellItem({ playerId: player.id, itemId: 'race-item' }), (error) => error.code === 'item_sell_during_run');
  assert.ok(gameRepository.getItem('race-item'));
  assert.equal(gameRepository.getPlayer(player.id).threadDust, 0);
  gameRepository.close();
});

test('legacy salvage entry point delegates to canonical Sell behavior and response aliases', () => {
  const { gameRepository, player, events, service } = setup();
  gameRepository.addItem(player.id, item('legacy', { rarity: 'uncommon', attackBonus: 2 }));

  const result = service.salvage(player.id, 'legacy');
  assert.equal(result.gold, 8);
  assert.equal(result.salvaged.id, 'legacy');
  assert.equal(result.threadDust, 8);
  assert.equal(events.at(-1).type, 'ItemSold');
  assert.equal(gameRepository.getItem('legacy'), null);
  gameRepository.close();
});
