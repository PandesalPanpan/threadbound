import test from 'node:test';
import assert from 'node:assert/strict';
import { generatedEquipmentOptions } from '../src/content/GeneratedEquipmentCatalog.js';
import { AREA_CONTENT, itemRewardProfileForArea } from '../src/content/AreaContentCatalog.js';
import { EQUIPMENT_SLOTS } from '../src/domain/EquipmentSlotPolicy.js';
import { ItemGenerator } from '../src/domain/ItemGenerator.js';
import { rarityFromWeightedRoll } from '../src/domain/ItemRarityPolicy.js';
import { arcEquipmentBudgetUsed } from '../src/domain/ArcEquipmentTemplatePolicy.js';
import { capAdventureLoot } from '../src/domain/AdventureRewardPolicy.js';
import { publicItemProjection } from '../src/application/GameService.js';
import { VISUAL_ASSETS, visualAsset } from '../public/visual-asset-catalog.js';
import { SQLiteCodexRepository } from '../src/infrastructure/SQLiteCodexRepository.js';
import { SQLiteEquipmentRepository } from '../src/infrastructure/SQLiteEquipmentRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

const officialItemIds = new Set(VISUAL_ASSETS.filter((asset) => asset.kind === 'item').map((asset) => asset.id));

test('generated rewards cover all slots with slot-specific stats and official semantic visuals', () => {
  const equipmentOptions = generatedEquipmentOptions();
  for (const slot of EQUIPMENT_SLOTS) {
    const generator = new ItemGenerator({ rng: () => 0, idFactory: () => `generated-${slot}`, equipmentOptions });
    const item = generator.generateReward({ source: 'test', slot, areaNumber: 2 });
    assert.equal(item.slot, slot);
    assert.equal(item.areaNumber, 2);
    assert.ok(officialItemIds.has(item.visualAssetId), `${item.visualAssetId} should be in the official visual catalog`);
    const visual = visualAsset(item.visualAssetId, 'item');
    assert.ok(visual);
    assert.equal(visual.provenance.sourceCollection, 'figma-item-library-v1');
    assert.equal(item.itemFamily != null, true);
    assert.equal(item.materialFamily != null, true);
    assert.deepEqual(item.effect.equipmentTemplate.stats, {
      attackBonus: item.attackBonus,
      defenseBonus: item.defenseBonus,
      maxHpBonus: item.maxHpBonus,
      speedBonus: item.speedBonus,
      critChanceBonus: item.critChanceBonus,
    });
    if (slot === 'weapon') {
      assert.ok(item.attackBonus > 0);
      assert.ok(item.weaponFamily);
    } else if (slot === 'helmet' || slot === 'armor') {
      assert.ok(item.defenseBonus > 0);
      assert.ok(item.maxHpBonus > 0);
      assert.equal(item.attackBonus, 0);
    } else if (slot === 'boots') {
      assert.ok(item.speedBonus > 0);
      assert.equal(item.attackBonus, 0);
    } else {
      assert.ok(item.critChanceBonus > 0);
      assert.equal(item.attackBonus, 0);
    }
  }
});

test('Area family options filter data-only official item templates and weighted rarity respects zero weights', () => {
  const itemFamilies = {
    weapon: ['wood'],
    helmet: ['leather'],
    armor: ['wood'],
    boots: ['leather'],
    accessory: ['lucky'],
  };
  const options = generatedEquipmentOptions({ itemFamilies });
  for (const slot of EQUIPMENT_SLOTS) {
    assert.ok(options[slot].length > 0);
    assert.ok(options[slot].every((item) => itemFamilies[slot].includes(item.materialFamily)));
    assert.ok(options[slot].every((item) => officialItemIds.has(item.visualAssetId)));
  }
  const generator = new ItemGenerator({ rng: () => 0.5, idFactory: () => 'rare-area-item', equipmentOptions: options });
  const item = generator.generateReward({ source: 'hunt', areaNumber: 1, slot: 'accessory', rarityWeights: { common: 0, uncommon: 0, rare: 1, epic: 0 } });
  assert.equal(item.rarity, 'rare');
  assert.equal(item.materialFamily, 'lucky');
  assert.equal(rarityFromWeightedRoll(0.5, { common: 0, uncommon: 0, rare: 0, epic: 1 }).id, 'epic');
  assert.equal(rarityFromWeightedRoll(0, { common: Number.POSITIVE_INFINITY, rare: 1 }).id, 'rare');
});

