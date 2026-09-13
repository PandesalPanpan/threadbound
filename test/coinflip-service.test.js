import test from 'node:test';
import assert from 'node:assert/strict';
import { CoinflipService } from '../src/application/CoinflipService.js';
import { SQLiteBankRepository } from '../src/infrastructure/SQLiteBankRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function setup({ random = () => 0.1, flipId = 'coinflip-round-1', gold = 100 } = {}) {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'coinflip-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'coinflip-user', displayName: 'Coinflip Tester' });
  repository.addThreadDust(player.id, gold);
  const service = new CoinflipService({
    repository,
    random,
    idFactory: () => flipId,
  });
  return { repository, player, service };
}

test('Coinflip win settles carried Gold once and replays the same idempotent response', () => {
  const { repository, player, service } = setup({ random: () => 0.1 });
  try {
    const first = service.flip(player.id, 10, 'heads', { idempotencyKey: 'flip-key-0001' });
    assert.equal(first.replayed, false);
    assert.equal(first.currency, 'Gold');
    assert.deepEqual(first.flip, {
      id: 'coinflip-round-1',
      wager: 10,
      currency: 'Gold',
      choice: 'heads',
      result: 'heads',
      outcome: 'win',
      payoutGold: 20,
    });
    assert.equal(first.carriedGold, 110);
    assert.equal(repository.getPlayer(player.id).threadDust, 110);

    const replay = service.flip(player.id, 10, 'heads', { idempotencyKey: 'flip-key-0001' });
    assert.equal(replay.replayed, true);
    assert.equal(replay.flip.id, first.flip.id);
    assert.equal(replay.carriedGold, 110);
    assert.equal(repository.getPlayer(player.id).threadDust, 110, 'replay must not pay winnings twice');
  } finally {
    repository.close();
  }
});

test('Coinflip loss debits only the wager and persists the resolved flip', () => {
  const { repository, player, service } = setup({ random: () => 0.9 });
  try {
    const result = service.flip(player.id, 15, 'heads', { idempotencyKey: 'flip-key-0002' });
    assert.equal(result.flip.result, 'tails');
    assert.equal(result.flip.outcome, 'loss');
    assert.equal(result.flip.payoutGold, 0);
    assert.equal(result.carriedGold, 85);
    assert.equal(repository.getPlayer(player.id).threadDust, 85);
    assert.equal(service.coinflipRepository.getFlip(result.flip.id).outcome, 'loss');
  } finally {
    repository.close();
  }
});

test('Coinflip idempotency key cannot be reused for a different wager or side', () => {
  const { repository, player, service } = setup();
  try {
    service.flip(player.id, 10, 'heads', { idempotencyKey: 'flip-key-0003' });
    assert.throws(
      () => service.flip(player.id, 20, 'heads', { idempotencyKey: 'flip-key-0003' }),
      (error) => error.code === 'coinflip_replay_mismatch',
    );
    assert.throws(
      () => service.flip(player.id, 10, 'tails', { idempotencyKey: 'flip-key-0003' }),
      (error) => error.code === 'coinflip_replay_mismatch',
    );
    assert.equal(repository.getPlayer(player.id).threadDust, 110);
  } finally {
    repository.close();
  }
});

test('Coinflip wagers cannot spend banked Gold and invalid inputs never mutate balances', () => {
  const { repository, player, service } = setup({ gold: 50 });
  const bank = new SQLiteBankRepository({ database: repository.db });
  try {
    bank.deposit(player.id, 50);
    assert.deepEqual(bank.getBalance(player.id), { carriedGold: 0, bankedGold: 50 });
    assert.throws(
      () => service.flip(player.id, 1, 'heads', { idempotencyKey: 'flip-key-0004' }),
      (error) => error.code === 'insufficient_coinflip_gold',
    );
    assert.throws(
      () => service.flip(player.id, 0, 'heads', { idempotencyKey: 'flip-key-0005' }),
      (error) => error.code === 'invalid_coinflip_wager',
    );
    assert.throws(
      () => service.flip(player.id, 1, 'edge', { idempotencyKey: 'flip-key-0006' }),
      (error) => error.code === 'invalid_coinflip_choice',
    );
    assert.deepEqual(bank.getBalance(player.id), { carriedGold: 0, bankedGold: 50 });
  } finally {
    repository.close();
  }
});

test('Coinflip validates its RNG contract before any Gold mutation', () => {
  const { repository, player, service } = setup({ random: () => 1 });
  try {
    assert.throws(
      () => service.flip(player.id, 10, 'heads', { idempotencyKey: 'flip-key-0007' }),
      (error) => error.code === 'invalid_coinflip_random',
    );
    assert.equal(repository.getPlayer(player.id).threadDust, 100);
  } finally {
    repository.close();
  }
});
