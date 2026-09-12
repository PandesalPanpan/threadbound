import test from 'node:test';
import assert from 'node:assert/strict';
import { HuntService } from '../src/application/HuntService.js';
import { NORMAL_DEATH_RULES, resolveNormalDeathPenalty } from '../src/domain/DeathPenaltyPolicy.js';
import { SQLiteBankRepository } from '../src/infrastructure/SQLiteBankRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

test('normal death loses exactly 20% of carried Gold rounded down', () => {
  assert.equal(NORMAL_DEATH_RULES.carriedGoldLossPercent, 20);
  assert.deepEqual(resolveNormalDeathPenalty({ carriedGold: 60 }), {
    carriedGoldBefore: 60,
    goldLost: 12,
    carriedGoldAfter: 48,
    lossPercent: 20,
  });
  assert.deepEqual(resolveNormalDeathPenalty({ carriedGold: 4 }), {
    carriedGoldBefore: 4,
    goldLost: 0,
    carriedGoldAfter: 4,
    lossPercent: 20,
  });
});

test('Hunt death removes only carried Gold and leaves banked Gold safe', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'death-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'death-user', displayName: 'Adventurer' });
  const bankRepository = new SQLiteBankRepository({ database: repository.db });
  repository.addThreadDust(player.id, 100);
  bankRepository.deposit(player.id, 40);
  repository.setPlayerHealth(player.id, 1);

  const events = [];
  const service = new HuntService({
    repository,
    bankRepository,
    eventBus: { publish: (event) => events.push(event) },
    rng: () => 0.99,
    huntCooldownSeconds: 0,
  });

  const result = service.hunt(player.id);
  const balance = bankRepository.getBalance(player.id);
  const event = events.find((entry) => entry.type === 'HuntResolved');

  assert.equal(result.victory, false);
  assert.equal(result.remainingHp, 0);
  assert.deepEqual(result.deathPenalty, {
    carriedGoldBefore: 60,
    goldLost: 12,
    carriedGoldAfter: 48,
    lossPercent: 20,
    bankedGold: 40,
  });
  assert.deepEqual(balance, { carriedGold: 48, bankedGold: 40 });
  assert.equal(event.goldLost, 12);
  assert.equal(event.carriedGold, 48);
  assert.equal(event.bankedGold, 40);
  assert.equal(event.deathPenaltyPercent, 20);
});

test('carried Gold loss repository never touches banked Gold', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'bank-safe-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'bank-safe-user', displayName: 'Adventurer' });
  const bankRepository = new SQLiteBankRepository({ database: repository.db });
  repository.addThreadDust(player.id, 25);
  bankRepository.deposit(player.id, 10);

  assert.deepEqual(bankRepository.loseCarriedGold(player.id, 999), {
    carriedGoldBefore: 15,
    carriedGold: 0,
    bankedGold: 10,
    goldLost: 15,
  });
  assert.deepEqual(bankRepository.getBalance(player.id), { carriedGold: 0, bankedGold: 10 });
});
