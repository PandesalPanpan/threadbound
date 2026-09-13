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

test('shared gambling balance policy accepts only the bounded Gold wager range', () => {
  assert.equal(normalizeGamblingWager(GAMBLING_MIN_WAGER_GOLD), 1);
  assert.equal(normalizeGamblingWager(GAMBLING_MAX_WAGER_GOLD), 100);
  assert.throws(() => normalizeGamblingWager(0), /between 1 and 100 Gold/);
  assert.throws(() => normalizeGamblingWager(101), /between 1 and 100 Gold/);
  assert.throws(() => normalizeGamblingWager(1.5), /whole number of Gold/);
});

test('Blackjack rejects an over-cap wager before mutating carried Gold', () => {
  const { repository, player } = setup();
  try {
    const service = new BlackjackService({
      repository,
      idFactory: () => 'blackjack-cap-round',
      deckFactory: () => ['10H', '9S', '7C', '7D', '5H', '10C'],
    });
    assert.throws(
      () => service.start(player.id, 101, { idempotencyKey: 'blackjack-cap-0001' }),
      (error) => error.code === 'invalid_blackjack_wager' && /between 1 and 100 Gold/.test(error.message),
    );
    assert.equal(repository.getPlayer(player.id).threadDust, 1000);
  } finally {
    repository.close();
  }
});

test('Coinflip rejects an over-cap wager before mutating carried Gold', () => {
  const { repository, player } = setup();
  try {
    const service = new CoinflipService({ repository, random: () => 0.1, idFactory: () => 'coinflip-cap-round' });
    assert.throws(
      () => service.flip(player.id, 101, 'heads', { idempotencyKey: 'coinflip-cap-0001' }),
      (error) => error.code === 'invalid_coinflip_wager' && /between 1 and 100 Gold/.test(error.message),
    );
    assert.equal(repository.getPlayer(player.id).threadDust, 1000);
  } finally {
    repository.close();
  }
});

test('Slots rejects an over-cap wager before mutating carried Gold', () => {
  const { repository, player } = setup();
  try {
    const service = new SlotsService({ repository, random: () => 0.99, idFactory: () => 'slots-cap-spin' });
    assert.throws(
      () => service.spin(player.id, 101, { idempotencyKey: 'slots-cap-0001' }),
      (error) => error.code === 'invalid_slots_wager' && /between 1 and 100 Gold/.test(error.message),
    );
    assert.equal(repository.getPlayer(player.id).threadDust, 1000);
  } finally {
    repository.close();
  }
});
