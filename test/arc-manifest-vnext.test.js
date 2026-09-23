import test from 'node:test';
import assert from 'node:assert/strict';
import { ArcManifestVNextValidator, ARC_MANIFEST_VNEXT_VERSION, publicArcManifestVNextContract } from '../src/application/ArcManifestVNextValidator.js';
import { ArcEquipmentTemplateValidator } from '../src/application/ArcEquipmentTemplateValidator.js';
import { ArcManifestValidator } from '../src/application/ArcManifestValidator.js';
import { validateArcTownShopStocks } from '../src/content/ArcTownShopCatalog.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { SQLiteCodexRepository } from '../src/infrastructure/SQLiteCodexRepository.js';
import { SQLiteArcManifestRepository } from '../src/infrastructure/SQLiteArcManifestRepository.js';
import { ArcManifestService } from '../src/application/ArcManifestService.js';
import { QuestService } from '../src/application/QuestService.js';
import { TownService } from '../src/application/TownService.js';
import { EventBus } from '../src/application/EventBus.js';
import { AUTOMATIC_BATTLE_EFFECT_TYPES } from '../src/domain/AutomaticBattleEffectPolicy.js';
import { visualAsset } from '../src/content/VisualAssetCatalog.js';

function equipment(id, overrides = {}) {
  return {
    id,
    namePattern: `${id} of {suffix}`,
    slot: 'weapon',
    rarity: 'common',
    attackBonus: 1,
    stats: { attackBonus: 1, defenseBonus: 0, maxHpBonus: 0, speedBonus: 0, critChanceBonus: 0 },
    effects: [],
    requiredLevel: 1,
    areaNumber: 1,
    visualAssetId: 'item.fire-dagger.v1',
    ...overrides,
  };
}

function manifestV2() {
  return {
    manifestVersion: 2,
    arc: { id: 'vnext-test-arc', title: 'VNext Test Arc', premise: 'A complete generated-world contract fixture.', progression: { metric: 'dungeon_clears', target: 1 } },
    lore: [{ id: 'vnext-road-note', title: 'A Bell Along the Road', summary: 'Roadside bells carry a warning between towns.', body: 'The bells answer one another across the petals.', tags: ['vnext-road'] }],
    enemies: [{ id: 'vnext-enemy', name: 'VNext Enemy', baseHp: 8, retaliation: 1, abilities: ['basic_retaliation'], resistances: { fire: 'resistant', psychic: 'immune' } }],
    bosses: [{ id: 'vnext-boss', name: 'VNext Boss', baseHp: 16, retaliation: 2, abilities: ['basic_retaliation'], resistances: { poison: 'high-resistant' } }],
    dungeons: [{ id: 'vnext-dungeon', name: 'VNext Dungeon', recommendedPlayers: 2, encounters: ['vnext-enemy'], bossId: 'vnext-boss', rewardPoolId: 'vnext-pool' }],
    itemPools: [{ id: 'vnext-pool', items: [equipment('vnext-blade'), equipment('vnext-helm', { slot: 'helmet', attackBonus: 0, stats: { attackBonus: 0, defenseBonus: 1, maxHpBonus: 0, speedBonus: 0, critChanceBonus: 0 } })] }],
    achievements: [],
    historicalConsequences: [],
    areas: [{ id: 'vnext-area-1', number: 1, name: 'Sunpetal Road', recommendedLevel: { min: 1, max: 8 }, loreTags: ['vnext-road'] }],
    towns: [{ id: 'vnext-town-1', areaId: 'vnext-area-1', name: 'Petalrest' }],
    npcs: [{ id: 'vnext-smith', townId: 'vnext-town-1', name: 'Mina', role: 'blacksmith', visualAssetId: 'character.road-sellsword.v1' }],
    quests: [{ id: 'vnext-quest-1', areaId: 'vnext-area-1', title: 'Meet the Smith', objectives: [{ type: 'speak', targetId: 'vnext-smith', count: 1 }] }],
    shopStocks: [{ id: 'vnext-stock', townId: 'vnext-town-1', areaNumber: 1, offers: [{ sku: 'blade', itemTemplateId: 'vnext-blade', cost: 20 }] }],
    shops: [{ id: 'vnext-shop', townId: 'vnext-town-1', name: 'Petalrest Outfitters', stockId: 'vnext-stock' }],
    craftingRecipes: [{ id: 'vnext-craft', name: 'Helm Forging', areaNumber: 1, ingredients: [{ itemDefinitionId: 'vnext-blade', quantity: 1 }], output: { itemDefinitionId: 'vnext-helm', quantity: 1 } }],
    cookingRecipes: [{ id: 'vnext-stew', name: 'Petal Stew', areaNumber: 1, ingredients: [{ itemDefinitionId: 'vnext-blade', quantity: 1 }], buff: { code: 'attack_boost_minor', fights: 3 } }],
    progressionChallenges: [{ id: 'vnext-gate', areaId: 'vnext-area-1', unlocksAreaId: null, dungeonId: 'vnext-dungeon', requiresBothHumans: true, recommendedLevel: { min: 5, max: 8 } }],
  };
}

