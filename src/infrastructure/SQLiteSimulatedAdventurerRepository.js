import { SimulatedAdventurer } from '../domain/SimulatedAdventurer.js';
import {
  assertSafeSimulatedAdventurerSimulationActions,
  assertSimulatedAdventurerMutationTarget,
} from '../domain/SimulatedAdventurerSafetyPolicy.js';

function decodeRow(row) {
  if (!row) return null;
  return {
    adventurer: new SimulatedAdventurer({
      id: row.id,
      name: row.name,
      experience: row.experience,
      currentAreaNumber: row.current_area_number,
      highestUnlockedAreaNumber: row.highest_unlocked_area_number,
      huntCount: row.hunt_count,
      adventureCount: row.adventure_count,
      equipment: JSON.parse(row.equipment_json),
      achievements: JSON.parse(row.achievements_json),
      duelRecord: JSON.parse(row.duel_record_json),
      leaderboardPlacement: row.leaderboard_placement,
      personality: row.personality,
      activityProfile: row.activity_profile,
      baseAttack: row.base_attack,
      maxHealth: row.max_health,
    }),
    lastSimulatedAt: row.last_simulated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SQLiteSimulatedAdventurerRepository {
  constructor({ database }) {
    if (!database) throw new Error('SQLiteSimulatedAdventurerRepository requires a database.');
    this.db = database;
    this.#migrate();
  }

  save(adventurer, { lastSimulatedAt = null } = {}) {
    const model = adventurer instanceof SimulatedAdventurer ? adventurer : new SimulatedAdventurer(adventurer);
    this.db.prepare(`
      INSERT INTO simulated_adventurers (
        id, name, experience, current_area_number, highest_unlocked_area_number,
        hunt_count, adventure_count, equipment_json, achievements_json,
        duel_record_json, leaderboard_placement, personality, activity_profile,
        base_attack, max_health, last_simulated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        experience = excluded.experience,
        current_area_number = excluded.current_area_number,
        highest_unlocked_area_number = excluded.highest_unlocked_area_number,
        hunt_count = excluded.hunt_count,
        adventure_count = excluded.adventure_count,
        equipment_json = excluded.equipment_json,
        achievements_json = excluded.achievements_json,
        duel_record_json = excluded.duel_record_json,
        leaderboard_placement = excluded.leaderboard_placement,
        personality = excluded.personality,
        activity_profile = excluded.activity_profile,
        base_attack = excluded.base_attack,
        max_health = excluded.max_health,
        last_simulated_at = COALESCE(excluded.last_simulated_at, simulated_adventurers.last_simulated_at),
        updated_at = CURRENT_TIMESTAMP
    `).run(
      model.id,
      model.name,
      model.experience,
      model.currentAreaNumber,
      model.highestUnlockedAreaNumber,
      model.huntCount,
      model.adventureCount,
      JSON.stringify(model.equipment),
      JSON.stringify(model.achievements),
      JSON.stringify(model.duelRecord),
      model.leaderboardPlacement,
      model.personality,
      model.activityProfile.id,
      model.stats.attack - Object.values(model.equipment).reduce((sum, item) => sum + Number(item?.attackBonus || 0), 0),
      model.stats.maxHp - Object.values(model.equipment).reduce((sum, item) => sum + Number(item?.maxHpBonus || 0), 0),
      lastSimulatedAt,
    );
    return this.get(model.id);
  }

  get(adventurerId) {
    const row = this.db.prepare('SELECT * FROM simulated_adventurers WHERE id = ?').get(adventurerId);
    return decodeRow(row);
  }

  listTicks(adventurerId) {
    return this.db.prepare(`
      SELECT adventurer_id, tick_key, scheduled_at, action_type, experience_award, created_at
      FROM simulated_adventurer_ticks
      WHERE adventurer_id = ?
      ORDER BY scheduled_at, tick_key
    `).all(adventurerId).map((row) => ({
      adventurerId: row.adventurer_id,
      tickKey: row.tick_key,
      scheduledAt: row.scheduled_at,
      actionType: row.action_type,
      experienceAward: row.experience_award,
      createdAt: row.created_at,
    }));
  }

  applySimulationBatch({ adventurerId, expectedLastSimulatedAt, cursorAt, actions }) {
    assertSimulatedAdventurerMutationTarget({
      adventurerId,
      targetId: adventurerId,
      targetKind: 'simulated',
    });
    assertSafeSimulatedAdventurerSimulationActions(actions);

    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT last_simulated_at FROM simulated_adventurers WHERE id = ?').get(adventurerId);
      if (!row) {
        const error = new Error('Simulated adventurer not found.');
        error.code = 'simulated_adventurer_not_found';
        throw error;
      }
      const actualCursor = row.last_simulated_at ?? null;
      const expectedCursor = expectedLastSimulatedAt ?? null;
      if (actualCursor !== expectedCursor) {
        this.db.exec('ROLLBACK');
        return { status: 'stale', applied: 0, replayed: 0 };
      }

      let applied = 0;
      let replayed = 0;
      for (const action of actions) {
        const insert = this.db.prepare(`
          INSERT OR IGNORE INTO simulated_adventurer_ticks (
            adventurer_id, tick_key, scheduled_at, action_type, experience_award
          ) VALUES (?, ?, ?, ?, ?)
        `).run(adventurerId, action.tickKey, action.scheduledAt, action.actionType, action.experienceAward);

        if (insert.changes === 0) {
          replayed += 1;
          continue;
        }

        const countColumn = action.actionType === 'adventure' ? 'adventure_count' : 'hunt_count';
        this.db.prepare(`
          UPDATE simulated_adventurers
          SET experience = experience + ?, ${countColumn} = ${countColumn} + 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(action.experienceAward, adventurerId);
        applied += 1;
      }

      this.db.prepare(`
        UPDATE simulated_adventurers
        SET last_simulated_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(cursorAt, adventurerId);
      this.db.exec('COMMIT');
      return { status: 'applied', applied, replayed, state: this.get(adventurerId) };
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  #migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS simulated_adventurers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        experience INTEGER NOT NULL DEFAULT 0 CHECK(experience >= 0),
        current_area_number INTEGER NOT NULL DEFAULT 1 CHECK(current_area_number >= 1),
        highest_unlocked_area_number INTEGER NOT NULL DEFAULT 1 CHECK(highest_unlocked_area_number >= current_area_number),
        hunt_count INTEGER NOT NULL DEFAULT 0 CHECK(hunt_count >= 0),
        adventure_count INTEGER NOT NULL DEFAULT 0 CHECK(adventure_count >= 0),
        equipment_json TEXT NOT NULL DEFAULT '{}',
        achievements_json TEXT NOT NULL DEFAULT '[]',
        duel_record_json TEXT NOT NULL DEFAULT '{}',
        leaderboard_placement INTEGER NULL,
        personality TEXT NULL,
        activity_profile TEXT NOT NULL CHECK(activity_profile IN ('casual', 'steady', 'dedicated')),
        base_attack REAL NOT NULL DEFAULT 6,
        max_health REAL NOT NULL DEFAULT 40,
        last_simulated_at TEXT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS simulated_adventurer_ticks (
        adventurer_id TEXT NOT NULL REFERENCES simulated_adventurers(id) ON DELETE CASCADE,
        tick_key TEXT NOT NULL,
        scheduled_at TEXT NOT NULL,
        action_type TEXT NOT NULL CHECK(action_type IN ('hunt', 'adventure')),
        experience_award INTEGER NOT NULL CHECK(experience_award >= 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (adventurer_id, tick_key)
      );
      CREATE INDEX IF NOT EXISTS idx_simulated_adventurer_ticks_schedule
        ON simulated_adventurer_ticks(adventurer_id, scheduled_at);
    `);
  }
}
