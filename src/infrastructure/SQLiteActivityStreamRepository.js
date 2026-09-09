import { randomUUID } from 'node:crypto';

function decode(row) {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    eventType: row.event_type || null,
    actorPlayerId: row.actor_player_id || null,
    actorName: row.actor_name || null,
    body: row.body,
    runId: row.run_id || null,
    dungeonId: row.dungeon_id || null,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {},
    createdAt: row.created_at,
  };
}

export class SQLiteActivityStreamRepository {
  constructor({ database, idFactory = randomUUID, retention = 2000 }) {
    if (!database) throw new Error('SQLiteActivityStreamRepository requires the existing Threadbound database connection.');
    this.db = database;
    this.idFactory = idFactory;
    this.retention = retention;
    this.#migrate();
  }

  append({ kind, eventType = null, actorPlayerId = null, actorName = null, body, runId = null, dungeonId = null, metadata = {}, createdAt = new Date().toISOString() }) {
    const id = this.idFactory();
    this.db.prepare(`
      INSERT INTO activity_stream_entries
        (id, kind, event_type, actor_player_id, actor_name, body, run_id, dungeon_id, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, kind, eventType, actorPlayerId, actorName, body, runId, dungeonId, JSON.stringify(metadata || {}), createdAt);

    this.db.prepare(`
      DELETE FROM activity_stream_entries
      WHERE rowid NOT IN (
        SELECT rowid FROM activity_stream_entries ORDER BY rowid DESC LIMIT ?
      )
    `).run(this.retention);

    return this.get(id);
  }

  get(id) {
    return decode(this.db.prepare('SELECT * FROM activity_stream_entries WHERE id = ?').get(id));
  }

  listPage({ limit = 30, beforeId = null } = {}) {
    const bounded = Math.max(1, Math.min(50, Number(limit) || 30));
    const rows = beforeId
      ? this.db.prepare(`
          SELECT * FROM activity_stream_entries
          WHERE rowid < COALESCE((SELECT rowid FROM activity_stream_entries WHERE id = ?), 0)
          ORDER BY rowid DESC
          LIMIT ?
        `).all(String(beforeId), bounded + 1)
      : this.db.prepare('SELECT * FROM activity_stream_entries ORDER BY rowid DESC LIMIT ?').all(bounded + 1);
    const hasMore = rows.length > bounded;
    const page = rows.slice(0, bounded).map(decode).reverse();
    return { entries: page, hasMore };
  }

  listRecent({ limit = 80 } = {}) {
    return this.listPage({ limit: Math.min(50, Number(limit) || 80) }).entries;
  }

  #migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS activity_stream_entries (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('chat', 'system')),
        event_type TEXT,
        actor_player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
        actor_name TEXT,
        body TEXT NOT NULL,
        run_id TEXT,
        dungeon_id TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_activity_stream_created ON activity_stream_entries(created_at, id);
    `);
  }
}
