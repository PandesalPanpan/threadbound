import { ADVENTURE_COOLDOWN_SECONDS } from '../domain/AdventureRewardPolicy.js';

function toDate(value, label) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid date.`);
  return date;
}

function projectCooldown({ readyAt = null, now = new Date() } = {}) {
  const current = toDate(now, 'Adventure cooldown now');
  if (!readyAt) return Object.freeze({ ready: true, nextReadyAt: null, remainingSeconds: 0 });
  const ready = toDate(readyAt, 'Adventure cooldown readyAt');
  const remainingMs = Math.max(0, ready.getTime() - current.getTime());
  return Object.freeze({
    ready: remainingMs === 0,
    nextReadyAt: ready.toISOString(),
    remainingSeconds: Math.ceil(remainingMs / 1000),
  });
}

export class SQLiteAdventureCooldownRepository {
  constructor({ database }) {
    if (!database) throw new Error('SQLiteAdventureCooldownRepository requires a database.');
    this.db = database;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS adventure_cooldowns (
        player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
        ready_at TEXT NOT NULL
      );
    `);
  }

  get(playerId, { now = new Date() } = {}) {
    const row = this.db.prepare('SELECT ready_at FROM adventure_cooldowns WHERE player_id = ?').get(playerId);
    return projectCooldown({ readyAt: row?.ready_at || null, now });
  }

  claim(playerId, { now = new Date(), cooldownSeconds = ADVENTURE_COOLDOWN_SECONDS } = {}) {
    const current = toDate(now, 'Adventure cooldown now');
    const seconds = Math.max(0, Math.floor(Number(cooldownSeconds)));
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT ready_at FROM adventure_cooldowns WHERE player_id = ?').get(playerId);
      const projection = projectCooldown({ readyAt: row?.ready_at || null, now: current });
      if (!projection.ready) {
        this.db.exec('COMMIT');
        return Object.freeze({ claimed: false, ...projection });
      }
      const nextReadyAt = new Date(current.getTime() + seconds * 1000).toISOString();
      this.db.prepare(`
        INSERT INTO adventure_cooldowns (player_id, ready_at) VALUES (?, ?)
        ON CONFLICT(player_id) DO UPDATE SET ready_at = excluded.ready_at
      `).run(playerId, nextReadyAt);
      this.db.exec('COMMIT');
      return Object.freeze({ claimed: true, ready: false, nextReadyAt, remainingSeconds: seconds });
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }
}
