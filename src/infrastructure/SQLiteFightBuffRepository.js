import { fightBuffDefinition, normalizeFightCount } from '../domain/FightBuffPolicy.js';

function decode(row) {
  if (!row) return null;
  const definition = fightBuffDefinition(row.buff_code);
  return Object.freeze({
    playerId: row.player_id,
    code: definition.code,
    name: definition.name,
    description: definition.description,
    sourceRecipeId: row.source_recipe_id,
    remainingFights: Number(row.remaining_fights),
    appliedAt: row.applied_at,
  });
}

export class SQLiteFightBuffRepository {
  constructor({ database } = {}) {
    if (!database) throw new Error('SQLiteFightBuffRepository requires the shared database.');
    this.db = database;
    this.#migrate();
  }

  listActive(playerId) {
    return this.db.prepare(`
      SELECT player_id, buff_code, source_recipe_id, remaining_fights, applied_at
      FROM player_fight_buffs
      WHERE player_id = ? AND remaining_fights > 0
      ORDER BY applied_at ASC, buff_code ASC
    `).all(playerId).map(decode);
  }

  activeCodes(playerId) {
    return this.listActive(playerId).map((buff) => buff.code);
  }

  hasActive(playerId, buffCode) {
    const definition = fightBuffDefinition(buffCode);
    return Boolean(this.db.prepare(`
      SELECT 1 FROM player_fight_buffs
      WHERE player_id = ? AND buff_code = ? AND remaining_fights > 0
      LIMIT 1
    `).get(playerId, definition.code));
  }

  activate({ playerId, buffCode, sourceRecipeId, fights, appliedAt = new Date().toISOString() }) {
    const definition = fightBuffDefinition(buffCode);
    const remainingFights = normalizeFightCount(fights);
    const result = this.db.prepare(`
      INSERT INTO player_fight_buffs (
        player_id, buff_code, source_recipe_id, remaining_fights, applied_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(player_id, buff_code) DO UPDATE SET
        source_recipe_id = excluded.source_recipe_id,
        remaining_fights = excluded.remaining_fights,
        applied_at = excluded.applied_at
    `).run(playerId, definition.code, sourceRecipeId, remainingFights, appliedAt);
    if (result.changes !== 1) throw new Error('Fight buff could not be activated.');
    return this.listActive(playerId).find((buff) => buff.code === definition.code) || null;
  }

  consumeFight(playerId) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const before = this.listActive(playerId);
      for (const buff of before) {
        if (buff.remainingFights <= 1) {
          this.db.prepare('DELETE FROM player_fight_buffs WHERE player_id = ? AND buff_code = ?').run(playerId, buff.code);
        } else {
          this.db.prepare(`
            UPDATE player_fight_buffs
            SET remaining_fights = remaining_fights - 1
            WHERE player_id = ? AND buff_code = ? AND remaining_fights > 0
          `).run(playerId, buff.code);
        }
      }
      this.db.exec('COMMIT');
      const after = new Map(this.listActive(playerId).map((buff) => [buff.code, buff]));
      return Object.freeze(before.map((buff) => Object.freeze({
        code: buff.code,
        name: buff.name,
        beforeFights: buff.remainingFights,
        remainingFights: after.get(buff.code)?.remainingFights || 0,
        expired: !after.has(buff.code),
      })));
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  #migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS player_fight_buffs (
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        buff_code TEXT NOT NULL,
        source_recipe_id TEXT NOT NULL,
        remaining_fights INTEGER NOT NULL CHECK(remaining_fights > 0),
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (player_id, buff_code)
      );
      CREATE INDEX IF NOT EXISTS idx_player_fight_buffs_player
        ON player_fight_buffs(player_id, remaining_fights);
    `);
  }
}
