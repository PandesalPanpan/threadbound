import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SQLiteEquipmentRepository } from '../src/infrastructure/SQLiteEquipmentRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { SQLitePlayerProgressionRepository } from '../src/infrastructure/SQLitePlayerProgressionRepository.js';

function hpEquipment(id, slot, maxHpBonus) {
  return {
    id,
    definitionId: id,
    name: `${slot} HP gear`,
    slot,
    rarity: 'common',
    attackBonus: 0,
    effectCode: 'none',
    effect: { equipmentTemplate: { stats: { maxHpBonus }, effectCodes: ['none'] } },
    source: 'test',
  };
}

test('multi-level XP grants add exact HP delta while preserving damage and stay idempotent on reads', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'growth-player' });
  try {
    const player = repository.getOrCreatePlayer({ threadedUserId: 'growth-user', displayName: 'Adventurer' });
    const progression = new SQLitePlayerProgressionRepository({ database: repository.db });
    repository.setPlayerHealth(player.id, 17);

    const grant = progression.grantExperience(player.id, 350, { currentHealthAfterCombat: 17 });
    assert.equal(grant.progression.level, 4);
    assert.equal(grant.levelsGained, 3);
    assert.equal(grant.leveledUp, true);
    assert.equal(grant.maxHealthIncrease, 9);
    assert.equal(grant.maxHealth, 49);
    assert.equal(grant.currentHealth, 26);
    assert.equal(repository.getPlayer(player.id).baseMaxHealth, 49);
    assert.equal(repository.getPlayer(player.id).maxHealth, 49);
    assert.equal(repository.getPlayer(player.id).currentHealth, 26);

    progression.get(player.id);
    progression.get(player.id);
    assert.equal(repository.db.prepare('SELECT growth_level_applied FROM players WHERE id = ?').get(player.id).growth_level_applied, 4);
    assert.equal(repository.db.prepare('SELECT max_health, current_health FROM players WHERE id = ?').get(player.id).max_health, 49);
    assert.equal(repository.getPlayer(player.id).currentHealth, 26);
  } finally {
    repository.close();
  }
});

test('preexisting XP applies Max HP growth once without healing current HP', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'legacy-growth-player' });
  try {
    const player = repository.getOrCreatePlayer({ threadedUserId: 'legacy-growth-user', displayName: 'Adventurer' });
    repository.setPlayerHealth(player.id, 12);
    repository.db.exec(`
      CREATE TABLE player_progression (
        player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
        experience INTEGER NOT NULL DEFAULT 0 CHECK(experience >= 0),
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    repository.db.prepare(`
      INSERT INTO player_progression (player_id, experience, updated_at)
      VALUES (?, 350, CURRENT_TIMESTAMP)
    `).run(player.id);

    const progression = new SQLitePlayerProgressionRepository({ database: repository.db });
    assert.equal(repository.getPlayer(player.id).baseMaxHealth, 49);
    assert.equal(repository.getPlayer(player.id).currentHealth, 12);
    assert.equal(progression.get(player.id).experience, 350);

    new SQLitePlayerProgressionRepository({ database: repository.db });
    assert.equal(repository.db.prepare('SELECT max_health, current_health, growth_level_applied FROM players WHERE id = ?').get(player.id).max_health, 49);
    assert.equal(repository.getPlayer(player.id).currentHealth, 12);
  } finally {
    repository.close();
  }
});

test('progression repository adds the growth marker on a pre-marker players table', () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(`
      CREATE TABLE players (
        id TEXT PRIMARY KEY,
        max_health INTEGER NOT NULL,
        current_health INTEGER NOT NULL
      );
      INSERT INTO players (id, max_health, current_health) VALUES ('legacy-schema-player', 40, 14);
      CREATE TABLE player_progression (
        player_id TEXT PRIMARY KEY,
        experience INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO player_progression (player_id, experience) VALUES ('legacy-schema-player', 350);
    `);

    const progression = new SQLitePlayerProgressionRepository({ database });
    const player = database.prepare('SELECT max_health, current_health, growth_level_applied FROM players WHERE id = ?').get('legacy-schema-player');
    assert.deepEqual({ ...player }, { max_health: 49, current_health: 14, growth_level_applied: 4 });
    assert.equal(progression.get('legacy-schema-player').experience, 350);
  } finally {
    database.close();
  }
});

test('transaction-neutral XP grant rolls back with its caller-owned claim transaction', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'claim-growth-player' });
  try {
    const player = repository.getOrCreatePlayer({ threadedUserId: 'claim-growth-user', displayName: 'Adventurer' });
    const progression = new SQLitePlayerProgressionRepository({ database: repository.db });
    repository.db.exec('BEGIN IMMEDIATE');
    const grant = progression.grantExperienceInTransaction(player.id, 500, { currentHealthAfterCombat: 20 });
    assert.equal(grant.progression.level, 5);
    assert.equal(grant.maxHealthIncrease, 12);
    repository.db.exec('ROLLBACK');

    assert.equal(progression.get(player.id).experience, 0);
    assert.equal(repository.getPlayer(player.id).baseMaxHealth, 40);
    assert.equal(repository.getPlayer(player.id).currentHealth, 40);
  } finally {
    repository.close();
  }
});

test('effective Max HP composes Level growth and all equipped slot bonuses through Heal and Dungeon snapshots', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'effective-health-player' });
  try {
    const player = repository.getOrCreatePlayer({ threadedUserId: 'effective-health-user', displayName: 'Adventurer' });
    const progression = new SQLitePlayerProgressionRepository({ database: repository.db });
    const equipment = new SQLiteEquipmentRepository({ database: repository.db });
    for (const [slot, bonus] of [['helmet', 2], ['armor', 5], ['accessory', 3]]) {
      const item = hpEquipment(`hp-${slot}`, slot, bonus);
      repository.addItem(player.id, item);
      equipment.equip(player.id, item.id);
    }

    const levelGrant = progression.grantExperience(player.id, 50, { currentHealthAfterCombat: 35 });
    assert.equal(levelGrant.maxHealthIncrease, 3);
    assert.equal(levelGrant.maxHealth, 53);
    assert.equal(levelGrant.currentHealth, 38);
    assert.equal(repository.getPlayer(player.id).maxHealth, 53);

    repository.setPlayerHealth(player.id, 50);
    const potion = repository.useConsumable(player.id, { heal: 8 });
    assert.equal(potion.maxHealth, 53);
    assert.equal(potion.healed, 3);
    assert.equal(potion.currentHealth, 53);

    repository.addHealthPotions(player.id, 1);
    const run = repository.createRun({
      id: 'snapshot-run',
      startedByPlayerId: player.id,
      dungeonId: 'snapshot-test',
      phase: 'combat',
      ownerType: 'solo',
      ownerId: player.id,
      createdAt: new Date().toISOString(),
      participants: [{ playerId: player.id, hp: 45, maxHp: 53 }],
    });
    assert.equal(repository.getPlayer(player.id).maxHealth, 53);
    assert.equal(repository.getPlayer(player.id).currentHealth, 45);

    const potionState = { ...run, participants: [{ ...run.participants[0], hp: 50 }] };
    repository.saveRunWithPotion(potionState, player.id);
    assert.equal(repository.getPlayer(player.id).currentHealth, 50);
    assert.equal(repository.getPlayer(player.id).maxHealth, 53);
  } finally {
    repository.close();
  }
});
