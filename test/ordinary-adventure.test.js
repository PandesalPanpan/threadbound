import test from 'node:test';
import assert from 'node:assert/strict';
import { AdventureService } from '../src/application/AdventureService.js';
import { ADVENTURE_COOLDOWN_SECONDS, resolveAdventureRewards } from '../src/domain/AdventureRewardPolicy.js';
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

test('Adventure reward policy is more rewarding than Area 1 Hunt and projects constrained story/drop outcomes', () => {
  const reward = resolveAdventureRewards({ areaNumber: 1, victory: true, lootRoll: 0, storyRoll: 0 });
  assert.equal(reward.gold, 6);
  assert.equal(reward.experience, 30);
  assert.equal(reward.drop, true);
  assert.equal(reward.storyEvent.id, 'area-trail-signs');

  const defeat = resolveAdventureRewards({ areaNumber: 1, victory: false, lootRoll: 0, storyRoll: 0 });
  assert.deepEqual(defeat, { gold: 0, experience: 0, drop: false, storyEvent: null, dropChance: 0 });
});

test('AdventureService reads persisted Area, commits rewards/progression, and publishes authoritative cooldown projection', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-1' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'adventure-user', displayName: 'Adventurer' });
  const events = [];
  const now = new Date('2026-09-13T00:00:00.000Z');
  const service = new AdventureService({
    repository,
    eventBus: { publish: (event) => events.push(event) },
    rng: () => 0.99,
    rewardRng: () => 0.99,
    storyRng: () => 0.99,
    now: () => now,
  });

  const before = repository.getPlayer(player.id).currentHealth;
  const result = service.adventure(player.id);
  const after = repository.getPlayer(player.id).currentHealth;

  assert.equal(result.area.id, 'area-1');
  assert.equal(result.enemy.id, 'thread-wolf');
  assert.equal(after, result.remainingHp);
  assert.ok(after <= before);
  assert.equal(result.rewards.gold, result.victory ? 6 : 0);
  assert.equal(result.rewards.experience, result.victory ? 30 : 0);
  assert.equal(result.cooldown.remainingSeconds, ADVENTURE_COOLDOWN_SECONDS);
  assert.equal(result.cooldown.nextReadyAt, '2026-09-13T00:00:45.000Z');

  const receiptEvent = events.find((event) => event.type === 'AdventureResolved');
  assert.ok(receiptEvent);
  assert.equal(receiptEvent.playerId, player.id);
  assert.equal(receiptEvent.areaId, 'area-1');
  assert.equal(receiptEvent.areaNumber, 1);
  assert.equal(receiptEvent.enemyId, 'thread-wolf');
  assert.equal(receiptEvent.gold, result.victory ? 6 : 0);
  assert.equal(receiptEvent.experienceGained, result.victory ? 30 : 0);
  assert.equal(receiptEvent.nextAdventureReadyAt, '2026-09-13T00:00:45.000Z');
});

test('Adventure cooldown rejects immediate repeats with exact server next-ready projection', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-1' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'cooldown-adventure-user', displayName: 'Adventurer' });
  const service = new AdventureService({
    repository,
    eventBus: { publish() {} },
    rng: () => 0.99,
    rewardRng: () => 0.99,
    storyRng: () => 0.99,
    now: () => new Date('2026-09-13T00:00:00.000Z'),
  });

  service.adventure(player.id);
  assert.throws(
    () => service.adventure(player.id),
    (error) => error.code === 'adventure_cooldown'
      && error.remainingSeconds === ADVENTURE_COOLDOWN_SECONDS
      && error.nextReadyAt === '2026-09-13T00:00:45.000Z',
  );
});

test('AdventureService refuses ordinary Adventure while the player is wounded to zero', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-1' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'blocked-adventure-user', displayName: 'Adventurer' });
  const service = new AdventureService({ repository, eventBus: { publish() {} }, rng: () => 0.99 });

  repository.setPlayerHealth(player.id, 0);
  assert.throws(() => service.adventure(player.id), (error) => error.code === 'too_wounded_to_adventure');
});
