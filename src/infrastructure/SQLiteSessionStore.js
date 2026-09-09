import session from 'express-session';

const DEFAULT_TTL_MS = 60 * 60 * 1000;

function expiresAt(sessionData, fallbackTtlMs) {
  const expires = sessionData?.cookie?.expires;
  if (expires) {
    const timestamp = new Date(expires).getTime();
    if (Number.isFinite(timestamp)) return timestamp;
  }
  const maxAge = Number(sessionData?.cookie?.maxAge);
  if (Number.isFinite(maxAge) && maxAge > 0) return Date.now() + maxAge;
  return Date.now() + fallbackTtlMs;
}

export class SQLiteSessionStore extends session.Store {
  constructor({ database, ttlMs = DEFAULT_TTL_MS, now = () => Date.now() } = {}) {
    super();
    if (!database) throw new Error('SQLiteSessionStore requires a database connection.');
    this.db = database;
    this.ttlMs = ttlMs;
    this.now = now;
    // WAL plus a bounded busy wait lets multiple Threadbound Node processes sharing the
    // same SQLite file coordinate session reads/writes without an in-memory affinity rule.
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS http_sessions (
        session_id TEXT PRIMARY KEY,
        session_json TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_http_sessions_expires_at ON http_sessions(expires_at);
    `);
  }

  get(sid, callback) {
    try {
      const row = this.db.prepare('SELECT session_json, expires_at FROM http_sessions WHERE session_id = ?').get(String(sid));
      if (!row) return callback(null, null);
      if (Number(row.expires_at) <= this.now()) {
        this.db.prepare('DELETE FROM http_sessions WHERE session_id = ?').run(String(sid));
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.session_json));
    } catch (error) {
      return callback(error);
    }
  }

  set(sid, sessionData, callback = () => {}) {
    try {
      const now = this.now();
      const expiry = expiresAt(sessionData, this.ttlMs);
      this.db.prepare(`
        INSERT INTO http_sessions (session_id, session_json, expires_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          session_json = excluded.session_json,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at
      `).run(String(sid), JSON.stringify(sessionData), expiry, now);
      this.pruneExpired(now);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  touch(sid, sessionData, callback = () => {}) {
    return this.set(sid, sessionData, callback);
  }

  destroy(sid, callback = () => {}) {
    try {
      this.db.prepare('DELETE FROM http_sessions WHERE session_id = ?').run(String(sid));
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  clear(callback = () => {}) {
    try {
      this.db.prepare('DELETE FROM http_sessions').run();
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  length(callback) {
    try {
      this.pruneExpired();
      const row = this.db.prepare('SELECT COUNT(*) AS count FROM http_sessions').get();
      return callback(null, Number(row?.count || 0));
    } catch (error) {
      return callback(error);
    }
  }

  pruneExpired(referenceTime = this.now()) {
    this.db.prepare('DELETE FROM http_sessions WHERE expires_at <= ?').run(referenceTime);
  }
}
