function normalizedOutcome(value) {
  const outcome = String(value || '').trim().toLowerCase();
  if (!['win', 'loss', 'draw'].includes(outcome)) throw new Error('Duel outcome must be win, loss, or draw.');
  return outcome;
}

function requiredId(value, label) {
  const id = String(value || '').trim();
  if (!id) throw new Error(`${label} is required.`);
  return id;
}

function rowResult(row) {
  if (!row) return null;
  return Object.freeze({
    duelId: row.duel_id,
    challengerId: row.challenger_id,
    opponentId: row.opponent_id,
    outcome: row.outcome,
    winnerId: row.winner_id,
    loserId: row.loser_id,
    turnCount: row.turn_count,
    battleReplay: row.battle_replay_json ? JSON.parse(row.battle_replay_json) : null,
    createdAt: row.created_at,
  });
}

function perspectiveOutcome(row, participantId) {
  if (row.outcome === 'draw') return 'draw';
  const challengerWon = row.outcome === 'win';
  const participantWon = row.challenger_id === participantId ? challengerWon : !challengerWon;
  return participantWon ? 'win' : 'loss';
}

export class SQLiteDuelRepository {
  constructor({ database }) {
    if (!database) throw new Error('SQLiteDuelRepository requires a database.');
    this.db = database;
    this.#migrate();
  }

  get(duelId) {
    return rowResult(this.db.prepare('SELECT * FROM duel_results WHERE duel_id = ?').get(String(duelId || '').trim()));
  }

  recordResult({ duelId, challengerId, opponentId, outcome, winnerId = null, loserId = null, turnCount = 0, battleReplay = null }) {
    const id = requiredId(duelId, 'Duel id');
    const challenger = requiredId(challengerId, 'Duel challenger id');
    const opponent = requiredId(opponentId, 'Duel opponent id');
    if (challenger === opponent) throw new Error('Duel participants must be different.');
    const result = normalizedOutcome(outcome);
    const turns = Number(turnCount);
    if (!Number.isInteger(turns) || turns < 0) throw new Error('Duel turn count must be a non-negative integer.');
    if (battleReplay !== null && (!battleReplay || typeof battleReplay !== 'object' || Array.isArray(battleReplay))) {
      throw new Error('Duel battle replay must be an object or null.');
    }
    const replayJson = battleReplay == null ? null : JSON.stringify(battleReplay);

    const existing = this.get(id);
    if (existing) {
      const same = existing.challengerId === challenger
        && existing.opponentId === opponent
        && existing.outcome === result
        && existing.winnerId === (winnerId || null)
        && existing.loserId === (loserId || null)
        && existing.turnCount === turns;
      const replayMatches = !battleReplay || !existing.battleReplay
        || JSON.stringify(existing.battleReplay) === replayJson;
      if (!same || !replayMatches) {
        const error = new Error('Duel id was already used for a different result.');
        error.code = 'duel_replay_mismatch';
        throw error;
      }
      return Object.freeze({ applied: false, replayed: true, duel: existing });
    }

    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO duel_results (
        duel_id, challenger_id, opponent_id, outcome, winner_id, loser_id, turn_count, battle_replay_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, challenger, opponent, result, winnerId || null, loserId || null, turns, replayJson);

    const persisted = this.get(id);
    if (!persisted) throw new Error('Duel result could not be persisted.');
    if (insert.changes === 0) {
      const same = persisted.challengerId === challenger
        && persisted.opponentId === opponent
        && persisted.outcome === result
        && persisted.winnerId === (winnerId || null)
        && persisted.loserId === (loserId || null)
        && persisted.turnCount === turns;
      const replayMatches = !battleReplay || !persisted.battleReplay
        || JSON.stringify(persisted.battleReplay) === replayJson;
      if (!same || !replayMatches) {
        const error = new Error('Duel id was already used for a different result.');
        error.code = 'duel_replay_mismatch';
        throw error;
      }
      return Object.freeze({ applied: false, replayed: true, duel: persisted });
    }
    return Object.freeze({ applied: true, replayed: false, duel: persisted });
  }

  recordFor(participantId) {
    const id = requiredId(participantId, 'Duel participant id');
    const rows = this.db.prepare(`
      SELECT challenger_id, opponent_id, outcome
      FROM duel_results
      WHERE challenger_id = ? OR opponent_id = ?
    `).all(id, id);

    let wins = 0;
    let losses = 0;
    let draws = 0;
    for (const row of rows) {
      const outcome = perspectiveOutcome(row, id);
      if (outcome === 'draw') draws += 1;
      else if (outcome === 'win') wins += 1;
      else losses += 1;
    }
    return Object.freeze({ wins, losses, draws, total: wins + losses + draws });
  }

  listRecentFor(participantId, limit = 5) {
    const id = requiredId(participantId, 'Duel participant id');
    const boundedLimit = Math.max(1, Math.min(20, Math.floor(Number(limit)) || 5));
    return Object.freeze(this.db.prepare(`
      SELECT duel_id, challenger_id, opponent_id, outcome, winner_id, loser_id, turn_count, created_at
      FROM duel_results
      WHERE challenger_id = ? OR opponent_id = ?
      ORDER BY datetime(created_at) DESC, duel_id DESC
      LIMIT ?
    `).all(id, id, boundedLimit).map((row) => Object.freeze({
      duelId: row.duel_id,
      outcome: perspectiveOutcome(row, id),
      opponentId: row.challenger_id === id ? row.opponent_id : row.challenger_id,
      turnCount: row.turn_count,
      createdAt: row.created_at,
    })));
  }

  #migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS duel_results (
        duel_id TEXT PRIMARY KEY,
        challenger_id TEXT NOT NULL,
        opponent_id TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK(outcome IN ('win', 'loss', 'draw')),
        winner_id TEXT NULL,
        loser_id TEXT NULL,
        turn_count INTEGER NOT NULL DEFAULT 0 CHECK(turn_count >= 0),
        battle_replay_json TEXT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK(challenger_id <> opponent_id)
      );
      CREATE INDEX IF NOT EXISTS idx_duel_results_challenger ON duel_results(challenger_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_duel_results_opponent ON duel_results(opponent_id, created_at);
    `);
    const columns = this.db.prepare('PRAGMA table_info(duel_results)').all();
    if (!columns.some((column) => column.name === 'battle_replay_json')) {
      this.db.exec('ALTER TABLE duel_results ADD COLUMN battle_replay_json TEXT NULL');
    }
  }
}