test('Arc Manifest vNext accepts the complete generated-world contract and projects safely through the legacy validator', () => {
  const manifest = manifestV2();
  const validator = new ArcManifestVNextValidator();
  const result = validator.validate(manifest);
  assert.equal(result.valid, true, JSON.stringify(result.errors));

  const equipmentValidator = new ArcEquipmentTemplateValidator();
  const equipmentResult = equipmentValidator.validate(manifest);
  assert.equal(equipmentResult.valid, true, JSON.stringify(equipmentResult.errors));

  const projected = equipmentValidator.projectForLegacyValidator(manifest);
  assert.equal(projected.manifestVersion, 1);
  const legacyResult = new ArcManifestValidator().validate(projected);
  assert.equal(legacyResult.valid, true, JSON.stringify(legacyResult.errors));

  const shopResult = validateArcTownShopStocks(manifest);
  assert.equal(shopResult.valid, true, JSON.stringify(shopResult.errors));
});

test('Arc Manifest vNext fails closed on broken world references, invalid effect vocabulary, unsafe progression defaults, and recipe references', () => {
  const manifest = manifestV2();
  manifest.towns[0].areaId = 'missing-area';
  manifest.enemies[0].resistances = { lightning: 'immune' };
  manifest.progressionChallenges[0].requiresBothHumans = false;
  manifest.craftingRecipes[0].ingredients[0].itemDefinitionId = 'missing-item';

  const result = new ArcManifestVNextValidator().validate(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'unknown_area_reference'));
  assert.ok(result.errors.some((error) => error.code === 'invalid_effect_resistance'));
  assert.ok(result.errors.some((error) => error.code === 'both_humans_required'));
  assert.ok(result.errors.some((error) => error.code === 'unknown_recipe_item'));
});

test('Arc Manifest vNext rejects Quest kill, collect, and boss objectives that cannot match game events', () => {
  const manifest = manifestV2();
  manifest.quests[0].objectives = [
    { type: 'kill', targetId: 'missing-enemy', count: 1 },
    { type: 'collect', targetId: 'missing-item', count: 1 },
    { type: 'boss', targetId: 'missing-dungeon', count: 1 },
  ];
  const result = new ArcManifestVNextValidator().validate(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'unknown_kill_target'));
  assert.ok(result.errors.some((error) => error.code === 'unknown_collect_target'));
  assert.ok(result.errors.some((error) => error.code === 'unknown_boss_target'));
});

