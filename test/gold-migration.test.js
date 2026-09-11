import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../src/domain/Character.js';
import { GameService } from '../src/application/GameService.js';
import { HuntService } from '../src/application/HuntService.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

test('Character exposes persisted legacy threadDust as canonical Gold', () => {
  const legacy = new Character({ id: 'p1', threadedUserId: 'u1', displayName: 'Adventurer', threadDust: 27 });
  assert.equal(legacy.gold, 27);
  assert.equal(legacy.threadDust, 27);

  const canonical = new Character({ id: 'p2', threadedUserId: 'u2', displayName: 'Adventurer', gold: 41, threadDust: 5 });
  assert.equal(canonical.gold, 41);
  assert.equal(canonical.threadDust, 41, 'legacy alias follows canonical Gold when both are supplied');
});

test('dashboard exposes canonical Gold while preserving the legacy threadDust alias', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-dashboard' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'u-dashboard', displayName: 'Adventurer' });
  repository.addThreadDust(player.id, 19);
  const service = new GameService({ repository, eventBus: { publish() {}, publishAll() {} } });

  const dashboard = service.dashboard(player.id);

  assert.equal(dashboard.character.gold, 19);
  assert.equal(dashboard.character.threadDust, 19);
  repository.close();
});

test('Hunt persists into the legacy column but returns and publishes Gold', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-1' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'u1', displayName: 'Adventurer' });
  const events = [];
  const service = new HuntService({
    repository,
    eventBus: { publish: (event) => events.push(event) },
    rng: () => 0.99,
  });

  const result = service.hunt(player.id);
  const stored = repository.getPlayer(player.id);
  const huntEvent = events.find((event) => event.type === 'HuntResolved');

  assert.equal(result.gold, 3);
  assert.equal(result.threadDust, 3, 'legacy result alias stays readable');
  assert.equal(result.character.gold, 3);
  assert.equal(result.character.threadDust, 3);
  assert.equal(stored.threadDust, 3, 'existing thread_dust persistence remains authoritative during migration');
  assert.equal(huntEvent.gold, 3);
  assert.equal(huntEvent.threadDust, 3, 'legacy stream metadata alias stays readable');

  repository.close();
});
