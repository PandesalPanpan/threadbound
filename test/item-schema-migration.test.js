import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { resolveShellAsset } from '../frontend/src/shell/presentation.js';
import { VISUAL_ASSETS } from '../public/visual-asset-catalog.js';
import { deriveCharacterStats } from '../src/domain/CharacterStatPolicy.js';
import { SQLiteEquipmentRepository } from '../src/infrastructure/SQLiteEquipmentRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

test('legacy items table gains visual_asset_id idempotently and preserves old rows', () => {
  const directory = mkdtempSync(join(tmpdir(), 'threadbound-item-schema-'));
  const filename = join(directory, 'game.sqlite');
  let legacyDatabase = null;
  let repository = null;
  try {
    legacyDatabase = new DatabaseSync(filename);
    legacyDatabase.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE players (
        id TEXT PRIMARY KEY,
        threaded_user_id TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        base_attack INTEGER NOT NULL,
        max_health INTEGER NOT NULL,
        thread_dust INTEGER NOT NULL DEFAULT 0,
        equipped_item_id TEXT NULL
      );
      CREATE TABLE items (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        definition_id TEXT NOT NULL,
        name TEXT NOT NULL,
        slot TEXT NOT NULL,
        rarity TEXT NOT NULL,
        attack_bonus INTEGER NOT NULL,
        effect_code TEXT NOT NULL,
        effect_json TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO players (id, threaded_user_id, display_name, base_attack, max_health)
      VALUES ('legacy-player', 'legacy-user', 'Legacy Player', 6, 40);
    `);
    legacyDatabase.prepare(`
      INSERT INTO items (id, player_id, definition_id, name, slot, rarity, attack_bonus, effect_code, effect_json, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'legacy-armor',
      'legacy-player',
      'old-armor',
      'Ironroot Cuirass',
      'armor',
      'rare',
      0,
      'none',
      JSON.stringify({ code: 'none', name: 'Plain Weave', description: 'Old item effect.' }),
      'legacy',
    );
    legacyDatabase.close();
    legacyDatabase = null;

    repository = new SQLiteGameRepository({ filename });
    const columns = repository.db.prepare('PRAGMA table_info(items)').all();
    assert.equal(columns.filter((column) => column.name === 'visual_asset_id').length, 1);
    const item = repository.getItem('legacy-armor');
    assert.equal(item.name, 'Ironroot Cuirass');
    assert.equal(item.attackBonus, 0);
    assert.equal(item.defenseBonus, 0);
    assert.equal(item.maxHpBonus, 0);
    assert.equal(item.visualAssetId, null);
    assert.equal(resolveShellAsset(item, VISUAL_ASSETS, ['item'])?.id, 'item.ironroot-cuirass.v1');
    repository.close();
    repository = null;

    repository = new SQLiteGameRepository({ filename });
    const reopenedColumns = repository.db.prepare('PRAGMA table_info(items)').all();
    assert.equal(reopenedColumns.filter((column) => column.name === 'visual_asset_id').length, 1);
    assert.deepEqual(
      (({ id, playerId, name, slot, rarity, attackBonus, visualAssetId }) => ({ id, playerId, name, slot, rarity, attackBonus, visualAssetId }))(repository.getItem('legacy-armor')),
      {
        id: 'legacy-armor',
        playerId: 'legacy-player',
        name: 'Ironroot Cuirass',
        slot: 'armor',
        rarity: 'rare',
        attackBonus: 0,
        visualAssetId: null,
      },
    );
  } finally {
    legacyDatabase?.close();
    repository?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('equipped non-Weapon extended stats survive SQLite close and reopen', () => {
  const directory = mkdtempSync(join(tmpdir(), 'threadbound-item-roundtrip-'));
  const filename = join(directory, 'game.sqlite');
  let repository = null;
  try {
    repository = new SQLiteGameRepository({ filename, idFactory: () => 'roundtrip-player' });
    const player = repository.getOrCreatePlayer({ threadedUserId: 'roundtrip-user', displayName: 'Armor Tester' });
    const equipment = new SQLiteEquipmentRepository({ database: repository.db });
    const armor = {
      id: 'roundtrip-armor',
      definitionId: 'area-4-armor',
      name: 'Runed Mirror Armor',
      slot: 'armor',
      rarity: 'epic',
      attackBonus: 0,
      effectCode: 'frost_edge',
      effect: {
        code: 'frost_edge',
        equipmentTemplate: {
          effectCodes: ['frost_edge'],
          itemFamily: 'armor',
          materialFamily: 'holy',
          requiredLevel: 16,
          areaNumber: 4,
          stats: { attackBonus: 0, defenseBonus: 2, maxHpBonus: 12, speedBonus: 1, critChanceBonus: 0.02 },
          budget: { used: 9, limit: 9 },
        },
      },
      visualAssetId: 'item.cinder-mantle.v1',
      source: 'hunt',
    };
    repository.addItem(player.id, armor);
    equipment.equip(player.id, armor.id);
    repository.close();
    repository = null;

    repository = new SQLiteGameRepository({ filename });
    const reopenedEquipment = new SQLiteEquipmentRepository({ database: repository.db });
    const reopenedItem = reopenedEquipment.getLoadout(player.id).armor;
    assert.deepEqual({
      attackBonus: reopenedItem.attackBonus,
      defenseBonus: reopenedItem.defenseBonus,
      maxHpBonus: reopenedItem.maxHpBonus,
      speedBonus: reopenedItem.speedBonus,
      critChanceBonus: reopenedItem.critChanceBonus,
      visualAssetId: reopenedItem.visualAssetId,
      areaNumber: reopenedItem.areaNumber,
      requiredLevel: reopenedItem.requiredLevel,
      materialFamily: reopenedItem.materialFamily,
    }, {
      attackBonus: 0,
      defenseBonus: 2,
      maxHpBonus: 12,
      speedBonus: 1,
      critChanceBonus: 0.02,
      visualAssetId: 'item.cinder-mantle.v1',
      areaNumber: 4,
      requiredLevel: 16,
      materialFamily: 'holy',
    });
    assert.equal(repository.getPlayer(player.id).maxHealth, 52);
    assert.deepEqual(deriveCharacterStats({
      baseAttack: 6,
      maxHealth: 40,
      equipment: reopenedEquipment.getLoadout(player.id),
    }), {
      attack: 6,
      defense: 4,
      maxHp: 52,
      speed: 11,
      critChance: 0.07,
      critChancePercent: 7,
    });
  } finally {
    repository?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
