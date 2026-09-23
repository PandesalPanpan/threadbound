export const CHARACTER_GROWTH = Object.freeze({
  maxHpPerLevel: 3,
});

/**
 * Levels permanently raise a character's base Max HP. Equipment remains an
 * additive projection layered on top of this persisted level growth.
 */
export function maxHpGrowthForLevels(levelsGained, { maxHpPerLevel = CHARACTER_GROWTH.maxHpPerLevel } = {}) {
  const levels = Math.max(0, Math.floor(Number(levelsGained) || 0));
  const amountPerLevel = Math.max(0, Math.floor(Number(maxHpPerLevel) || 0));
  return levels * amountPerLevel;
}

export function growthForLevelChange(fromLevel, toLevel, options = {}) {
  const from = Math.max(1, Math.floor(Number(fromLevel) || 1));
  const to = Math.max(from, Math.floor(Number(toLevel) || from));
  const levelsGained = to - from;
  return Object.freeze({
    fromLevel: from,
    toLevel: to,
    levelsGained,
    maxHealthIncrease: maxHpGrowthForLevels(levelsGained, options),
  });
}
