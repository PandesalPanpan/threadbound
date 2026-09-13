import test from 'node:test';
import assert from 'node:assert/strict';
import { ArcManifestService } from '../src/application/ArcManifestService.js';
import { SQLiteArcManifestRepository } from '../src/infrastructure/SQLiteArcManifestRepository.js';
import { SQLiteCodexRepository } from '../src/infrastructure/SQLiteCodexRepository.js';
import { SQLiteEquipmentRepository } from '../src/infrastructure/SQLiteEquipmentRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { deriveCharacterStats } from '../src/domain/CharacterStatPolicy.js';
import { equipmentEffectCodesFromCombatant } from '../src/domain/EquipmentBattleEffectPolicy.js';
import { normalizeArcEquipmentTemplate } from '../src/domain/ArcEquipmentTemplatePolicy.js';

function extendedTemplate(overrides = {}) {
  return {
    id: 'mythic-cinder-helm',
    namePattern: 'Cinder Helm of {suffix}',
    slot: 'helmet',
    rarity: 'mythic',
    attackBonus: 0,
    stats: {
      attackBonus: 0,
      defenseBonus: 2,
      maxHpBonus: 8,
      speedBonus: 1,
      critChanceBonus: 0.02,
    },
    effects: ['frost_edge', 'mind_edge'],
    requiredLevel: 20,
    areaNumber: 3,
    visualAssetId: 'item.fire-dagger.v1',
    ...overrides,
  };
}

function manifestWithTemplate(template = extendedTemplate()) {
  return {
    manifestVersion: 1,
    arc: {
      id: 'equipment-template-test',
      title: 'Equipment Template Test',
      premise: 'A validation fixture for generated equipment.',
      progression: { metric: 'dungeon_clears', target: 1 },
    },
    lore: [],
    enemies: [{ id: 'equipment-test-enemy', name: 'Test Enemy', baseHp: 8, retaliation: 1, abilities: ['basic_retaliation'] }],
    bosses: [{ id: 'equipment-test-boss', name: 'Test Boss', baseHp: 16, retaliation: 2, abilities: ['basic_retaliation'] }],
    dungeons: [{ id: 'equipment-test-vault', name: 'Test Vault', recommendedPlayers: 1, encounters: ['equipment-test-enemy'], bossId: 'equipment-test-boss', rewardPoolId: 'equipment-test-pool' }],
    itemPools: [{ id: 'equipment-test-pool', items: [template] }],
    achievements: [],
    historicalConsequences: [],
  };
}

function setup() {
  let id = 0;
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => `arc-equipment-player-${++id}` });
  const codexRepository = new SQLiteCodexRepository({ database: gameRepository.db });
  const manifestRepository = new SQLiteArcManifestRepository({ database: gameRepository.db });
  const service = new ArcManifestService({
    gameRepository,
    codexRepository,
    manifestRepository,
    bundledManifests: [],
    idFactory: () => `arc-equipment-${++id}`,
    rng: () => 0,
  });
  return { gameRepository, manifestRepository, service };
}

test('extended Arc equipment uses canonical slot, rarity, stats, effects, and progression budget', () => {
  const normalized = normalizeArcEquipmentTemplate(extendedTemplate());
  assert.equal(normalized.extended, true);
  assert.equal(normalized.slot, 'helmet');
  assert.equal(normalized.rarity, 'mythic');
  assert.deepEqual(normalized.stats, {
    attackBonus: 0,
    defenseBonus: 2,
    maxHpBonus: 8,
    speedBonus: 1,
    critChanceBonus: 0.02,
  });
  assert.deepEqual(normalized.effects, ['frost_edge', 'mind_edge']);
  assert.deepEqual(normalized.budget, { used: 9, limit: 10 });
});

test('Arc Manifest service rejects over-budget, partial, executable-looking, and misleading slot stats', () => {
  const { gameRepository, service } = setup();

  const overBudget = extendedTemplate({
    stats: { attackBonus: 0, defenseBonus: 20, maxHpBonus: 8, speedBonus: 1, critChanceBonus: 0.02 },
  });
  let validation = service.validate(manifestWithTemplate(overBudget));
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.code === 'invalid_equipment_template' && /power budget/i.test(error.message)));

  const partial = extendedTemplate();
  delete partial.areaNumber;
  validation = service.validate(manifestWithTemplate(partial));
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.code === 'invalid_equipment_template' && /areaNumber/i.test(error.message)));

  const executable = extendedTemplate({ script: 'player.attack += 9999' });
  validation = service.validate(manifestWithTemplate(executable));
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.code === 'invalid_equipment_template' && /unsupported equipment template field: script/i.test(error.message)));

  const misleading = extendedTemplate({
    attackBonus: 1,
    stats: { attackBonus: 1, defenseBonus: 2, maxHpBonus: 4, speedBonus: 0, critChanceBonus: 0 },
  });
  validation = service.validate(manifestWithTemplate(misleading));
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.code === 'invalid_equipment_template' && /only Weapon templates/i.test(error.message)));

  const excessiveCrit = extendedTemplate({
    requiredLevel: 100,
    areaNumber: 100,
    stats: { attackBonus: 0, defenseBonus: 0, maxHpBonus: 0, speedBonus: 0, critChanceBonus: 1.01 },
    effects: [],
  });
  validation = service.validate(manifestWithTemplate(excessiveCrit));
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.code === 'invalid_equipment_template' && /Crit Chance bonus.*between 0 and 1/i.test(error.message)));

  gameRepository.close();
});