test('Arc Manifest vNext rejects known enemies absent from the Quest Area runtime pools and accepts local targets', () => {
  const unavailable = manifestV2();
  unavailable.quests[0].objectives = [{ type: 'kill', targetId: 'vnext-enemy', count: 1 }];
  const unavailableResult = new ArcManifestVNextValidator().validate(unavailable);
  assert.equal(unavailableResult.valid, false);
  assert.ok(unavailableResult.errors.some((error) => error.code === 'kill_target_unavailable_in_area'));

  const manifest = manifestV2();
  manifest.enemies.push({ ...manifest.enemies[0], id: 'bouncebud-slime', name: 'Bouncebud Slime' });
  manifest.quests[0].objectives = [
    { type: 'kill', targetId: 'bouncebud-slime', count: 1 },
    { type: 'collect', targetId: 'vnext-blade', count: 1 },
    { type: 'boss', targetId: 'vnext-dungeon', count: 1 },
  ];
  const result = new ArcManifestVNextValidator().validate(manifest);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('runtime Arc Quests omit legacy published kill targets unavailable in their Area', () => {
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:' });
  const codexRepository = new SQLiteCodexRepository({ database: gameRepository.db });
  const manifestRepository = new SQLiteArcManifestRepository({ database: gameRepository.db });
  const service = new ArcManifestService({ gameRepository, codexRepository, manifestRepository, bundledManifests: [] });
  const invalidLegacy = manifestV2();
  invalidLegacy.quests[0].objectives = [{ type: 'kill', targetId: 'vnext-enemy', count: 1 }];
  manifestRepository.listPublished = () => [{ id: 'legacy-published-vnext', arcId: invalidLegacy.arc.id, revision: 1, manifest: invalidLegacy }];

  try {
    assert.equal(service.runtimeQuests().some((quest) => quest.id === 'vnext-quest-1'), false);
  } finally {
    gameRepository.close();
  }
});

test('Arc Manifest vNext keeps NPC artwork optional but accepts only character visual assets', () => {
  const validator = new ArcManifestVNextValidator();
  const withoutArtwork = manifestV2();
  delete withoutArtwork.npcs[0].visualAssetId;
  assert.equal(validator.validate(withoutArtwork).valid, true);

  for (const visualAssetId of ['mob.road-sellsword.v1', 'boss.road-sellsword.v1', 'item.fire-dagger.v1', 'character.not-in-catalog.v1']) {
    const invalid = manifestV2();
    invalid.npcs[0].visualAssetId = visualAssetId;
    const result = validator.validate(invalid);
    assert.equal(result.valid, false, visualAssetId);
    assert.ok(result.errors.some((error) => error.path === 'npcs[0].visualAssetId' && error.code === 'unknown_visual_asset'));
  }
});

test('legacy manifests remain supported while the public vNext contract advertises the constrained vocabulary', () => {
  const legacy = { manifestVersion: 1 };
  assert.equal(new ArcManifestVNextValidator().validate(legacy).valid, true);
  const contract = publicArcManifestVNextContract();
  assert.equal(contract.manifestVersion, ARC_MANIFEST_VNEXT_VERSION);
  assert.deepEqual(contract.supportedVersions, [1, 2]);
  assert.deepEqual(contract.effectTypes, [...AUTOMATIC_BATTLE_EFFECT_TYPES]);
  assert.ok(contract.requiredCollections.includes('areas'));
  assert.ok(contract.requiredCollections.includes('progressionChallenges'));
});

test('published v2 Town projections preserve optional NPC character art without exposing URLs', () => {
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:' });
  const codexRepository = new SQLiteCodexRepository({ database: gameRepository.db });
  const manifestRepository = new SQLiteArcManifestRepository({ database: gameRepository.db });
  const service = new ArcManifestService({ gameRepository, codexRepository, manifestRepository, bundledManifests: [] });
  const draft = service.saveDraft(manifestV2(), { source: 'vnext-town-test' });
  service.publish(draft.id);

  const allTowns = service.runtimeTowns();
  const town = allTowns.find((entry) => entry.id === 'vnext-town-1');
  assert.ok(town);
  assert.equal(town.areaNumber, 1);
  assert.equal(town.npcs[0].visualAssetId, 'character.road-sellsword.v1');
  assert.equal(Object.hasOwn(town.npcs[0], 'src'), false);
  assert.equal(service.runtimeTowns({ onlyWithExplicitNpcVisual: true }).some((entry) => entry.id === town.id), true);
  const authoredQuests = service.runtimeQuests();
  const authoredQuest = authoredQuests.find((entry) => entry.id === 'vnext-quest-1');
  assert.ok(authoredQuest);
  assert.equal(authoredQuest.areaNumber, 1);
  assert.equal(authoredQuest.description, 'Roadside bells carry a warning between towns. Objective: speak Mina.');
  assert.equal(authoredQuest.townId, town.id);
  assert.equal(authoredQuest.npcId, 'vnext-smith');
  assert.deepEqual(authoredQuest.objectives, [{ id: 'vnext-quest-1-objective-1', type: 'speak', targetId: 'vnext-smith', targetLabel: 'Mina', count: 1 }]);
  assert.ok(authoredQuest.reward.gold > 0 && authoredQuest.reward.experience > 0);

  gameRepository.close();
});

test('published no-art Arc speaker is projected with semantic character art and its Quest is completable in that Town', () => {
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:' });
  const codexRepository = new SQLiteCodexRepository({ database: gameRepository.db });
  const manifestRepository = new SQLiteArcManifestRepository({ database: gameRepository.db });
  const arcManifestService = new ArcManifestService({ gameRepository, codexRepository, manifestRepository, bundledManifests: [] });
  const eventBus = new EventBus();
  const player = gameRepository.getOrCreatePlayer({ threadedUserId: 'vnext-no-art-speaker', displayName: 'Speaker Tester' });
  const manifest = manifestV2();
  delete manifest.npcs[0].visualAssetId;
  const draft = arcManifestService.saveDraft(manifest, { source: 'vnext-no-art-speaker-test' });
  arcManifestService.publish(draft.id);
  const quests = new QuestService({ repository: gameRepository, eventBus, arcManifestService });
  const towns = new TownService({ repository: gameRepository, eventBus, arcManifestService });

  try {
    const town = towns.browse(player.id).towns.find((entry) => entry.id === 'vnext-town-1');
    assert.ok(town, 'the valid Arc Town must be available in its supported Area');
    const npc = town.npcs.find((entry) => entry.id === 'vnext-smith');
    assert.ok(npc);
    assert.ok(visualAsset(npc.visualAssetId, 'character'), 'NPC fallback must use an allowlisted semantic character asset');

    const quest = quests.browse(player.id).quests.find((entry) => entry.id === 'vnext-quest-1');
    assert.ok(quest);
    assert.equal(quest.townId, town.id);
    assert.ok(quest.objectives.some((objective) => objective.type === 'speak' && objective.targetId === npc.id));
    quests.accept(player.id, quest.id);
    towns.interact(player.id, quest.townId, npc.id);
    assert.equal(quests.browse(player.id).quests.find((entry) => entry.id === quest.id).state, 'claimable');
  } finally {
    quests.dispose();
    gameRepository.close();
  }
});
