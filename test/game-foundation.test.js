import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../src/domain/Character.js';
import { DungeonRun } from '../src/domain/DungeonRun.js';
import { ITEM_EFFECTS, ItemGenerator } from '../src/domain/ItemGenerator.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { EventBus } from '../src/application/EventBus.js';
import { AchievementProjector } from '../src/application/AchievementProjector.js';
import { GameService } from '../src/application/GameService.js';
import { HoneyPurchaseService } from '../src/application/HoneyPurchaseService.js';

test('character and dungeon domain rules form the complete first run loop', () => {
  const character = new Character({ id: 'p1', threadedUserId: '42', displayName: 'Tester', equippedItem: { attackBonus: 3 } });
  assert.equal(character.attackPower, 9);

  const run = DungeonRun.start({ id: 'r1', playerId: 'p1', dungeonId: 'frayed-hollow', playerMaxHealth: 40 });
  for (let encounter = 0; encounter < 3; encounter += 1) {
    run.attack({ attackPower: 6 });
    const result = run.attack({ attackPower: 6 });
    assert.ok(result.events.some((event) => event.type === 'EnemyDefeated'));
  }
  assert.equal(run.state.phase, 'upgrade');
  run.chooseUpgrade('sharpen');
  assert.equal(run.state.phase, 'boss');
  run.attack({ attackPower: 6 });
  run.attack({ attackPower: 6 });
  const final = run.attack({ attackPower: 6 });
  assert.equal(run.state.phase, 'complete');
  assert.ok(final.events.some((event) => event.type === 'DungeonCompleted'));
});

test('generated rewards only use registered effect vocabulary', () => {
  const values = [0.1, 0.2, 0.3, 0.4, 0.5];
  let index = 0;
  const generator = new ItemGenerator({ rng: () => values[(index++) % values.length], idFactory: () => 'item-1' });
  const item = generator.generateReward();
  assert.ok(Object.hasOwn(ITEM_EFFECTS, item.effectCode));
  assert.ok(item.attackBonus >= 1 && item.attackBonus <= 3);
});

test('service layer persists reward, progression, achievements, and equipment power', () => {
  let id = 0;
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => `player-${++id}` });
  const bus = new EventBus();
  const projector = new AchievementProjector(repository);
  bus.subscribe((event) => projector.handle(event));
  const service = new GameService({
    repository,
    eventBus: bus,
    idFactory: () => 'run-1',
    itemGenerator: new ItemGenerator({ rng: () => 0.1, idFactory: () => 'reward-1' }),
  });
  const player = service.ensurePlayer({ id: 1001, name: 'Tester' });
  const run = service.startDungeon(player.id, 'frayed-hollow');
  for (let i = 0; i < 6; i += 1) service.attack(player.id, run.id);
  service.chooseUpgrade(player.id, run.id, 'sharpen');
  service.attack(player.id, run.id);
  service.attack(player.id, run.id);
  const completed = service.attack(player.id, run.id);

  assert.equal(completed.state.phase, 'complete');
  assert.equal(repository.listItems(player.id).length, 1);
  assert.equal(repository.getPlayer(player.id).threadDust, 15);
  assert.equal(repository.getWorldState().frayedHollowClears, 1);
  assert.deepEqual(repository.listAchievements(player.id).map((achievement) => achievement.id).sort(), ['first_blood', 'hollow_cleared']);

  service.equipItem(player.id, 'reward-1');
  assert.ok(service.dashboard(player.id).character.attackPower > 6);
  assert.ok(repository.listAchievements(player.id).some((achievement) => achievement.id === 'armed_and_threaded'));
  repository.close();
});

test('Honey retries call Threaded again but grant exactly once', async () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-1' });
  const player = repository.getOrCreatePlayer({ threadedUserId: '1001', displayName: 'Tester' });
  let calls = 0;
  const gateway = {
    async spendPoints(_token, request) {
      calls += 1;
      assert.equal(request.amount, 25);
      return { transaction_id: 'txn-1', balance: 75 };
    },
  };
  const service = new HoneyPurchaseService({ repository, threadedGateway: gateway });
  const input = { playerId: player.id, threadedUserId: '1001', accessToken: 'token', idempotencyKey: 'same-key-123' };
  const first = await service.purchaseTrainingCache(input);
  const second = await service.purchaseTrainingCache(input);

  assert.equal(first.grantApplied, true);
  assert.equal(second.grantApplied, false);
  assert.equal(calls, 2);
  assert.equal(repository.listItems(player.id).length, 1);
  repository.close();
});
