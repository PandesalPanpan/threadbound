import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/application/EventBus.js';
import { InventoryService } from '../src/application/InventoryService.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { SQLiteInventoryRepository } from '../src/infrastructure/SQLiteInventoryRepository.js';

function item(id, rarity = 'rare', attackBonus = 6) {
  return {
    id,
    definitionId: `def-${id}`,
    name: `Relic ${id}`,
    slot: 'weapon',
    rarity,
    attackBonus,
    effectCode: 'none',
    effect: { name: 'Plain Weave', description: 'No special effect.' },
    source: 'test',
  };
}

test('salvaging unequipped gear atomically removes it and grants Thread Dust', () => {
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'p1' });
  const player = gameRepository.getOrCreatePlayer({ threadedUserId: 'u1', displayName: 'Weaver' });
  gameRepository.addItem(player.id, item('keep', 'common', 2));
  gameRepository.addItem(player.id, item('scrap', 'rare', 6));
  gameRepository.equipItem(player.id, 'keep');

  const events = [];
  const eventBus = new EventBus();
  eventBus.subscribe((event) => events.push(event));
  const service = new InventoryService({
    inventoryRepository: new SQLiteInventoryRepository({ database: gameRepository.db }),
    gameRepository,
    eventBus,
  });

  const result = service.salvage(player.id, 'scrap');
  assert.equal(result.salvaged.threadDust, 15);
  assert.equal(gameRepository.getItem('scrap'), null);
  assert.equal(gameRepository.getPlayer(player.id).threadDust, 15);
  assert.deepEqual(events.at(-1), {
    type: 'ItemSalvaged', playerId: player.id, itemId: 'scrap', itemName: 'Relic scrap', rarity: 'rare', threadDust: 15,
  });
  gameRepository.close();
});

test('equipped gear is protected from accidental salvage', () => {
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'p1' });
  const player = gameRepository.getOrCreatePlayer({ threadedUserId: 'u1', displayName: 'Weaver' });
  gameRepository.addItem(player.id, item('equipped'));
  gameRepository.equipItem(player.id, 'equipped');
  const service = new InventoryService({
    inventoryRepository: new SQLiteInventoryRepository({ database: gameRepository.db }),
    gameRepository,
    eventBus: new EventBus(),
  });

  assert.throws(() => service.salvage(player.id, 'equipped'), (error) => error.code === 'equipped_item_cannot_be_salvaged');
  assert.ok(gameRepository.getItem('equipped'));
  assert.equal(gameRepository.getPlayer(player.id).threadDust, 0);
  gameRepository.close();
});
