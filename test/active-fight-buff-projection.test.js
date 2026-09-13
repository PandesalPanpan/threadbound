import assert from 'node:assert/strict';
import test from 'node:test';

import { GameService } from '../src/application/GameService.js';
import { projectHuntReceipt } from '../src/application/HuntReceiptReadModel.js';
import { SQLiteFightBuffRepository } from '../src/infrastructure/SQLiteFightBuffRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

test('dashboard exposes authoritative active fight buffs with remaining fight counts', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'buff-profile-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'buff-profile-user', displayName: 'Buff Tester' });
  const fightBuffRepository = new SQLiteFightBuffRepository({ database: repository.db });
  fightBuffRepository.activate({
    playerId: player.id,
    buffCode: 'attack_boost_minor',
    sourceRecipeId: 'spicy-wyvern-stew',
    fights: 3,
    appliedAt: '2026-09-13T10:00:00.000Z',
  });

  const service = new GameService({
    repository,
    fightBuffRepository,
    eventBus: { publish() {}, publishAll() {} },
  });

  assert.deepEqual(service.dashboard(player.id).activeFightBuffs, [{
    code: 'attack_boost_minor',
    name: 'Attack Up',
    description: '+10% Attack while the buff has fights remaining.',
    sourceRecipeId: 'spicy-wyvern-stew',
    remainingFights: 3,
  }]);

  fightBuffRepository.consumeFight(player.id);
  assert.equal(service.dashboard(player.id).activeFightBuffs[0].remainingFights, 2);
});

test('Hunt receipt reports authoritative remaining-fight buff consumption without recalculating it', () => {
  const receipt = projectHuntReceipt({
    type: 'HuntResolved',
    victory: true,
    enemyName: 'Training Slime',
    damageTaken: 1,
    remainingHp: 9,
    maxHp: 10,
    gold: 4,
    experienceGained: 5,
    level: 1,
    fightBuffsConsumed: [
      { code: 'attack_boost_minor', name: 'Attack Up', beforeFights: 3, remainingFights: 2, expired: false },
      { code: 'hunt_haste_minor', name: 'Hunt Haste', beforeFights: 1, remainingFights: 0, expired: true },
    ],
  });

  assert.deepEqual(receipt.fightBuffs, [
    { code: 'attack_boost_minor', name: 'Attack Up', remainingFights: 2, expired: false },
    { code: 'hunt_haste_minor', name: 'Hunt Haste', remainingFights: 0, expired: true },
  ]);
  assert.match(receipt.text, /Attack Up — 2 fights left\./);
  assert.match(receipt.text, /Hunt Haste expired\./);
});