test('every configured Area can generate official material families in all five slots', () => {
  for (const area of AREA_CONTENT) {
    const equipmentOptions = generatedEquipmentOptions({ itemFamilies: area.itemFamilies });
    for (const slot of EQUIPMENT_SLOTS) {
      const item = new ItemGenerator({ rng: () => 0, idFactory: () => `${area.id}-${slot}`, equipmentOptions })
        .generateReward({ source: 'area-test', areaNumber: area.number, slot, rarityWeights: area.rarityWeights });
      assert.equal(item.areaNumber, area.number);
      assert.ok(area.itemFamilies[slot].includes(item.materialFamily), `${area.id} ${slot} returned ${item.materialFamily}`);
      assert.ok(officialItemIds.has(item.visualAssetId));
    }
  }
});

test('Area and rolled rarity narrow generated rewards to the matching official material family', () => {
  const cases = [
    { areaNumber: 1, slot: 'weapon', rarity: 'common', materialFamily: 'wood' },
    { areaNumber: 1, slot: 'weapon', rarity: 'rare', materialFamily: 'iron' },
    { areaNumber: 2, slot: 'armor', rarity: 'common', materialFamily: 'steel' },
    { areaNumber: 2, slot: 'armor', rarity: 'rare', materialFamily: 'nature' },
    { areaNumber: 3, slot: 'weapon', rarity: 'common', materialFamily: 'fire' },
    { areaNumber: 3, slot: 'weapon', rarity: 'epic', materialFamily: 'arcane' },
    { areaNumber: 4, slot: 'accessory', rarity: 'common', materialFamily: 'void' },
    { areaNumber: 4, slot: 'accessory', rarity: 'mythic', materialFamily: 'angel' },
  ];

  for (const { areaNumber, slot, rarity, materialFamily } of cases) {
    const profile = itemRewardProfileForArea(areaNumber);
    const eligible = profile.equipmentOptionsByRarity[rarity][slot];
    assert.ok(eligible.length > 0, `Area ${areaNumber} ${rarity} ${slot} must have official eligible art`);
    assert.ok(eligible.every((option) => option.materialFamily === materialFamily));
    assert.ok(eligible.every((option) => visualAsset(option.visualAssetId, 'item')?.provenance.sourceCollection === 'figma-item-library-v1'));

    const item = new ItemGenerator({ rng: () => 0, idFactory: () => `${areaNumber}-${rarity}-${slot}` })
      .generateReward({
        source: 'area-rarity-family-test',
        slot,
        ...profile,
        rarityWeights: { [rarity]: 1 },
      });
    assert.equal(item.rarity, rarity);
    assert.equal(item.areaNumber, areaNumber);
    assert.equal(item.materialFamily, materialFamily);
    assert.ok(officialItemIds.has(item.visualAssetId));
  }

  assert.notEqual(
    itemRewardProfileForArea(1).equipmentOptionsByRarity.common.weapon[0].materialFamily,
    itemRewardProfileForArea(1).equipmentOptionsByRarity.rare.weapon[0].materialFamily,
  );
  assert.notEqual(
    itemRewardProfileForArea(1).equipmentOptionsByRarity.common.weapon[0].visualAssetId,
    itemRewardProfileForArea(4).equipmentOptionsByRarity.common.weapon[0].visualAssetId,
  );
});

test('ordinary loot keeps generated rarity, slot stats, and nested budget consistent', () => {
  const rolls = [0.997, 0, 0, 0];
  let rollIndex = 0;
  const area = AREA_CONTENT.find((entry) => entry.number === 4);
  const generated = new ItemGenerator({
    rng: () => rolls[rollIndex++] ?? 0,
    idFactory: () => 'mythic-area-helmet',
    equipmentOptions: generatedEquipmentOptions({ itemFamilies: area.itemFamilies }),
  }).generateReward({ source: 'hunt', areaNumber: area.number, slot: 'helmet', rarityWeights: area.rarityWeights });
  const preserved = capAdventureLoot(generated);
  const template = preserved.effect.equipmentTemplate;

  assert.equal(preserved.rarity, 'mythic');
  assert.equal(preserved.rarityTier, 6);
  assert.deepEqual(template.stats, {
    attackBonus: preserved.attackBonus,
    defenseBonus: preserved.defenseBonus,
    maxHpBonus: preserved.maxHpBonus,
    speedBonus: preserved.speedBonus,
    critChanceBonus: preserved.critChanceBonus,
  });
  assert.deepEqual(preserved.equipmentBudget, template.budget);
  assert.equal(template.budget.used, arcEquipmentBudgetUsed({ stats: template.stats, effects: template.effectCodes }));
  assert.equal(template.budget.used, template.budget.limit);
});

