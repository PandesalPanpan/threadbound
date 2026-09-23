import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTER_GROWTH, growthForLevelChange, maxHpGrowthForLevels } from '../src/domain/CharacterGrowthPolicy.js';

test('each gained Level grants exactly three base Max HP', () => {
  assert.equal(CHARACTER_GROWTH.maxHpPerLevel, 3);
  assert.equal(maxHpGrowthForLevels(1), 3);
  assert.equal(maxHpGrowthForLevels(3), 9);
  assert.equal(maxHpGrowthForLevels(-1), 0);
});

test('growth policy reports exact multi-level transition delta', () => {
  assert.deepEqual(growthForLevelChange(2, 5), {
    fromLevel: 2,
    toLevel: 5,
    levelsGained: 3,
    maxHealthIncrease: 9,
  });
  assert.deepEqual(growthForLevelChange(4, 2), {
    fromLevel: 4,
    toLevel: 4,
    levelsGained: 0,
    maxHealthIncrease: 0,
  });
});
