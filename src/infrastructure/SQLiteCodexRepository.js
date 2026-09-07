function decodeItem(row) {
  return {
    id: row.id,
    playerId: row.player_id,
    definitionId: row.definition_id,
    name: row.name,
    slot: row.slot,
    rarity: row.rarity,
    attackBonus: row.attack_bonus,
    effectCode: row.effect_code,
    effect: JSON.parse(row.effect_json),
    source: row.source,
    createdAt: row.created_at,
  };
}

export class SQLiteCodexRepository {
  constructor({ database }) {
    if (!database) throw new Error('SQLiteCodexRepository requires the existing Threadbound database connection.');
    this.db = database;
    this.#migrate();
  }

  listCodexItems() {
    return this.db.prepare('SELECT * FROM items ORDER BY created_at DESC, id DESC LIMIT 500').all().map(decodeItem);
  }

  publishContentEntry({ id, type = 'lore', title, summary, body, arcId = null, source = 'generated', version = 1, tags = [], publishedAt = new Date().toISOString() }) {
    if (!id || !title || !summary || !body) throw new Error('Published content requires id, title, summary, and body.');
    this.db.prepare(`
      INSERT INTO codex_content_entries (id, type, title, summary, body, arc_id, source, version, tags_json, status, published_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        title = excluded.title,
        summary = excluded.summary,
        body = excluded.body,
        arc_id = excluded.arc_id,
        source = excluded.source,
        version = excluded.version,
        tags_json = excluded.tags_json,
        status = 'published',
        published_at = excluded.published_at,
        updated_at = excluded.updated_at
    `).run(id, type, title, summary, body, arcId, source, version, JSON.stringify(tags), publishedAt, new Date().toISOString());
    return this.getContentEntry(id);
  }

  saveDraftContentEntry({ id, type = 'lore', title, summary, body, arcId = null, source = 'generated', version = 1, tags = [] }) {
    if (!id || !title || !summary || !body) throw new Error('Draft content requires id, title, summary, and body.');
    this.db.prepare(`
      INSERT INTO codex_content_entries (id, type, title, summary, body, arc_id, source, version, tags_json, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        title = excluded.title,
        summary = excluded.summary,
        body = excluded.body,
        arc_id = excluded.arc_id,
        source = excluded.source,
        version = excluded.version,
        tags_json = excluded.tags_json,
        status = 'draft',
        updated_at = excluded.updated_at
    `).run(id, type, title, summary, body, arcId, source, version, JSON.stringify(tags), new Date().toISOString());
    return this.getContentEntry(id);
  }

  getContentEntry(id) {
    const row = this.db.prepare('SELECT * FROM codex_content_entries WHERE id = ?').get(id);
    return row ? this.#decodeContent(row) : null;
  }

  listPublishedContentEntries() {
    return this.db.prepare("SELECT * FROM codex_content_entries WHERE status = 'published' ORDER BY published_at DESC, id ASC").all().map((row) => this.#decodeContent(row));
  }

  recordWorldHistory({ id, eventType, title, summary, body = null, entityType = null, entityId = null, createdAt = new Date().toISOString() }) {
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO world_history (id, event_type, title, summary, body, entity_type, entity_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, eventType, title, summary, body, entityType, entityId, createdAt);
    return result.changes === 1;
  }

  listWorldHistory(limit = 250) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 250));
    return this.db.prepare('SELECT * FROM world_history ORDER BY created_at DESC, id DESC LIMIT ?').all(safeLimit).map((row) => ({
      id: row.id,
      eventType: row.event_type,
      title: row.title,
      summary: row.summary,
      body: row.body,
      entityType: row.entity_type,
      entityId: row.entity_id,
      createdAt: row.created_at,
    }));
  }

  #decodeContent(row) {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      summary: row.summary,
      body: row.body,
      arcId: row.arc_id,
      source: row.source,
      version: row.version,
      tags: JSON.parse(row.tags_json || '[]'),
      status: row.status,
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
    };
  }

  #migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS codex_content_entries (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        body TEXT NOT NULL,
        arc_id TEXT NULL,
        source TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        tags_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL CHECK(status IN ('draft', 'published')),
        published_at TEXT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS world_history (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        body TEXT NULL,
        entity_type TEXT NULL,
        entity_id TEXT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_world_history_created ON world_history(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_world_history_entity ON world_history(entity_type, entity_id);
    `);
  }
}