test('dungeon reward projection carries every canonical equipment bonus', () => {
  const projected = publicItemProjection({
    id: 'reward-armor',
    name: 'Runed Mirror Armor',
    slot: 'armor',
    rarity: 'epic',
    visualAssetId: 'item.void-armor.v1',
    attackBonus: 0,
    defenseBonus: 3,
    maxHpBonus: 12,
    speedBonus: 2,
    critChanceBonus: 0.04,
  });

  assert.deepEqual({
    attackBonus: projected.attackBonus,
    defenseBonus: projected.defenseBonus,
    maxHpBonus: projected.maxHpBonus,
    speedBonus: projected.speedBonus,
    critChanceBonus: projected.critChanceBonus,
  }, {
    attackBonus: 0,
    defenseBonus: 3,
    maxHpBonus: 12,
    speedBonus: 2,
    critChanceBonus: 0.04,
  });

  const nestedProjection = publicItemProjection({
    stats: { attackBonus: 2, defenseBonus: 1, maxHpBonus: 8, speedBonus: 3, critChanceBonus: 0.02 },
  });
  assert.deepEqual([
    nestedProjection.attackBonus,
    nestedProjection.defenseBonus,
    nestedProjection.maxHpBonus,
    nestedProjection.speedBonus,
    nestedProjection.critChanceBonus,
  ], [2, 1, 8, 3, 0.02]);
});

test('Inventory, Equipment, and Codex repositories share one complete SQLite item mapping', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-item-map' });
  try {
    const player = repository.getOrCreatePlayer({ threadedUserId: 'map-user', displayName: 'Adventurer' });
    const equipment = new SQLiteEquipmentRepository({ database: repository.db });
    const codex = new SQLiteCodexRepository({ database: repository.db });
    const item = {
      id: 'item-all-stats',
      definitionId: 'test-all-stats',
      name: 'Runed Oak Sword',
      slot: 'weapon',
      rarity: 'epic',
      attackBonus: 4,
      effectCode: 'frost_edge',
      effect: {
        code: 'frost_edge',
        name: 'Frost Edge',
        description: 'Test item projection.',
        equipmentTemplate: {
          effectCodes: ['frost_edge'],
          weaponFamily: 'sword',
          itemFamily: 'sword',
          materialFamily: 'wood',
          requiredLevel: 3,
          areaNumber: 2,
          stats: { attackBonus: 4, defenseBonus: 1, maxHpBonus: 7, speedBonus: 2, critChanceBonus: 0.08 },
          budget: { used: 7, limit: 8 },
        },
      },
      visualAssetId: 'item.ashbite-sword.v1',
      source: 'hunt',
    };
    repository.addItem(player.id, item);
    equipment.equip(player.id, item.id);

    const inventoryProjection = repository.getItem(item.id);
    const equipmentProjection = equipment.getLoadout(player.id).weapon;
    const codexProjection = codex.listCodexItems().find((entry) => entry.id === item.id);
    assert.deepEqual(equipmentProjection, inventoryProjection);
    assert.deepEqual(codexProjection, inventoryProjection);
    assert.equal(inventoryProjection.attackBonus, 4);
    assert.equal(inventoryProjection.defenseBonus, 1);
    assert.equal(inventoryProjection.maxHpBonus, 7);
    assert.equal(inventoryProjection.speedBonus, 2);
    assert.equal(inventoryProjection.critChanceBonus, 0.08);
    assert.equal(inventoryProjection.rarityTier, 4);
    assert.equal(inventoryProjection.weaponFamily, 'sword');
    assert.equal(inventoryProjection.materialFamily, 'wood');
    assert.equal(inventoryProjection.visualAssetId, 'item.ashbite-sword.v1');

    repository.db.prepare(`
      INSERT INTO items (id, player_id, definition_id, name, slot, rarity, attack_bonus, effect_code, effect_json, visual_asset_id, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
    `).run('legacy-item', player.id, 'legacy', 'Old Needle', 'weapon', 'common', 2, 'none', '{not-json', 'legacy');
    const legacy = repository.getItem('legacy-item');
    assert.equal(legacy.attackBonus, 2);
    assert.equal(legacy.defenseBonus, 0);
    assert.equal(legacy.maxHpBonus, 0);
    assert.equal(legacy.speedBonus, 0);
    assert.equal(legacy.critChanceBonus, 0);
    assert.deepEqual(legacy.effectCodes, ['none']);
    assert.equal(legacy.visualAssetId, null);
    assert.equal(legacy.weaponFamily, null);
    assert.equal(legacy.requiredLevel, 1);
    assert.equal(legacy.areaNumber, 1);
  } finally {
    repository.close();
  }
});
