import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEM_RARITIES, ITEM_RARITY_IDS, isItemRarity, itemRarity, rarityFromRoll, rarityLabel, rarityTier } from '../src/domain/ItemRarityPolicy.js';
import { ItemGenerator } from '../src/domain/ItemGenerator.js';
import { maxRelicUpgradeLevel } from '../src/domain/RelicProgressionPolicy.js';
import { SALVAGE_BY_RARITY } from '../src/application/InventoryService.js';

test('canonical rarity contract is exactly Common through Mythic in ascending tiers', () => {
  assert.deepEqual(ITEM_RARITY_IDS, ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']);
  assert.deepEqual(ITEM_RARITY_IDS.map(rarityLabel), ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic']);
  assert.deepEqual(ITEM_RARITY_IDS.map(rarityTier), [1, 2, 3, 4, 5, 6]);
  assert.equal(isItemRarity('MYTHIC'), true);
  assert.equal(isItemRarity('artifact'), false);
  assert.equal(itemRarity('unknown').id, 'common');
});

test('rarity roll preserves existing bands and reserves the top band for Mythic', () => {
  assert.equal(rarityFromRoll(0).id, 'common');
  assert.equal(rarityFromRoll(0.42).id, 'uncommon');
  assert.equal(rarityFromRoll(0.78).id, 'rare');
  assert.equal(rarityFromRoll(0.94).id, 'epic');
  assert.equal(rarityFromRoll(0.985).id, 'legendary');
  assert.equal(rarityFromRoll(0.997).id, 'mythic');
  assert.equal(rarityFromRoll(1).id, 'mythic');
});

test('generated Mythic equipment carries tier 6 and remains compatible with upgrade and salvage policies', () => {
  const rolls = [0.997, 0, 0, 0, 0, 0];
  let index = 0;
  const generator = new ItemGenerator({ rng: () => rolls[index++] ?? 0, idFactory: () => 'mythic-test-item' });
  const item = generator.generateReward({ source: 'test' });
  assert.equal(item.rarity, 'mythic');
  assert.equal(item.rarityTier, 6);
  assert.equal(item.attackBonus, ITEM_RARITIES.mythic.minAttack);
  assert.equal(maxRelicUpgradeLevel(item), 3);
  assert.equal(SALVAGE_BY_RARITY.mythic, 50);
});
