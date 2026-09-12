import test from 'node:test';
import assert from 'node:assert/strict';
import { DangerousDeathPenaltyService } from '../src/application/DangerousDeathPenaltyService.js';
import {
  DANGEROUS_DEATH_WARNING_ID,
  dangerousDeathWarning,
  isEligibleDangerousDeathItem,
  resolveDangerousDeathPenalty,
} from '../src/domain/DeathPenaltyPolicy.js';
import { SQLiteBankRepository } from '../src/infrastructure/SQLiteBankRepository.js';
import { SQLiteEquipmentRepository } from '../src/infrastructure/SQLiteEquipmentRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function item(overrides = {}) {
  return {
    id: 'gear-1',
    definitionId: 'test-gear',
    name: 'Test Blade',
    slot: 'weapon',
    rarity: 'common',
    attackBonus: 1,
    effectCode: 'none',
    effect: { code: 'none' },
    source: 'hunt',
    ...overrides,
  };
}

const activity = {
  activityId: 'danger-run-1',
  activityStartedAt: '2026-09-12T10:00:00.000Z',
  riskAcknowledgement: {
    warningId: DANGEROUS_DEATH_WARNING_ID,
    activityId: 'danger-run-1',
    acknowledgedAt: '2026-09-12T09:59:30.000Z',
  },
};

test('dangerous fallback is opt-in, thresholded, and requires warning acknowledgement before entry', () => {
  const equippedItems = [item()];
  const config = { enabled: true, minimumCarriedGold: 10 };

  assert.equal(resolveDangerousDeathPenalty({ carriedGold: 5, equippedItems }).penaltyType, 'gold');
  assert.equal(resolveDangerousDeathPenalty({ carriedGold: 10, config, ...activity, equippedItems }).penaltyType, 'gold');

  const afterEntryWarning = resolveDangerousDeathPenalty({
    carriedGold: 5,
    config,
    activityId: activity.activityId,
    activityStartedAt: activity.activityStartedAt,
    riskAcknowledgement: { ...activity.riskAcknowledgement, acknowledgedAt: '2026-09-12T10:00:01.000Z' },
    equippedItems,
  });
  assert.equal(afterEntryWarning.penaltyType, 'gold');
  assert.equal(afterEntryWarning.fallbackReason, 'pre-entry-warning-required');

  const valid = resolveDangerousDeathPenalty({ carriedGold: 5, config, ...activity, equippedItems });
  assert.equal(valid.penaltyType, 'item-loss');
  assert.equal(valid.goldLost, 0);
  assert.equal(valid.itemLoss.id, 'gear-1');
});

test('canonical dangerous warning clearly states the threshold and protected-item safety', () => {
  const warning = dangerousDeathWarning({ minimumCarriedGold: 25 });
  assert.equal(warning.id, DANGEROUS_DEATH_WARNING_ID);
  assert.match(warning.text, /less than 25 Gold/);
  assert.match(warning.text, /Bound, protected, and Honey-purchased equipment is safe/);
});

test('bound, protected, and Honey-purchased equipment is never eligible for item loss', () => {
  assert.equal(isEligibleDangerousDeathItem(item()), true);
  assert.equal(isEligibleDangerousDeathItem(item({ effect: { code: 'none', bound: true } })), false);
  assert.equal(isEligibleDangerousDeathItem(item({ effect: { code: 'none', protected: true } })), false);
  assert.equal(isEligibleDangerousDeathItem(item({ effect: { code: 'none', lossProtection: 'protected' } })), false);
  assert.equal(isEligibleDangerousDeathItem(item({ source: 'honey-purchase' })), false);

  const result = resolveDangerousDeathPenalty({
    carriedGold: 1,
    config: { enabled: true, minimumCarriedGold: 10 },
    ...activity,
    equippedItems: [item({ effect: { code: 'none', bound: true } })],
  });
  assert.equal(result.penaltyType, 'gold');
  assert.equal(result.fallbackReason, 'no-eligible-equipped-item');
});

test('service commits eligible equipped-item loss while carried and banked Gold remain unchanged', () => {
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-1' });
  const equipmentRepository = new SQLiteEquipmentRepository({ database: gameRepository.db });
  const bankRepository = new SQLiteBankRepository({ database: gameRepository.db });
  const service = new DangerousDeathPenaltyService({ bankRepository, equipmentRepository });

  const player = gameRepository.getOrCreatePlayer({ threadedUserId: 'threaded-1', displayName: 'Aster' });
  gameRepository.addThreadDust(player.id, 20);
  bankRepository.deposit(player.id, 15);
  gameRepository.addItem(player.id, item());
  equipmentRepository.equip(player.id, 'gear-1');

  const result = service.apply({
    playerId: player.id,
    config: { enabled: true, minimumCarriedGold: 10 },
    ...activity,
  });

  assert.equal(result.penaltyType, 'item-loss');
  assert.equal(result.itemLoss.id, 'gear-1');
  assert.deepEqual(bankRepository.getBalance(player.id), { carriedGold: 5, bankedGold: 15 });
  assert.equal(gameRepository.getItem('gear-1'), null);
  assert.equal(equipmentRepository.getLoadout(player.id).weapon, null);
  assert.equal(gameRepository.getPlayer(player.id).equippedItemId, null);
  gameRepository.close();
});

test('repository refuses direct deletion of protected equipment even if a caller bypasses the policy', () => {
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-2' });
  const equipmentRepository = new SQLiteEquipmentRepository({ database: gameRepository.db });
  const player = gameRepository.getOrCreatePlayer({ threadedUserId: 'threaded-2', displayName: 'Bryn' });
  gameRepository.addItem(player.id, item({ id: 'bound-gear', effect: { code: 'none', bound: true } }));
  equipmentRepository.equip(player.id, 'bound-gear');

  assert.throws(
    () => equipmentRepository.loseEquippedItem(player.id, 'bound-gear'),
    (error) => error?.code === 'item_loss_protected',
  );
  assert.ok(gameRepository.getItem('bound-gear'));
  assert.equal(equipmentRepository.isEquipped(player.id, 'bound-gear'), true);
  gameRepository.close();
});
