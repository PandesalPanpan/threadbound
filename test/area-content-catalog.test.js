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
