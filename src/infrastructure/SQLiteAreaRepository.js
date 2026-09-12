import { AreaProgression } from '../domain/AreaProgression.js';

export class SQLiteAreaRepository {
  constructor({ database } = {}) {
    if (!database) throw new Error('SQLiteAreaRepository requires the shared database.');
    this.db = database;
    this.#migrate();
  }

  get(playerId) {
    this.#ensure(playerId);
    const row = this.db.prepare(`
      SELECT current_area_number, highest_unlocked_area_number, updated_at
      FROM player_area_progression
      WHERE player_id = ?
    `).get(playerId);
    return {
      ...new AreaProgression({
        currentAreaNumber: row.current_area_number,
        highestUnlockedAreaNumber: row.highest_unlocked_area_number,
      }).toJSON(),
      updatedAt: row.updated_at,
    };
  }

  save(playerId, progression) {
    const model = progression instanceof AreaProgression ? progression : new AreaProgression(progression);
    this.db.prepare(`
      INSERT INTO player_area_progression (
        player_id,
        current_area_number,
        highest_unlocked_area_number,
        updated_at
      ) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(player_id) DO UPDATE SET
        current_area_number = excluded.current_area_number,
        highest_unlocked_area_number = excluded.highest_unlocked_area_number,
        updated_at = CURRENT_TIMESTAMP
    `).run(playerId, model.currentAreaNumber, model.highestUnlockedAreaNumber);
    return this.get(playerId);
  }

  #ensure(playerId) {
    const player = this.db.prepare('SELECT 1 FROM players WHERE id = ?').get(playerId);
    if (!player) throw new Error('Player not found.');
    this.db.prepare(`
      INSERT OR IGNORE INTO player_area_progression (
        player_id,
        current_area_number,
        highest_unlocked_area_number
      ) VALUES (?, 1, 1)
    `).run(playerId);
  }

  #migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS player_area_progression (
        player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
        current_area_number INTEGER NOT NULL DEFAULT 1 CHECK(current_area_number >= 1),
        highest_unlocked_area_number INTEGER NOT NULL DEFAULT 1 CHECK(highest_unlocked_area_number >= 1),
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK(current_area_number <= highest_unlocked_area_number)
      );
    `);
  }
}
