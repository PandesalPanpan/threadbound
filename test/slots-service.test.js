import test from 'node:test';
import assert from 'node:assert/strict';
import { SlotsService } from '../src/application/SlotsService.js';
import { SQLiteBankRepository } from '../src/infrastructure/SQLiteBankRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function sequenceRandom(values) {
  let index = 0;
  return () => {
    const value = values[index];
    index += 1;
    return value;
  };
}

function setup({ random = () => 0.99, spinId = 'slots-spin-1', gold = 100 } = {}) {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'slots-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'slots-user', displayName: 'Slots Tester' });
  repository.addThreadDust(player.id, gold);
  const service = new SlotsService({
    repository,
    random,
    idFactory: () => spinId,
  });
  return { repository, player, service };
}

test('Slots crown jackpot settles carried Gold once and replays the same idempotent response', () => {
  const { repository, player, service } = setup({ random: () => 0.99 });
  try {
    const first = service.spin(player.id, 10, { idempotencyKey: 'slots-key-0001' });
    assert.equal(first.replayed, false);
    assert.equal(first.currency, 'Gold');
    assert.deepEqual(first.spin, {
      id: 'slots-spin-1',
      wager: 10,
      currency: 'Gold',
      reels: ['crown', 'crown', 'crown'],
      outcome: 'jackpot',
      payoutGold: 60,
    });
    assert.equal(first.carriedGold, 150);
    assert.equal(repository.getPlayer(player.id).threadDust, 150);

    const replay = service.spin(player.id, 10, { idempotencyKey: 'slots-key-0001' });
    assert.equal(replay.replayed, true);
    assert.equal(replay.spin.id, first.spin.id);
    assert.equal(replay.carriedGold, 150);
    assert.equal(repository.getPlayer(player.id).threadDust, 150, 'replay must not pay winnings twice');
  } finally {
    repository.close();
  }
});

test('Slots pair returns the wager while a non-matching spin loses it', () => {
  const pair = setup({ random: sequenceRandom([0.1, 0.1, 0.3]), spinId: 'slots-pair' });
  try {
    const result = pair.service.spin(pair.player.id, 15, { idempotencyKey: 'slots-key-0002' });
    assert.deepEqual(result.spin.reels, ['coin', 'coin', 'sword']);
    assert.equal(result.spin.outcome, 'win');
    assert.equal(result.spin.payoutGold, 15);
    assert.equal(result.carriedGold, 100);
    assert.equal(pair.service.slotsRepository.getSpin(result.spin.id).outcome, 'win');
  } finally {
    pair.repository.close();
  }

  const loss = setup({ random: sequenceRandom([0.1, 0.3, 0.6]), spinId: 'slots-loss' });
  try {
    const result = loss.service.spin(loss.player.id, 10, { idempotencyKey: 'slots-key-0003' });
    assert.deepEqual(result.spin.reels, ['coin', 'sword', 'shield']);
    assert.equal(result.spin.outcome, 'loss');
    assert.equal(result.spin.payoutGold, 0);
    assert.equal(result.carriedGold, 90);
    assert.equal(loss.repository.getPlayer(loss.player.id).threadDust, 90);
  } finally {
    loss.repository.close();
  }
});

test('Slots triple payouts use the canonical symbol table', () => {
  const cases = [
    { sample: 0.1, symbol: 'coin', payout: 20, outcome: 'win' },
    { sample: 0.3, symbol: 'sword', payout: 30, outcome: 'win' },
    { sample: 0.6, symbol: 'shield', payout: 40, outcome: 'win' },
    { sample: 0.9, symbol: 'crown', payout: 60, outcome: 'jackpot' },
  ];

  for (const [index, item] of cases.entries()) {
    const { repository, player, service } = setup({ random: () => item.sample, spinId: `slots-triple-${index}` });
    try {
      const result = service.spin(player.id, 10, { idempotencyKey: `slots-key-triple-${index}` });
      assert.deepEqual(result.spin.reels, [item.symbol, item.symbol, item.symbol]);
      assert.equal(result.spin.payoutGold, item.payout);
      assert.equal(result.spin.outcome, item.outcome);
    } finally {
      repository.close();
    }
  }
});

test('Slots idempotency key cannot be reused for a different wager', () => {
  const { repository, player, service } = setup();
  try {
    service.spin(player.id, 10, { idempotencyKey: 'slots-key-0004' });
    assert.throws(
      () => service.spin(player.id, 20, { idempotencyKey: 'slots-key-0004' }),
      (error) => error.code === 'slots_replay_mismatch',
    );
    assert.equal(repository.getPlayer(player.id).threadDust, 150);
  } finally {
    repository.close();
  }
});

test('Slots wagers cannot spend banked Gold and invalid wagers never mutate balances', () => {
  const { repository, player, service } = setup({ gold: 50 });
  const bank = new SQLiteBankRepository({ database: repository.db });
  try {
    bank.deposit(player.id, 50);
    assert.deepEqual(bank.getBalance(player.id), { carriedGold: 0, bankedGold: 50 });
    assert.throws(
      () => service.spin(player.id, 1, { idempotencyKey: 'slots-key-0005' }),
      (error) => error.code === 'insufficient_slots_gold',
    );
    assert.throws(
      () => service.spin(player.id, 0, { idempotencyKey: 'slots-key-0006' }),
      (error) => error.code === 'invalid_slots_wager',
    );
    assert.deepEqual(bank.getBalance(player.id), { carriedGold: 0, bankedGold: 50 });
  } finally {
    repository.close();
  }
});

test('Slots validates every RNG sample before any Gold mutation', () => {
  const { repository, player, service } = setup({ random: sequenceRandom([0.1, 1]) });
  try {
    assert.throws(
      () => service.spin(player.id, 10, { idempotencyKey: 'slots-key-0007' }),
      (error) => error.code === 'invalid_slots_random',
    );
    assert.equal(repository.getPlayer(player.id).threadDust, 100);
  } finally {
    repository.close();
  }
});
