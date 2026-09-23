import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AREA_CONTENT,
  areaContentForNumber,
  itemRewardProfileForArea,
  progressionChallengeForArea,
  progressionChallengeForDungeon,
  skillDefinitionForCode,
} from '../src/content/AreaContentCatalog.js';
import { visualAsset } from '../src/content/VisualAssetCatalog.js';
import { ItemGenerator } from '../src/domain/ItemGenerator.js';
import { rarityTier } from '../src/domain/ItemRarityPolicy.js';

test('Area 1–4 content has valid Hunt and Adventure rosters, skills, and semantic visuals', () => {
  assert.deepEqual(AREA_CONTENT.map((area) => [area.number, area.name]), [
    [1, 'Bellbloom Meadows'],
    [2, 'Emberglass Orchard'],
    [3, 'Kitewind Heights'],
    [4, 'The Mirrorfen'],
  ]);

  for (const area of AREA_CONTENT) {
    assert.equal(areaContentForNumber(area.number).id, `area-${area.number}`);
    assert.ok(area.huntEncounters.length >= 3);
    assert.ok(area.adventureEncounters.length >= 3);
    for (const encounter of [...area.huntEncounters, ...area.adventureEncounters]) {
      assert.match(encounter.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assert.ok(encounter.hp > 0 && encounter.attack > 0);
      assert.ok(skillDefinitionForCode(encounter.skillCode));
      assert.ok(visualAsset(encounter.visualAssetId, 'mob'), `${encounter.id} must use a registered mob asset`);
    }
    for (const encounter of area.huntEncounters) {
      assert.ok(encounter.gold > 0 && encounter.experience > 0);
      assert.ok(encounter.dropChance > 0 && encounter.dropChance <= 1);
    }
    for (const [enemyId, skillCode] of Object.entries(area.dungeonSkillCodes)) {
      assert.match(enemyId, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assert.ok(skillDefinitionForCode(skillCode));
    }
  }
});

test('each Area item reward profile resolves all five slots to official matching material families', () => {
  const slots = ['weapon', 'helmet', 'armor', 'boots', 'accessory'];
  for (const area of AREA_CONTENT) {
    const profile = itemRewardProfileForArea(area.number);
    assert.equal(profile.areaNumber, area.number);
    assert.deepEqual(Object.keys(profile.equipmentOptions), slots);
    for (const slot of slots) {
      const options = profile.equipmentOptions[slot];
      assert.ok(options.length > 0, `Area ${area.number} needs at least one ${slot} option`);
      assert.ok(options.every((option) => option.slot === slot && area.itemFamilies[slot].includes(option.materialFamily)));
      assert.ok(options.every((option) => visualAsset(option.visualAssetId, 'item')));
    }
    assert.ok(Object.values(profile.rarityWeights).some((weight) => weight > 0));
  }
});

test('Areas 1 through 4 steadily improve encounter and reward quality', () => {
  for (let index = 1; index < AREA_CONTENT.length; index += 1) {
    const prior = AREA_CONTENT[index - 1];
    const next = AREA_CONTENT[index];
    const priorHunts = prior.huntEncounters;
    const nextHunts = next.huntEncounters;
    for (const [field, values] of Object.entries({
      hp: [Math.max(...priorHunts.map((enemy) => enemy.hp)), Math.min(...nextHunts.map((enemy) => enemy.hp))],
      attack: [Math.max(...priorHunts.map((enemy) => enemy.attack)), Math.min(...nextHunts.map((enemy) => enemy.attack))],
      experience: [Math.max(...priorHunts.map((enemy) => enemy.experience)), Math.min(...nextHunts.map((enemy) => enemy.experience))],
      gold: [Math.max(...priorHunts.map((enemy) => enemy.gold)), Math.min(...nextHunts.map((enemy) => enemy.gold))],
      dropChance: [Math.max(...priorHunts.map((enemy) => enemy.dropChance)), Math.min(...nextHunts.map((enemy) => enemy.dropChance))],
    })) assert.ok(values[1] > values[0], `Area ${next.number} minimum ${field} should exceed Area ${prior.number} maximum`);
    assert.ok(next.adventureRewards.gold > prior.adventureRewards.gold);
    assert.ok(next.adventureRewards.experience > prior.adventureRewards.experience);
    assert.ok(next.adventureRewards.dropChance > prior.adventureRewards.dropChance);
    const priorRarePlus = Object.entries(prior.rarityWeights).filter(([rarity]) => rarityTier(rarity) >= 3).reduce((sum, [, weight]) => sum + weight, 0);
    const nextRarePlus = Object.entries(next.rarityWeights).filter(([rarity]) => rarityTier(rarity) >= 3).reduce((sum, [, weight]) => sum + weight, 0);
    assert.ok(nextRarePlus > priorRarePlus, `Area ${next.number} should improve rare-or-better odds`);
  }

  const generator = new ItemGenerator({ rng: () => 0.5, idFactory: () => 'quality-comparison' });
  const areaOne = generator.generateReward({ source: 'area-quality-check', slot: 'weapon', ...itemRewardProfileForArea(1) });
  const areaFour = generator.generateReward({ source: 'area-quality-check', slot: 'weapon', ...itemRewardProfileForArea(4) });
  assert.equal(areaOne.rarity, 'common');
  assert.equal(areaFour.rarity, 'rare');
  assert.ok(areaFour.attackBonus > areaOne.attackBonus);
  assert.ok(areaFour.equipmentBudget.limit > areaOne.equipmentBudget.limit);
});

test('progression challenges form the authored two-human Brightbell chain from Areas 1 through 4', () => {
  const challengeRows = [1, 2, 3].map((areaNumber) => progressionChallengeForArea(areaNumber));
  assert.deepEqual(challengeRows.map((challenge) => [challenge.id, challenge.dungeonId, challenge.unlocksAreaNumber]), [
    ['meadow-bell-gate', 'brightbell-trial', 2],
    ['orchard-bell-gate', 'emberglass-procession', 3],
    ['summit-bell-gate', 'kitewind-summit', 4],
  ]);
  assert.ok(challengeRows.every((challenge) => challenge.requiredHumanPlayers === 2));
  assert.equal(progressionChallengeForArea(4), null);
  for (const challenge of challengeRows) assert.equal(progressionChallengeForDungeon(challenge.dungeonId).id, challenge.id);
});
