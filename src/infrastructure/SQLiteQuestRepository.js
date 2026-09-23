import { QuestProgress } from '../domain/Quest.js';

function parseObjectiveProgress(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseQuestDefinition(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function rowToProgress(row) {
  if (!row) return null;
  return new QuestProgress({
    questId: row.quest_id,
    status: row.status,
    acceptedAt: row.accepted_at,
    completedAt: row.completed_at,
    claimedAt: row.claimed_at,
    objectiveProgress: parseObjectiveProgress(row.objective_progress_json),
    definition: parseQuestDefinition(row.definition_json),
  });
}

export class SQLiteQuestRepository {
  constructor({ database } = {}) {
    if (!database) throw new Error('SQLiteQuestRepository requires the shared database.');
    this.db = database;
    this.#migrate();
  }

  get(playerId, questId) {
    this.#requirePlayer(playerId);
    return rowToProgress(this.db.prepare(`
      SELECT quest_id, status, accepted_at, completed_at, claimed_at, objective_progress_json, definition_json
      FROM player_quests
      WHERE player_id = ? AND quest_id = ?
    `).get(playerId, questId));
  }

  list(playerId) {
    this.#requirePlayer(playerId);
    return Object.freeze(this.db.prepare(`
      SELECT quest_id, status, accepted_at, completed_at, claimed_at, objective_progress_json, definition_json
      FROM player_quests
      WHERE player_id = ?
      ORDER BY accepted_at ASC, quest_id ASC
    `).all(playerId).map(rowToProgress));
  }

  accept(playerId, questId, acceptedAt = new Date().toISOString(), objectiveProgress = [], definition = null) {
    this.#requirePlayer(playerId);
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO player_quests (player_id, quest_id, status, accepted_at, objective_progress_json, definition_json)
      VALUES (?, ?, 'active', ?, ?, ?)
    `).run(playerId, questId, acceptedAt, JSON.stringify(objectiveProgress || []), definition ? JSON.stringify(definition) : null);
    return Object.freeze({ created: Number(result.changes || 0) === 1, progress: this.get(playerId, questId) });
  }

  save(playerId, progress) {
    this.#requirePlayer(playerId);
    const model = progress instanceof QuestProgress ? progress : new QuestProgress(progress);
    const result = this.db.prepare(`
      UPDATE player_quests
      SET status = ?, completed_at = ?, claimed_at = ?, objective_progress_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE player_id = ? AND quest_id = ?
    `).run(model.status, model.completedAt, model.claimedAt, JSON.stringify(model.objectiveProgress), playerId, model.questId);
    if (Number(result.changes || 0) !== 1) throw new Error('Quest must be accepted before progress can be saved.');
    return this.get(playerId, model.questId);
  }

  /** Atomically claims a completed Quest and awards carried Gold plus XP. */
  claimWithRewards(playerId, questId, claimedAt, { gold = 0, experience = 0, currentHealthAfterCombat = null, progressionRepository } = {}) {
    this.#requirePlayer(playerId);
    const goldReward = Math.max(0, Math.floor(Number(gold) || 0));
    const experienceReward = Math.max(0, Math.floor(Number(experience) || 0));
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const progress = this.get(playerId, questId);
      if (!progress) {
        const error = new Error('Accept that Quest before claiming it.');
        error.code = 'quest_not_accepted';
        throw error;
      }
      if (progress.status === 'claimed') {
        const error = new Error('That Quest has already been claimed.');
        error.code = 'quest_already_claimed';
        throw error;
      }
      if (progress.status !== 'completed') {
        const error = new Error('Complete every Quest objective before claiming it.');
        error.code = 'quest_not_complete';
        throw error;
      }

      const claimed = progress.claim(claimedAt);
      const saved = this.db.prepare(`
        UPDATE player_quests
        SET status = 'claimed', claimed_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE player_id = ? AND quest_id = ? AND status = 'completed'
      `).run(claimed.claimedAt, playerId, questId);
      if (Number(saved.changes || 0) !== 1) {
        const error = new Error('That Quest has already been claimed.');
        error.code = 'quest_already_claimed';
        throw error;
      }

      if (goldReward > 0) {
        const credited = this.db.prepare('UPDATE players SET thread_dust = thread_dust + ? WHERE id = ?').run(goldReward, playerId);
        if (Number(credited.changes || 0) !== 1) throw new Error('Player not found.');
      }
      const progression = progressionRepository?.grantExperienceInTransaction(playerId, experienceReward, {
        currentHealthAfterCombat,
      }) || null;
      if (experienceReward > 0 && !progression) {
        throw new Error('Quest XP rewards require a transaction-aware progression repository.');
      }
      this.db.exec('COMMIT');
      return Object.freeze({
        progress: this.get(playerId, questId),
        goldAwarded: goldReward,
        experienceAwarded: experienceReward,
        progression,
        levelsGained: Number(progression?.levelsGained || 0),
        maxHealthIncrease: Number(progression?.maxHealthIncrease || 0),
        maxHealth: progression?.maxHealth ?? null,
        currentHealth: progression?.currentHealth ?? null,
      });
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  #requirePlayer(playerId) {
    const player = this.db.prepare('SELECT 1 FROM players WHERE id = ?').get(playerId);
    if (!player) throw new Error('Player not found.');
  }

  #migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS player_quests (
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        quest_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active', 'completed', 'claimed')),
        accepted_at TEXT NOT NULL,
        completed_at TEXT,
        claimed_at TEXT,
        objective_progress_json TEXT NOT NULL DEFAULT '[]',
        definition_json TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (player_id, quest_id)
      );
      CREATE INDEX IF NOT EXISTS idx_player_quests_status ON player_quests(player_id, status);
    `);
    const columns = this.db.prepare('PRAGMA table_info(player_quests)').all().map((column) => column.name);
    if (!columns.includes('objective_progress_json')) {
      this.db.exec("ALTER TABLE player_quests ADD COLUMN objective_progress_json TEXT NOT NULL DEFAULT '[]'");
    }
    if (!columns.includes('definition_json')) {
      this.db.exec('ALTER TABLE player_quests ADD COLUMN definition_json TEXT');
    }
  }
}
