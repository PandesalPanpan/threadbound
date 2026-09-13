export class SQLiteLeaderboardRepository {
  constructor({ database } = {}) {
    if (!database) throw new Error('SQLiteLeaderboardRepository requires the shared database.');
    this.db = database;
    this.#migrate();
  }

  listHumanPlayerIds() {
    return this.db.prepare('SELECT id FROM players ORDER BY id ASC').all().map((row) => row.id);
  }

  activityForPlayer(playerId) {
    const row = this.db.prepare(`
      SELECT hunt_count, adventure_count
      FROM player_leaderboard_activity
      WHERE player_id = ?
    `).get(playerId);
    return Object.freeze({
      huntCount: Math.max(0, Number(row?.hunt_count || 0)),
      adventureCount: Math.max(0, Number(row?.adventure_count || 0)),
    });
  }

  #migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS player_leaderboard_activity (
        player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
        hunt_count INTEGER NOT NULL DEFAULT 0 CHECK(hunt_count >= 0),
        adventure_count INTEGER NOT NULL DEFAULT 0 CHECK(adventure_count >= 0),
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const hasStream = this.db.prepare(`
      SELECT 1 AS present
      FROM sqlite_master
      WHERE type = 'table' AND name = 'activity_stream_entries'
    `).get();
    if (!hasStream) return;

    // Backfill the authoritative stream history retained at migration time. Future
    // entries are projected by the trigger below, so the leaderboard no longer
    // depends on the stream retention window after this repository is installed.
    this.db.exec(`
      INSERT INTO player_leaderboard_activity (player_id, hunt_count, adventure_count)
      SELECT actor_player_id,
             SUM(CASE WHEN event_type = 'HuntResolved' THEN 1 ELSE 0 END),
             SUM(CASE WHEN event_type = 'AdventureResolved' THEN 1 ELSE 0 END)
      FROM activity_stream_entries
      WHERE actor_player_id IS NOT NULL
        AND event_type IN ('HuntResolved', 'AdventureResolved')
      GROUP BY actor_player_id
      ON CONFLICT(player_id) DO NOTHING;

      CREATE TRIGGER IF NOT EXISTS project_player_leaderboard_activity
      AFTER INSERT ON activity_stream_entries
      WHEN NEW.actor_player_id IS NOT NULL
       AND NEW.event_type IN ('HuntResolved', 'AdventureResolved')
      BEGIN
        INSERT INTO player_leaderboard_activity (player_id, hunt_count, adventure_count, updated_at)
        VALUES (
          NEW.actor_player_id,
          CASE WHEN NEW.event_type = 'HuntResolved' THEN 1 ELSE 0 END,
          CASE WHEN NEW.event_type = 'AdventureResolved' THEN 1 ELSE 0 END,
          NEW.created_at
        )
        ON CONFLICT(player_id) DO UPDATE SET
          hunt_count = hunt_count + CASE WHEN NEW.event_type = 'HuntResolved' THEN 1 ELSE 0 END,
          adventure_count = adventure_count + CASE WHEN NEW.event_type = 'AdventureResolved' THEN 1 ELSE 0 END,
          updated_at = NEW.created_at;
      END;
    `);
  }
}
