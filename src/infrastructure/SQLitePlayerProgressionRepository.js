import { growthForLevelChange } from '../domain/CharacterGrowthPolicy.js';
import { progressionForExperience } from '../domain/LevelProgressionPolicy.js';
import { sqliteEquipmentMaxHpBonus } from './SQLiteItemMapper.js';

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
    this.#reconcilePersistedGrowth();
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
    const result = this.grantExperience(playerId, amount);
    return { playerId: result.playerId, experience: result.experience, updatedAt: result.updatedAt };
  }

  /** Owns the transaction for XP plus any level-derived HP increase. */
  grantExperience(playerId, amount, options = {}) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = this.grantExperienceInTransaction(playerId, amount, options);
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  /**
   * Transaction-neutral XP grant for claim/reward transactions that already
   * own this shared SQLite connection. The caller must rollback on failure.
   */
  grantExperienceInTransaction(playerId, amount, { currentHealthAfterCombat = null } = {}) {
    const player = this.db.prepare('SELECT max_health, current_health, growth_level_applied FROM players WHERE id = ?').get(playerId);
    if (!player) throw new Error('Player not found.');

    const current = this.get(playerId);
    const reward = Math.max(0, Math.floor(Number(amount) || 0));
    const before = progressionForExperience(current.experience);
    const nextExperience = current.experience + reward;
    const nextProgression = progressionForExperience(nextExperience);
    const growth = growthForLevelChange(before.level, nextProgression.level);

    if (reward > 0) {
      this.db.prepare(`
        INSERT INTO player_progression (player_id, experience, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(player_id) DO UPDATE SET
          experience = player_progression.experience + excluded.experience,
          updated_at = CURRENT_TIMESTAMP
      `).run(playerId, reward);
    }

    const markerLevel = Math.max(1, Math.floor(Number(player.growth_level_applied) || 1));
    const targetGrowth = Math.max(markerLevel, nextProgression.level);
    const migrationGrowth = growthForLevelChange(markerLevel, Math.max(markerLevel, before.level));
    const earnedGrowth = growthForLevelChange(before.level, nextProgression.level);
    const maxHealthIncrease = migrationGrowth.maxHealthIncrease + earnedGrowth.maxHealthIncrease;
    const baseMaxHealth = Math.max(1, Number(player.max_health || 1)) + maxHealthIncrease;
    const equippedMaxHpBonus = sqliteEquipmentMaxHpBonus(this.db, playerId);
    const maxHealth = baseMaxHealth + equippedMaxHpBonus;
    const suppliedHealth = currentHealthAfterCombat == null
      ? Number(player.current_health || 0)
      : Math.max(0, Math.floor(Number(currentHealthAfterCombat) || 0));
    // If XP was written by an older path after this repository was constructed,
    // reconcile its missing Max HP without retroactively healing that stale XP.
    // Only levels crossed by this grant add their HP delta to current health.
    const currentHealth = Math.min(maxHealth, Math.max(0, suppliedHealth + earnedGrowth.maxHealthIncrease));

    if (maxHealthIncrease > 0 || currentHealthAfterCombat != null) {
      this.db.prepare(`
        UPDATE players
        SET max_health = ?, current_health = ?, growth_level_applied = ?, health_updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(baseMaxHealth, currentHealth, targetGrowth, playerId);
    }

    const updated = this.get(playerId);
    const effectiveMaxHealth = baseMaxHealth + equippedMaxHpBonus;
    return {
      playerId,
      experience: updated.experience,
      updatedAt: updated.updatedAt,
      progression: nextProgression,
      levelsGained: growth.levelsGained,
      leveledUp: growth.levelsGained > 0,
      maxHealthIncrease,
      maxHealth: effectiveMaxHealth,
      currentHealth,
    };
  }

  #reconcilePersistedGrowth() {
    const playerColumns = this.db.prepare('PRAGMA table_info(players)').all();
    if (!playerColumns.some((column) => column.name === 'growth_level_applied')) {
      this.db.exec('ALTER TABLE players ADD COLUMN growth_level_applied INTEGER NOT NULL DEFAULT 1');
    }

    const rows = this.db.prepare(`
      SELECT p.id, p.max_health, p.growth_level_applied, pp.experience
      FROM players p
      JOIN player_progression pp ON pp.player_id = p.id
    `).all();
    const update = this.db.prepare(`
      UPDATE players SET max_health = ?, growth_level_applied = ? WHERE id = ?
    `);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of rows) {
        const targetLevel = progressionForExperience(row.experience).level;
        const markerLevel = Math.max(1, Math.floor(Number(row.growth_level_applied) || 1));
        const growth = growthForLevelChange(markerLevel, targetLevel);
        if (growth.levelsGained === 0) continue;
        // Existing XP is backfilled without healing current HP. This preserves
        // their damage state while making repeated repository construction safe.
        update.run(Number(row.max_health) + growth.maxHealthIncrease, targetLevel, row.id);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }
}
