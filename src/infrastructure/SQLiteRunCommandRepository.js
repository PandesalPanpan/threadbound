export class SQLiteRunCommandRepository {
  constructor({ database }) {
    if (!database) throw new Error('SQLiteRunCommandRepository requires a database.');
    this.db = database;
    this.#migrate();
  }

  claim({ playerId, idempotencyKey, fingerprint, commandName, runId }) {
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO run_command_idempotency (
        player_id, idempotency_key, request_fingerprint, command_name, run_id, state
      ) VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(playerId, idempotencyKey, fingerprint, commandName, runId);
    return {
      claimed: result.changes === 1,
      record: this.get(playerId, idempotencyKey),
    };
  }

  get(playerId, idempotencyKey) {
    const row = this.db.prepare(`
      SELECT player_id, idempotency_key, request_fingerprint, command_name, run_id,
             state, response_status, response_json, created_at, completed_at
      FROM run_command_idempotency
      WHERE player_id = ? AND idempotency_key = ?
    `).get(playerId, idempotencyKey);
    if (!row) return null;
    return {
      playerId: row.player_id,
      idempotencyKey: row.idempotency_key,
      fingerprint: row.request_fingerprint,
      commandName: row.command_name,
      runId: row.run_id,
      state: row.state,
      responseStatus: row.response_status,
      responseBody: row.response_json == null ? null : JSON.parse(row.response_json),
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }

  complete({ playerId, idempotencyKey, fingerprint, responseStatus, responseBody }) {
    const result = this.db.prepare(`
      UPDATE run_command_idempotency
      SET state = 'completed', response_status = ?, response_json = ?, completed_at = CURRENT_TIMESTAMP
      WHERE player_id = ? AND idempotency_key = ? AND request_fingerprint = ? AND state = 'pending'
    `).run(responseStatus, JSON.stringify(responseBody), playerId, idempotencyKey, fingerprint);
    if (result.changes !== 1) {
      const error = new Error('Run command idempotency claim could not be completed safely.');
      error.code = 'run_command_claim_lost';
      throw error;
    }
    return this.get(playerId, idempotencyKey);
  }

  #migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS run_command_idempotency (
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        idempotency_key TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL,
        command_name TEXT NOT NULL,
        run_id TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('pending', 'completed')),
        response_status INTEGER NULL,
        response_json TEXT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT NULL,
        PRIMARY KEY (player_id, idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS idx_run_command_idempotency_run
        ON run_command_idempotency(run_id, created_at);
    `);
  }
}
