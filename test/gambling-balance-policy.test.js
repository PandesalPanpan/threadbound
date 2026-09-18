import test from 'node:test';
import assert from 'node:assert/strict';
import { BlackjackService } from '../src/application/BlackjackService.js';
import { CoinflipService } from '../src/application/CoinflipService.js';
import { SlotsService } from '../src/application/SlotsService.js';
import {
  GAMBLING_MAX_WAGER_GOLD,
  GAMBLING_MIN_WAGER_GOLD,
  normalizeGamblingWager,
} from '../src/domain/GamblingBalancePolicy.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function setup() {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'gambling-cap-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'gambling-cap-user', displayName: 'Balance Tester' });
  repository.addThreadDust(player.id, 1000);
  return { repository, player };
}

test('shared gambling balance policy accepts every whole Gold wager from one upward', () => {
  assert.equal(normalizeGamblingWager(GAMBLING_MIN_WAGER_GOLD), 1);
  assert.equal(GAMBLING_MAX_WAGER_GOLD, null);
  assert.equal(normalizeGamblingWager(101), 101);
  assert.equal(normalizeGamblingWager(1000), 1000);
  assert.throws(() => normalizeGamblingWager(0), /at least 1 Gold/);
  assert.throws(() => normalizeGamblingWager(1.5), /whole number of Gold/);
});

test('Blackjack accepts a wager above the removed product cap when carried Gold covers it', () => {
  const { repository, player } = setup();
  try {
    const service = new BlackjackService({
      repository,
      idFactory: () => 'blackjack-cap-round',
      deckFactory: () => ['10H', '9S', '7C', '7D', '5H', '10C'],
    });
    const result = service.start(player.id, 101, { idempotencyKey: 'blackjack-cap-0001' });
    assert.equal(result.round.wager, 101);
    assert.equal(repository.getPlayer(player.id).threadDust, 899);
  } finally {
    repository.close();
  }
});

test('Coinflip accepts a wager above the removed product cap when carried Gold covers it', () => {
  const { repository, player } = setup();
  try {
    const service = new CoinflipService({ repository, random: () => 0.1, idFactory: () => 'coinflip-cap-round' });
    const result = service.flip(player.id, 101, 'heads', { idempotencyKey: 'coinflip-cap-0001' });
    assert.equal(result.flip.wager, 101);
    assert.equal(repository.getPlayer(player.id).threadDust, 1101);
  } finally {
    repository.close();
  }
});

test('Slots accepts a wager above the removed product cap when carried Gold covers it', () => {
  const { repository, player } = setup();
  try {
    const service = new SlotsService({ repository, random: () => 0.99, idFactory: () => 'slots-cap-spin' });
    const result = service.spin(player.id, 101, { idempotencyKey: 'slots-cap-0001' });
    assert.equal(result.spin.wager, 101);
    assert.equal(repository.getPlayer(player.id).threadDust, result.carriedGold);
    assert.notEqual(result.carriedGold, 1000);
  } finally {
    repository.close();
  }
});

test('each Gold game enforces the current carried balance atomically', () => {
  const cases = [
    ['Blackjack', BlackjackService, 'insufficient_blackjack_gold', (service, player) => service.start(player.id, 1001, { idempotencyKey: 'blackjack-balance-0001' })],
    ['Coinflip', CoinflipService, 'insufficient_coinflip_gold', (service, player) => service.flip(player.id, 1001, 'heads', { idempotencyKey: 'coinflip-balance-0001' })],
    ['Slots', SlotsService, 'insufficient_slots_gold', (service, player) => service.spin(player.id, 1001, { idempotencyKey: 'slots-balance-0001' })],
  ];
  for (const [name, Service, code, play] of cases) {
    const { repository, player } = setup();
    try {
      const service = new Service({ repository, random: () => 0.1, deckFactory: name === 'Blackjack' ? () => ['10H', '9S', '7C', '7D', '5H', '10C'] : undefined });
      assert.throws(() => play(service, player), (error) => error.code === code);
      assert.equal(repository.getPlayer(player.id).threadDust, 1000);
    } finally {
      repository.close();
    }
  }
});
