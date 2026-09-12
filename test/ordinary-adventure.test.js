import test from 'node:test';
import assert from 'node:assert/strict';
import { AdventureService } from '../src/application/AdventureService.js';
import { resolveOrdinaryAdventure } from '../src/domain/AdventureEncounter.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function baselinePlayer(overrides = {}) {
  return {
    id: 'player-1',
    name: 'Adventurer',
    displayName: 'Adventurer',
    attack: 10,
    defense: 2,
    maxHp: 40,
    speed: 10,
    critChance: 0,
    equipment: {},
    ...overrides,
  };
}

test('ordinary Adventure resolves through the shared automatic battle engine using the Area encounter snapshot', () => {
  const result = resolveOrdinaryAdventure({
    player: baselinePlayer(),
    currentHealth: 40,
    areaNumber: 1,
    encounterRoll: 0,
    random: () => 0.99,
  });

  assert.equal(result.areaNumber, 1);
  assert.equal(result.enemy.id, 'thread-wolf');
  assert.equal(result.enemy.hp, 24);
  assert.equal(result.battle.context.activity, 'adventure');
  assert.equal(result.battle.context.areaNumber, 1);
  assert.ok(result.battle.turns.length > 0);
  assert.equal(typeof result.victory, 'boolean');
  assert.ok(result.remainingHp >= 0 && result.remainingHp <= 40);
});

test('ordinary Adventure fails closed when the current Area has no configured encounter', () => {
  assert.throws(
    () => resolveOrdinaryAdventure({
      player: baselinePlayer(),
      currentHealth: 40,
      areaNumber: 2,
      random: () => 0.99,
    }),
    (error) => error.code === 'adventure_unavailable_in_area',
  );
});

test('AdventureService reads persisted current Area, mutates authoritative HP, and publishes one AdventureResolved receipt fact', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-1' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'adventure-user', displayName: 'Adventurer' });
  const events = [];
  const service = new AdventureService({
    repository,
    eventBus: { publish: (event) => events.push(event) },
    rng: () => 0.99,
  });

  const before = repository.getPlayer(player.id).currentHealth;
  const result = service.adventure(player.id);
  const after = repository.getPlayer(player.id).currentHealth;

  assert.equal(result.area.id, 'area-1');
  assert.equal(result.enemy.id, 'thread-wolf');
  assert.equal(after, result.remainingHp);
  assert.ok(after <= before);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], assert.match({
    type: 'AdventureResolved',
    playerId: player.id,
    areaId: 'area-1',
    areaNumber: 1,
    enemyId: 'thread-wolf',
    gold: 0,
    experienceGained: 0,
  }));
});

test('AdventureService refuses ordinary Adventure while a dungeon is active or the player is wounded to zero', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-1' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'blocked-adventure-user', displayName: 'Adventurer' });
  const service = new AdventureService({ repository, eventBus: { publish() {} }, rng: () => 0.99 });

  repository.setPlayerHealth(player.id, 0);
  assert.throws(() => service.adventure(player.id), (error) => error.code === 'too_wounded_to_adventure');
});
