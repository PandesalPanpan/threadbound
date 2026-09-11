import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/application/EventBus.js';
import { BankService } from '../src/application/BankService.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function setup() {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'bank-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'bank-user', displayName: 'Bank Tester' });
  repository.addThreadDust(player.id, 50);
  const events = [];
  const eventBus = new EventBus();
  eventBus.subscribe((event) => events.push(event));
  const service = new BankService({ repository, eventBus });
  return { repository, player, service, events };
}

test('Bank persists carried and banked Gold atomically across service instances', () => {
  const { repository, player, service, events } = setup();
  assert.deepEqual(service.browse(player.id), { carriedGold: 50, bankedGold: 0 });

  assert.deepEqual(service.deposit(player.id, 20), { action: 'deposit', amount: 20, carriedGold: 30, bankedGold: 20 });
  assert.equal(repository.getPlayer(player.id).threadDust, 30);
  assert.deepEqual(new BankService({ repository, eventBus: { publish() {} } }).browse(player.id), { carriedGold: 30, bankedGold: 20 });

  assert.deepEqual(service.withdraw(player.id, 7), { action: 'withdraw', amount: 7, carriedGold: 37, bankedGold: 13 });
  assert.equal(repository.getPlayer(player.id).threadDust, 37);
  assert.deepEqual(events.map((event) => [event.type, event.amount]), [['GoldDeposited', 20], ['GoldWithdrawn', 7]]);
  repository.close();
});

test('Bank rejects invalid or overdrawn transfers without changing either balance', () => {
  const { repository, player, service } = setup();
  assert.throws(() => service.deposit(player.id, 99), (error) => error.code === 'insufficient_carried_gold');
  assert.throws(() => service.deposit(player.id, 0), (error) => error.code === 'invalid_bank_amount');
  assert.deepEqual(service.browse(player.id), { carriedGold: 50, bankedGold: 0 });

  service.deposit(player.id, 15);
  assert.throws(() => service.withdraw(player.id, 16), (error) => error.code === 'insufficient_banked_gold');
  assert.deepEqual(service.browse(player.id), { carriedGold: 35, bankedGold: 15 });
  repository.close();
});
