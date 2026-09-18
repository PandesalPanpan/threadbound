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
    lore: [],
    enemies: [{ id: 'vnext-enemy', name: 'VNext Enemy', baseHp: 8, retaliation: 1, abilities: ['basic_retaliation'], resistances: { fire: 'resistant', psychic: 'immune' } }],
    bosses: [{ id: 'vnext-boss', name: 'VNext Boss', baseHp: 16, retaliation: 2, abilities: ['basic_retaliation'], resistances: { poison: 'high-resistant' } }],
    dungeons: [{ id: 'vnext-dungeon', name: 'VNext Dungeon', recommendedPlayers: 2, encounters: ['vnext-enemy'], bossId: 'vnext-boss', rewardPoolId: 'vnext-pool' }],
    itemPools: [{ id: 'vnext-pool', items: [equipment('vnext-blade'), equipment('vnext-helm', { slot: 'helmet', attackBonus: 0, stats: { attackBonus: 0, defenseBonus: 1, maxHpBonus: 0, speedBonus: 0, critChanceBonus: 0 } })] }],
    achievements: [],
    historicalConsequences: [],
    areas: [{ id: 'vnext-area-1', number: 1, name: 'Sunpetal Road', recommendedLevel: { min: 1, max: 8 } }],
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
  assert.deepEqual(contract.effectTypes, ['fire', 'poison', 'ice', 'psychic']);
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

  gameRepository.close();
});
