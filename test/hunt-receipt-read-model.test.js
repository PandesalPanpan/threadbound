import test from 'node:test';
import assert from 'node:assert/strict';
import { projectHuntReceipt } from '../src/application/HuntReceiptReadModel.js';

test('projects a structured Hunt receipt from authoritative reward facts and migration aliases', () => {
  const receipt = projectHuntReceipt({
    type: 'HuntResolved',
    victory: true,
    enemyId: 'forest-slime',
    enemyName: 'Forest Slime',
    damageTaken: 4,
    remainingHp: 36,
    maxHp: 40,
    threadDust: 7,
    xp: 20,
    level: 2,
    leveledUp: true,
    levelsGained: 1,
    itemId: 'item-1',
    itemName: 'Gleaming Fang',
    itemRarity: 'rare',
    itemAttackBonus: 3,
    healthPotionsFound: 1,
    questProgress: [
      { questId: 'slime-hunt', label: 'Slime Cleanup', current: 4, target: 8, completed: false },
      { questId: 'first-hunt', questName: 'First Hunt', current: 1, required: 1, completed: true },
    ],
  }, { actorName: 'Mira' });

  assert.deepEqual(receipt.rewards, { gold: 7, xp: 20 });
  assert.deepEqual(receipt.progression, { level: 2, leveledUp: true, levelsGained: 1 });
  assert.deepEqual(receipt.loot, { id: 'item-1', name: 'Gleaming Fang', rarity: 'rare', attackBonus: 3 });
  assert.deepEqual(receipt.questProgress, [
    { questId: 'slime-hunt', questName: 'Slime Cleanup', current: 4, required: 8, completed: false },
    { questId: 'first-hunt', questName: 'First Hunt', current: 1, required: 1, completed: true },
  ]);
  assert.match(receipt.text, /^Victory — Mira defeated Forest Slime\./);
  assert.match(receipt.text, /−4 HP · 36\/40 HP/);
  assert.match(receipt.text, /\+7 Gold · \+20 XP/);
  assert.match(receipt.text, /Level up — 2/);
  assert.match(receipt.text, /Rare Gleaming Fang · \+3 Attack/);
  assert.match(receipt.text, /Quest — Slime Cleanup 4\/8/);
  assert.match(receipt.text, /Quest complete — First Hunt/);
  assert.doesNotMatch(receipt.text, /Dust|Relic|Temper/);
});

test('failed Hunts discard stale reward-looking fields from the receipt', () => {
  const receipt = projectHuntReceipt({
    type: 'HuntResolved',
    victory: false,
    enemyName: 'Ash Hound',
    damageTaken: 12,
    remainingHp: 0,
    maxHp: 40,
    gold: 999,
    experienceGained: 999,
    leveledUp: true,
    itemName: 'Impossible Sword',
    healthPotionsFound: 99,
  }, { actorName: 'Mira' });

  assert.deepEqual(receipt.rewards, { gold: 0, xp: 0 });
  assert.equal(receipt.loot, null);
  assert.equal(receipt.healthPotionsFound, 0);
  assert.match(receipt.text, /^Defeat — Mira fell to Ash Hound\./);
  assert.match(receipt.text, /No rewards/);
  assert.doesNotMatch(receipt.text, /999|Impossible|Level up/);
});

test('rejects non-Hunt events instead of inventing receipt state', () => {
  assert.throws(() => projectHuntReceipt({ type: 'CombatActionResolved' }), /requires a HuntResolved event/);
});
