import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivityStreamService } from '../src/application/ActivityStreamService.js';
import { projectHuntReceipt } from '../src/application/HuntReceiptReadModel.js';

test('projects Gold, XP, HP, level-up, rarity loot, potion, and quest progress from authoritative HuntResolved facts', () => {
  const receipt = projectHuntReceipt({
    type: 'HuntResolved',
    victory: true,
    enemyId: 'forest-slime',
    enemyName: 'Forest Slime',
    damageTaken: 4,
    remainingHp: 36,
    maxHp: 40,
    gold: 7,
    experienceGained: 20,
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
      { questId: 'first-hunt', label: 'First Hunt', current: 1, target: 1, completed: true },
    ],
  }, { actorName: 'Mira' });

  assert.equal(receipt.rewards.gold, 7);
  assert.equal(receipt.rewards.xp, 20);
  assert.equal(receipt.progression.level, 2);
  assert.equal(receipt.progression.leveledUp, true);
  assert.deepEqual(receipt.loot, { id: 'item-1', name: 'Gleaming Fang', rarity: 'rare', attackBonus: 3 });
  assert.equal(receipt.questProgress.length, 2);
  assert.match(receipt.text, /Mira found and killed Forest Slime/);
  assert.match(receipt.text, /\+7 Gold · \+20 XP/);
  assert.match(receipt.text, /36\/40 HP/);
  assert.match(receipt.text, /Level 2!/);
  assert.match(receipt.text, /rare Gleaming Fang \(\+3 ATK\)/);
  assert.match(receipt.text, /\+1 health potion/);
  assert.match(receipt.text, /Slime Cleanup 4\/8/);
  assert.match(receipt.text, /First Hunt 1\/1 complete/);
  assert.doesNotMatch(receipt.text, /Dust/);
});

test('Activity Stream persists the canonical Gold/XP Hunt receipt while retaining raw event metadata', () => {
  const appended = [];
  const service = new ActivityStreamService({
    streamRepository: { append: (entry) => { appended.push(entry); return entry; } },
    gameRepository: {
      getPlayer: () => ({ displayName: 'Mira' }),
      getRun: () => null,
      getItem: () => null,
    },
  });

  const entry = service.recordDomainEvent({
    type: 'HuntResolved',
    playerId: 'hero',
    victory: true,
    enemyId: 'forest-slime',
    enemyName: 'Forest Slime',
    damageTaken: 4,
    remainingHp: 36,
    maxHp: 40,
    gold: 7,
    threadDust: 7,
    experienceGained: 20,
    level: 2,
    leveledUp: true,
    itemName: 'Gleaming Fang',
    itemRarity: 'rare',
    itemAttackBonus: 3,
  });

  assert.equal(appended.length, 1);
  assert.equal(entry.actorName, 'THREADBOUND');
  assert.match(entry.body, /Mira found and killed Forest Slime/);
  assert.match(entry.body, /\+7 Gold · \+20 XP/);
  assert.match(entry.body, /rare Gleaming Fang/);
  assert.doesNotMatch(entry.body, /Dust/);
  assert.equal(entry.metadata.gold, 7);
  assert.equal(entry.metadata.threadDust, 7);
});

test('failed Hunts project no Gold or XP even when stale reward fields are present', () => {
  const receipt = projectHuntReceipt({
    type: 'HuntResolved',
    victory: false,
    enemyName: 'Ash Hound',
    damageTaken: 12,
    remainingHp: 0,
    maxHp: 40,
    gold: 999,
    experienceGained: 999,
  }, { actorName: 'Mira' });

  assert.deepEqual(receipt.rewards, { gold: 0, xp: 0 });
  assert.match(receipt.text, /Mira found Ash Hound but was defeated/);
  assert.match(receipt.text, /No rewards/);
  assert.doesNotMatch(receipt.text, /999/);
});

test('legacy threadDust/xp aliases remain readable during migration', () => {
  const receipt = projectHuntReceipt({
    type: 'HuntResolved',
    victory: true,
    enemyName: 'Rat',
    damageTaken: 0,
    remainingHp: 40,
    maxHp: 40,
    threadDust: 3,
    xp: 10,
  });

  assert.deepEqual(receipt.rewards, { gold: 3, xp: 10 });
  assert.match(receipt.text, /\+3 Gold · \+10 XP/);
});

test('rejects non-Hunt events instead of inventing receipt state', () => {
  assert.throws(() => projectHuntReceipt({ type: 'CombatActionResolved' }), /requires a HuntResolved event/);
});
