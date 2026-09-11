export class SQLitePlayerProgressionRepository {
  constructor({ database }) {
    if (!database) throw new Error('SQLitePlayerProgressionRepository requires database.');
    this.db = database;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS player_progression (
        player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
        experience INTEGER NOT NULL DEFAULT 0 CHECK(experience >= 0),
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  get(playerId) {
    const row = this.db.prepare('SELECT experience, updated_at FROM player_progression WHERE player_id = ?').get(playerId);
    return {
      playerId,
      experience: Math.max(0, Math.floor(Number(row?.experience || 0))),
      updatedAt: row?.updated_at || null,
    };
  }

  addExperience(playerId, amount) {
    const reward = Math.max(0, Math.floor(Number(amount) || 0));
    if (!reward) return this.get(playerId);
    this.db.prepare(`
      INSERT INTO player_progression (player_id, experience, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(player_id) DO UPDATE SET
        experience = player_progression.experience + excluded.experience,
        updated_at = CURRENT_TIMESTAMP
    `).run(playerId, reward);
    return this.get(playerId);
  }
}
