import test from 'node:test';
import assert from 'node:assert/strict';
import { BlackjackService } from '../src/application/BlackjackService.js';
import { SQLiteBankRepository } from '../src/infrastructure/SQLiteBankRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function setup({ deck, roundId = 'blackjack-round-1', gold = 100 } = {}) {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'blackjack-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'blackjack-user', displayName: 'Blackjack Tester' });
  repository.addThreadDust(player.id, gold);
  const service = new BlackjackService({
    repository,
    idFactory: () => roundId,
    deckFactory: () => deck || ['10H', '9S', '7C', '7D', '5H', '10C'],
  });
  return { repository, player, service };
}

test('Blackjack start debits carried Gold once and replays the same idempotent response', () => {
  const { repository, player, service } = setup();
  try {
    const first = service.start(player.id, 10, { idempotencyKey: 'start-key-001' });
    assert.equal(first.replayed, false);
    assert.equal(first.carriedGold, 90);
    assert.equal(first.currency, 'Gold');
    assert.equal(first.round.status, 'active');
    assert.equal(first.round.wager, 10);
    assert.equal(first.round.dealerHiddenCardCount, 1);
    assert.equal(repository.getPlayer(player.id).threadDust, 90);

    const replay = service.start(player.id, 10, { idempotencyKey: 'start-key-001' });
    assert.equal(replay.replayed, true);
    assert.equal(replay.round.id, first.round.id);
    assert.equal(replay.carriedGold, 90);
    assert.equal(repository.getPlayer(player.id).threadDust, 90, 'replay must not debit the wager twice');

    assert.throws(
      () => service.start(player.id, 20, { idempotencyKey: 'start-key-001' }),
      (error) => error.code === 'blackjack_replay_mismatch',
    );
    assert.equal(repository.getPlayer(player.id).threadDust, 90);
  } finally {
    repository.close();
  }
});

test('Blackjack Hit settles cards and Gold atomically and cannot pay twice on replay', () => {
  const { repository, player, service } = setup({ deck: ['10H', '9S', '6C', '7D', '5H', '10C'] });
  try {
    const started = service.start(player.id, 10, { idempotencyKey: 'start-key-002' });
    assert.equal(started.carriedGold, 90);

    const resolved = service.hit(player.id, started.round.id, { idempotencyKey: 'hit-key-0001' });
    assert.equal(resolved.replayed, false);
    assert.equal(resolved.round.status, 'resolved');
    assert.equal(resolved.round.outcome, 'win');
    assert.equal(resolved.round.payoutGold, 20);
    assert.equal(resolved.carriedGold, 110);
    assert.equal(repository.getPlayer(player.id).threadDust, 110);

    const replay = service.hit(player.id, started.round.id, { idempotencyKey: 'hit-key-0001' });
    assert.equal(replay.replayed, true);
    assert.equal(replay.carriedGold, 110);
    assert.equal(repository.getPlayer(player.id).threadDust, 110, 'replay must not credit winnings twice');

    assert.throws(
      () => service.stand(player.id, started.round.id, { idempotencyKey: 'hit-key-0001' }),
      (error) => error.code === 'blackjack_replay_mismatch',
    );
  } finally {
    repository.close();
  }
});

test('Blackjack persists an active round and refuses a second concurrent wager', () => {
  const { repository, player, service } = setup();
  try {
    const started = service.start(player.id, 12, { idempotencyKey: 'start-key-003' });
    assert.equal(started.round.status, 'active');
    assert.throws(
      () => service.start(player.id, 5, { idempotencyKey: 'start-key-004' }),
      (error) => error.code === 'blackjack_round_active',
    );
    assert.equal(repository.getPlayer(player.id).threadDust, 88);

    const restored = new BlackjackService({ repository }).browse(player.id);
    assert.equal(restored.round.id, started.round.id);
    assert.equal(restored.round.status, 'active');
    assert.equal(restored.carriedGold, 88);
    assert.equal(restored.round.dealerHiddenCardCount, 1);
  } finally {
    repository.close();
  }
});

test('Blackjack wagers cannot spend banked Gold and invalid wagers never mutate balances', () => {
  const { repository, player, service } = setup({ gold: 50 });
  const bank = new SQLiteBankRepository({ database: repository.db });
  try {
    bank.deposit(player.id, 50);
    assert.deepEqual(bank.getBalance(player.id), { carriedGold: 0, bankedGold: 50 });
    assert.throws(
      () => service.start(player.id, 1, { idempotencyKey: 'start-key-005' }),
      (error) => error.code === 'insufficient_blackjack_gold',
    );
    assert.throws(
      () => service.start(player.id, 0, { idempotencyKey: 'start-key-006' }),
      (error) => error.code === 'invalid_blackjack_wager',
    );
    assert.deepEqual(bank.getBalance(player.id), { carriedGold: 0, bankedGold: 50 });
  } finally {
    repository.close();
  }
});

test('natural Blackjack settles wager and payout in the same start transaction', () => {
  const { repository, player, service } = setup({ deck: ['AH', '9S', 'KC', '7D'] });
  try {
    const result = service.start(player.id, 10, { idempotencyKey: 'start-key-007' });
    assert.equal(result.round.status, 'resolved');
    assert.equal(result.round.outcome, 'win');
    assert.equal(result.round.payoutGold, 20);
    assert.equal(result.carriedGold, 110);
    assert.equal(service.browse(player.id).round, null, 'resolved naturals must not block the next round');
  } finally {
    repository.close();
  }
});
