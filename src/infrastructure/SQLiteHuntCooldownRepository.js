import { HUNT_COOLDOWN_SECONDS, nextHuntReadyAt, projectHuntCooldown } from '../domain/HuntCooldownPolicy.js';

export class SQLiteHuntCooldownRepository {
  constructor({ database }) {
    if (!database) throw new Error('SQLiteHuntCooldownRepository requires a database.');
    this.db = database;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hunt_cooldowns (
        player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
        ready_at TEXT NOT NULL
      );
    `);
  }

  get(playerId, { now = new Date() } = {}) {
    const row = this.db.prepare('SELECT ready_at FROM hunt_cooldowns WHERE player_id = ?').get(playerId);
    return projectHuntCooldown({ readyAt: row?.ready_at || null, now });
  }

  claim(playerId, { now = new Date(), cooldownSeconds = HUNT_COOLDOWN_SECONDS } = {}) {
    const current = now instanceof Date ? new Date(now.getTime()) : new Date(now);
    if (Number.isNaN(current.getTime())) throw new Error('Hunt cooldown now must be a valid date.');

    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT ready_at FROM hunt_cooldowns WHERE player_id = ?').get(playerId);
      const projection = projectHuntCooldown({ readyAt: row?.ready_at || null, now: current });
      if (!projection.ready) {
        this.db.exec('COMMIT');
        return Object.freeze({ claimed: false, ...projection });
      }

      const nextReadyAt = nextHuntReadyAt({ now: current, cooldownSeconds });
      this.db.prepare(`
        INSERT INTO hunt_cooldowns (player_id, ready_at) VALUES (?, ?)
        ON CONFLICT(player_id) DO UPDATE SET ready_at = excluded.ready_at
      `).run(playerId, nextReadyAt);
      this.db.exec('COMMIT');
      return Object.freeze({
        claimed: true,
        ready: false,
        nextReadyAt,
        remainingSeconds: Math.max(0, Math.floor(Number(cooldownSeconds))),
      });
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }
}