test('extended equipment requires a typed item visual and legacy weapon templates remain valid', () => {
  const { gameRepository, service } = setup();
  const missingVisual = extendedTemplate();
  delete missingVisual.visualAssetId;
  let validation = service.validate(manifestWithTemplate(missingVisual));
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.code === 'equipment_visual_asset_required'));

  validation = service.validate(manifestWithTemplate(extendedTemplate({ visualAssetId: 'boss.lava-titan.v1' })));
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.code === 'unknown_visual_asset'));

  const legacy = {
    id: 'legacy-ember-needle',
    namePattern: 'Legacy Ember Needle of {suffix}',
    rarity: 'rare',
    attackBonus: 3,
    effects: ['boss_bane'],
    visualAssetId: 'item.fire-dagger.v1',
  };
  validation = service.validate(manifestWithTemplate(legacy));
  assert.equal(validation.valid, true);
  assert.ok(validation.warnings.some((warning) => warning.code === 'legacy_equipment_template'));
  gameRepository.close();
});

test('published Arc reward materializes and persists all equipment stats and effect codes', () => {
  const { gameRepository, service } = setup();
  const saved = service.saveDraft(manifestWithTemplate());
  service.publish(saved.id);
  const reward = service.generateReward('equipment-test-vault');

  assert.equal(reward.slot, 'helmet');
  assert.equal(reward.rarity, 'mythic');
  assert.equal(reward.rarityTier, 6);
  assert.equal(reward.attackBonus, 0);
  assert.equal(reward.defenseBonus, 2);
  assert.equal(reward.maxHpBonus, 8);
  assert.equal(reward.speedBonus, 1);
  assert.equal(reward.critChanceBonus, 0.02);
  assert.deepEqual(reward.effectCodes, ['frost_edge', 'mind_edge']);
  assert.equal(reward.requiredLevel, 20);
  assert.equal(reward.areaNumber, 3);
  assert.deepEqual(reward.equipmentBudget, { used: 9, limit: 10 });

  const player = gameRepository.getOrCreatePlayer({ threadedUserId: 'arc-equipment-owner', displayName: 'Arc Equipment Owner' });
  gameRepository.addItem(player.id, reward);
  const equipmentRepository = new SQLiteEquipmentRepository({ database: gameRepository.db });
  equipmentRepository.equip(player.id, reward.id);
  const loadout = equipmentRepository.getLoadout(player.id);
  assert.equal(loadout.helmet.defenseBonus, 2);
  assert.equal(loadout.helmet.maxHpBonus, 8);
  assert.equal(loadout.helmet.speedBonus, 1);
  assert.equal(loadout.helmet.critChanceBonus, 0.02);
  assert.deepEqual(loadout.helmet.effectCodes, ['frost_edge', 'mind_edge']);
  assert.equal(loadout.helmet.requiredLevel, 20);
  assert.equal(loadout.helmet.areaNumber, 3);

  const stats = deriveCharacterStats({ baseAttack: player.baseAttack, maxHealth: player.maxHealth, equipment: loadout });
  assert.deepEqual(stats, {
    attack: 6,
    defense: 4,
    maxHp: 48,
    speed: 11,
    critChance: 0.07,
    critChancePercent: 7,
  });
  assert.deepEqual(equipmentEffectCodesFromCombatant({ equipment: loadout }), ['frost_edge', 'mind_edge']);
  gameRepository.close();
});

test('world context publishes the equipment authoring contract and budget rules', () => {
  const { gameRepository, service } = setup();
  const context = service.worldContext();
  assert.deepEqual(context.allowedMechanics.equipmentTemplates.slots, ['weapon', 'helmet', 'armor', 'boots', 'accessory']);
  assert.ok(context.allowedMechanics.equipmentTemplates.rarities.includes('mythic'));
  assert.deepEqual(context.allowedMechanics.equipmentTemplates.statKeys, ['attackBonus', 'defenseBonus', 'maxHpBonus', 'speedBonus', 'critChanceBonus']);
  assert.ok(context.allowedMechanics.equipmentTemplates.effectCodes.includes('frost_edge'));
  assert.equal(context.balanceBudgets.equipmentTemplates.maxEffectsPerItem, 3);
  assert.equal(context.balanceBudgets.equipmentTemplates.maxCritChanceBonus, 1);
  assert.ok(context.generationRules.some((rule) => /rarity\/level\/Area power budget/i.test(rule)));
  gameRepository.close();
});
