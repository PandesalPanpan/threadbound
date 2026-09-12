import { PROGRESSION_BOSS_ENRAGE_CAP } from '../domain/ProgressionBossEnragePolicy.js';

export class SQLiteProgressionBossEnrageRepository {
  constructor({ database }) {
    this.db = database;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS progression_boss_enrage (
        dungeon_id TEXT PRIMARY KEY,
        stack_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS progression_boss_enrage_events (
        run_id TEXT NOT NULL,
        outcome TEXT NOT NULL,
        PRIMARY KEY (run_id, outcome)
      );
    `);
  }

  get(dungeonId) {
    const row = this.db.prepare('SELECT stack_count AS stackCount FROM progression_boss_enrage WHERE dungeon_id = ?').get(dungeonId);
    return Math.max(0, Math.min(PROGRESSION_BOSS_ENRAGE_CAP, Number(row?.stackCount || 0)));
  }

  recordFailure(dungeonId, runId) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const inserted = this.db.prepare('INSERT OR IGNORE INTO progression_boss_enrage_events (run_id, outcome) VALUES (?, ?)').run(runId, 'failed');
      if (inserted.changes > 0) {
        this.db.prepare(`
          INSERT INTO progression_boss_enrage (dungeon_id, stack_count) VALUES (?, 1)
          ON CONFLICT(dungeon_id) DO UPDATE SET stack_count = MIN(?, progression_boss_enrage.stack_count + 1)
        `).run(dungeonId, PROGRESSION_BOSS_ENRAGE_CAP);
      }
      const stack = this.get(dungeonId);
      this.db.exec('COMMIT');
      return stack;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  recordVictory(dungeonId, runId) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const inserted = this.db.prepare('INSERT OR IGNORE INTO progression_boss_enrage_events (run_id, outcome) VALUES (?, ?)').run(runId, 'completed');
      if (inserted.changes > 0) {
        this.db.prepare(`
          INSERT INTO progression_boss_enrage (dungeon_id, stack_count) VALUES (?, 0)
          ON CONFLICT(dungeon_id) DO UPDATE SET stack_count = 0
        `).run(dungeonId);
      }
      this.db.exec('COMMIT');
      return 0;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
