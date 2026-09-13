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

function rowToProgress(row) {
  if (!row) return null;
  return new QuestProgress({
    questId: row.quest_id,
    status: row.status,
    acceptedAt: row.accepted_at,
    completedAt: row.completed_at,
    claimedAt: row.claimed_at,
    objectiveProgress: parseObjectiveProgress(row.objective_progress_json),
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
      SELECT quest_id, status, accepted_at, completed_at, claimed_at, objective_progress_json
      FROM player_quests
      WHERE player_id = ? AND quest_id = ?
    `).get(playerId, questId));
  }

  list(playerId) {
    this.#requirePlayer(playerId);
    return Object.freeze(this.db.prepare(`
      SELECT quest_id, status, accepted_at, completed_at, claimed_at, objective_progress_json
      FROM player_quests
      WHERE player_id = ?
      ORDER BY accepted_at ASC, quest_id ASC
    `).all(playerId).map(rowToProgress));
  }

  accept(playerId, questId, acceptedAt = new Date().toISOString(), objectiveProgress = []) {
    this.#requirePlayer(playerId);
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO player_quests (player_id, quest_id, status, accepted_at, objective_progress_json)
      VALUES (?, ?, 'active', ?, ?)
    `).run(playerId, questId, acceptedAt, JSON.stringify(objectiveProgress || []));
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
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (player_id, quest_id)
      );
      CREATE INDEX IF NOT EXISTS idx_player_quests_status ON player_quests(player_id, status);
    `);
    const columns = this.db.prepare('PRAGMA table_info(player_quests)').all().map((column) => column.name);
    if (!columns.includes('objective_progress_json')) {
      this.db.exec("ALTER TABLE player_quests ADD COLUMN objective_progress_json TEXT NOT NULL DEFAULT '[]'");
    }
  }
}
