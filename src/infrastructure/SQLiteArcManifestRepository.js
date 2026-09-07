export class SQLiteArcManifestRepository {
  constructor({ database }) {
    if (!database) throw new Error('SQLiteArcManifestRepository requires the existing Threadbound database connection.');
    this.db = database;
    this.#migrate();
  }

  nextRevision(arcId) {
    const row = this.db.prepare('SELECT MAX(revision) AS revision FROM arc_manifests WHERE arc_id = ?').get(arcId);
    return Number(row?.revision || 0) + 1;
  }

  saveDraft({ id, arcId, revision, source = 'upload', manifest, validation }) {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO arc_manifests (id, arc_id, revision, source, status, manifest_json, validation_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)
    `).run(id, arcId, revision, source, JSON.stringify(manifest), JSON.stringify(validation), now, now);
    return this.get(id);
  }

  get(id) {
    const row = this.db.prepare('SELECT * FROM arc_manifests WHERE id = ?').get(id);
    return row ? this.#decode(row) : null;
  }

  list() {
    return this.db.prepare('SELECT * FROM arc_manifests ORDER BY created_at DESC, id DESC').all().map((row) => this.#decode(row));
  }

  listPublished() {
    return this.db.prepare("SELECT * FROM arc_manifests WHERE status = 'published' ORDER BY published_at DESC, id DESC").all().map((row) => this.#decode(row));
  }

  publish(id, validation) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT * FROM arc_manifests WHERE id = ?').get(id);
      if (!row) throw new Error('Arc Manifest draft not found.');
      if (row.status === 'published') {
        this.db.exec('ROLLBACK');
        return this.#decode(row);
      }
      const now = new Date().toISOString();
      this.db.prepare("UPDATE arc_manifests SET status = 'superseded', updated_at = ? WHERE arc_id = ? AND status = 'published'").run(now, row.arc_id);
      this.db.prepare("UPDATE arc_manifests SET status = 'published', validation_json = ?, published_at = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(validation), now, now, id);
      this.db.exec('COMMIT');
      return this.get(id);
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  recordAchievementEvent({ eventId, playerId, achievementId }) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const inserted = this.db.prepare('INSERT OR IGNORE INTO arc_achievement_events (event_id, player_id, achievement_id) VALUES (?, ?, ?)').run(eventId, playerId, achievementId);
      if (inserted.changes === 0) {
        const existing = this.db.prepare('SELECT amount FROM arc_achievement_progress WHERE player_id = ? AND achievement_id = ?').get(playerId, achievementId);
        this.db.exec('ROLLBACK');
        return { applied: false, amount: existing?.amount ?? 0 };
      }
      this.db.prepare(`
        INSERT INTO arc_achievement_progress (player_id, achievement_id, amount, updated_at)
        VALUES (?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(player_id, achievement_id) DO UPDATE SET amount = amount + 1, updated_at = CURRENT_TIMESTAMP
      `).run(playerId, achievementId);
      const progress = this.db.prepare('SELECT amount FROM arc_achievement_progress WHERE player_id = ? AND achievement_id = ?').get(playerId, achievementId);
      this.db.exec('COMMIT');
      return { applied: true, amount: progress.amount };
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  getAchievementProgress(playerId, achievementId) {
    return this.db.prepare('SELECT amount FROM arc_achievement_progress WHERE player_id = ? AND achievement_id = ?').get(playerId, achievementId)?.amount ?? 0;
  }

  #decode(row) {
    return {
      id: row.id,
      arcId: row.arc_id,
      revision: row.revision,
      source: row.source,
      status: row.status,
      manifest: JSON.parse(row.manifest_json),
      validation: JSON.parse(row.validation_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
    };
  }

  #migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS arc_manifests (
        id TEXT PRIMARY KEY,
        arc_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        source TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('draft', 'published', 'superseded')),
        manifest_json TEXT NOT NULL,
        validation_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        published_at TEXT NULL,
        UNIQUE(arc_id, revision)
      );
      CREATE INDEX IF NOT EXISTS idx_arc_manifests_arc ON arc_manifests(arc_id, revision DESC);
      CREATE INDEX IF NOT EXISTS idx_arc_manifests_status ON arc_manifests(status, published_at DESC);
      CREATE TABLE IF NOT EXISTS arc_achievement_progress (
        player_id TEXT NOT NULL,
        achievement_id TEXT NOT NULL,
        amount INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (player_id, achievement_id)
      );
      CREATE TABLE IF NOT EXISTS arc_achievement_events (
        event_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        achievement_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (event_id, player_id, achievement_id)
      );
    `);
  }
}
