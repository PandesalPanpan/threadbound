import test from 'node:test';
import assert from 'node:assert/strict';
import { HuntService } from '../src/application/HuntService.js';
import { projectHuntReceipt } from '../src/application/HuntReceiptReadModel.js';
import { HUNT_COOLDOWN_SECONDS, projectHuntCooldown } from '../src/domain/HuntCooldownPolicy.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { SQLiteHuntCooldownRepository } from '../src/infrastructure/SQLiteHuntCooldownRepository.js';

test('Hunt cooldown projection exposes an exact next-ready time and rounded seconds', () => {
  const projection = projectHuntCooldown({
    now: '2026-09-12T10:00:00.250Z',
    readyAt: '2026-09-12T10:00:15.000Z',
  });
  assert.deepEqual(projection, {
    ready: false,
    nextReadyAt: '2026-09-12T10:00:15.000Z',
    remainingSeconds: 15,
  });
});

test('SQLite Hunt cooldown claim is authoritative and survives a new repository instance', () => {
  const game = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'cooldown-player' });
  const player = game.getOrCreatePlayer({ threadedUserId: 'cooldown-user', displayName: 'Cooldown Adventurer' });
  const firstRepository = new SQLiteHuntCooldownRepository({ database: game.db });
  const first = firstRepository.claim(player.id, { now: '2026-09-12T10:00:00.000Z', cooldownSeconds: 15 });
  const secondRepository = new SQLiteHuntCooldownRepository({ database: game.db });
  const blocked = secondRepository.claim(player.id, { now: '2026-09-12T10:00:05.000Z', cooldownSeconds: 15 });
  const ready = secondRepository.claim(player.id, { now: '2026-09-12T10:00:15.000Z', cooldownSeconds: 15 });

  assert.equal(first.claimed, true);
  assert.equal(first.nextReadyAt, '2026-09-12T10:00:15.000Z');
  assert.equal(blocked.claimed, false);
  assert.equal(blocked.remainingSeconds, 10);
  assert.equal(ready.claimed, true);
  game.close();
});

test('HuntService blocks an early repeat before combat/rewards and projects next-ready on success', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'hunt-cooldown-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'hunt-cooldown-user', displayName: 'Adventurer' });
  const events = [];
  let now = new Date('2026-09-12T10:00:00.000Z');
  const service = new HuntService({
    repository,
    eventBus: { publish: (event) => events.push(event) },
    rng: () => 0.99,
    now: () => new Date(now),
    huntCooldownSeconds: HUNT_COOLDOWN_SECONDS,
  });

  const first = service.hunt(player.id);
  const afterFirst = repository.getPlayer(player.id);
  assert.equal(first.cooldown.nextReadyAt, '2026-09-12T10:00:15.000Z');
  assert.equal(events.find((event) => event.type === 'HuntResolved').nextHuntReadyAt, first.cooldown.nextReadyAt);

  now = new Date('2026-09-12T10:00:05.000Z');
  assert.throws(() => service.hunt(player.id), (error) => {
    assert.equal(error.code, 'hunt_cooldown');
    assert.equal(error.nextReadyAt, '2026-09-12T10:00:15.000Z');
    assert.equal(error.remainingSeconds, 10);
    return true;
  });
  const afterBlocked = repository.getPlayer(player.id);
  assert.equal(afterBlocked.threadDust, afterFirst.threadDust, 'blocked Hunt must not grant Gold');
  assert.equal(afterBlocked.currentHealth, afterFirst.currentHealth, 'blocked Hunt must not mutate HP');

  now = new Date('2026-09-12T10:00:15.000Z');
  const second = service.hunt(player.id);
  assert.equal(second.cooldown.nextReadyAt, '2026-09-12T10:00:30.000Z');
  repository.close();
});

test('Hunt receipt carries server-projected next-ready time without deciding cooldown legality', () => {
  const receipt = projectHuntReceipt({
    type: 'HuntResolved',
    victory: true,
    enemyName: 'Forest Wolf',
    damageTaken: 2,
    remainingHp: 38,
    maxHp: 40,
    gold: 4,
    experienceGained: 5,
    nextHuntReadyAt: '2026-09-12T10:00:15.000Z',
    huntCooldownSeconds: 15,
  });

  assert.deepEqual(receipt.cooldown, {
    nextReadyAt: '2026-09-12T10:00:15.000Z',
    cooldownSeconds: 15,
  });
  assert.match(receipt.text, /Next Hunt — 2026-09-12T10:00:15.000Z/);
});
