const BASE_XP_STEP = 50;

function normalizeExperience(value) {
  const numeric = Math.floor(Number(value));
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

/**
 * Canonical cumulative XP threshold for a level.
 *
 * Level 1 starts at 0 XP. Each next level costs another BASE_XP_STEP than
 * the previous one: 50 XP for level 2, then 100 more for level 3, 150 more
 * for level 4, and so on. Keeping this rule in one domain policy prevents
 * services and browser projections from inventing their own level math.
 */
export function experienceForLevel(level) {
  const normalizedLevel = Math.max(1, Math.floor(Number(level)) || 1);
  return (BASE_XP_STEP * normalizedLevel * (normalizedLevel - 1)) / 2;
}

export function levelForExperience(experience) {
  const xp = normalizeExperience(experience);
  return Math.max(1, Math.floor((1 + Math.sqrt(1 + (8 * xp) / BASE_XP_STEP)) / 2));
}

export function progressionForExperience(experience) {
  const xp = normalizeExperience(experience);
  const level = levelForExperience(xp);
  const levelStartExperience = experienceForLevel(level);
  const nextLevelExperience = experienceForLevel(level + 1);
  return Object.freeze({
    experience: xp,
    level,
    levelStartExperience,
    nextLevelExperience,
    experienceIntoLevel: xp - levelStartExperience,
    experienceNeededForLevel: nextLevelExperience - levelStartExperience,
    experienceToNextLevel: nextLevelExperience - xp,
  });
}

export function applyExperienceReward(currentExperience, rewardExperience) {
  const before = progressionForExperience(currentExperience);
  const reward = normalizeExperience(rewardExperience);
  const after = progressionForExperience(before.experience + reward);
  return Object.freeze({
    rewardExperience: reward,
    before,
    after,
    levelsGained: after.level - before.level,
    leveledUp: after.level > before.level,
  });
}

export const LEVEL_PROGRESSION = Object.freeze({
  baseXpStep: BASE_XP_STEP,
});
