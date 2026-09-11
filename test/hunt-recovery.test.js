import test from 'node:test';
import assert from 'node:assert/strict';
import { HuntService } from '../src/application/HuntService.js';
import { ItemGenerator } from '../src/domain/ItemGenerator.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function setup(rngValues = []) {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-1' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'threaded-1', displayName: 'Test Weaver' });
  const events = [];
  let index = 0;
  const service = new HuntService({
    repository,
    eventBus: { publish: (event) => events.push(event) },
    rng: () => rngValues[index++] ?? 0.99,
  });
  return { repository, player, service, events };
}

test('Hunt damage persists across encounters instead of resetting to maximum health', () => {
  const { repository, player, service } = setup([0.99, 0.99, 0.99, 0.99, 0.99, 0.99]);
  const first = service.hunt(player.id);
  const second = service.hunt(player.id);

  assert.equal(first.startingHp, 40);
  assert.equal(first.remainingHp, 32);
  assert.equal(second.startingHp, 32);
  assert.equal(second.remainingHp, 24);
  assert.equal(repository.getPlayer(player.id).currentHealth, 24);
});

test('health potions atomically heal persistent Hunt HP and decrement inventory', () => {
  const { repository, player, service, events } = setup();
  repository.setPlayerHealth(player.id, 25);

  const recovery = service.useHealthPotion(player.id);

  assert.deepEqual(recovery, { healed: 12, currentHealth: 37, maxHealth: 40, healthPotions: 0 });
  assert.equal(repository.getPlayer(player.id).currentHealth, 37);
  assert.equal(events.at(-1).type, 'HealthPotionUsed');
  assert.throws(() => service.useHealthPotion(player.id), (error) => error.code === 'no_health_potions');
});

test('out-of-combat health regenerates lazily at one HP per minute', () => {
  const { repository, player } = setup();
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60000 - 1000).toISOString();
  repository.setPlayerHealth(player.id, 20, fiveMinutesAgo);

  assert.equal(repository.getPlayer(player.id).currentHealth, 25);
});

test('the recovery shop exchanges Dust for potions atomically', () => {
  const { repository, player, service } = setup();
  repository.addThreadDust(player.id, 5);

  const purchase = service.buyHealthPotion(player.id);

  assert.deepEqual(purchase, { cost: 5, threadDust: 0, healthPotions: 2 });
  assert.equal(repository.getPlayer(player.id).healthPotions, 2);
  assert.throws(() => service.buyHealthPotion(player.id), (error) => error.code === 'insufficient_thread_dust');
});

test('generated weapon identity keeps a semantic visual asset through persistence', () => {
  const { repository, player } = setup();
  const item = new ItemGenerator({ rng: () => 0, idFactory: () => 'gear-1' }).generateReward({ source: 'hunt' });
  repository.addItem(player.id, item);

  assert.equal(item.name.includes('Needle'), true);
  assert.equal(repository.getItem(item.id).visualAssetId, 'item.steel-dagger.v1');
});
