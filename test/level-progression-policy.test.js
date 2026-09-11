import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVEL_PROGRESSION,
  applyExperienceReward,
  experienceForLevel,
  levelForExperience,
  progressionForExperience,
} from '../src/domain/LevelProgressionPolicy.js';

test('canonical XP thresholds increase by a readable 50 XP step per level', () => {
  assert.equal(LEVEL_PROGRESSION.baseXpStep, 50);
  assert.equal(experienceForLevel(1), 0);
  assert.equal(experienceForLevel(2), 50);
  assert.equal(experienceForLevel(3), 150);
  assert.equal(experienceForLevel(4), 300);
});

test('level is derived deterministically from cumulative XP at threshold edges', () => {
  assert.equal(levelForExperience(0), 1);
  assert.equal(levelForExperience(49), 1);
  assert.equal(levelForExperience(50), 2);
  assert.equal(levelForExperience(149), 2);
  assert.equal(levelForExperience(150), 3);
  assert.equal(levelForExperience(300), 4);
});

test('progression projection exposes current level progress without duplicating level state', () => {
  assert.deepEqual(progressionForExperience(90), {
    experience: 90,
    level: 2,
    levelStartExperience: 50,
    nextLevelExperience: 150,
    experienceIntoLevel: 40,
    experienceNeededForLevel: 100,
    experienceToNextLevel: 60,
  });
});

test('experience rewards report level-up transitions for receipt projection', () => {
  const result = applyExperienceReward(45, 12);
  assert.equal(result.rewardExperience, 12);
  assert.equal(result.before.level, 1);
  assert.equal(result.after.experience, 57);
  assert.equal(result.after.level, 2);
  assert.equal(result.levelsGained, 1);
  assert.equal(result.leveledUp, true);
});

test('invalid or negative XP normalizes safely to zero', () => {
  assert.equal(levelForExperience(-500), 1);
  assert.equal(progressionForExperience(Number.NaN).experience, 0);
  assert.equal(applyExperienceReward(10, -5).after.experience, 10);
});
