function parseJson(value) {
  return JSON.parse(value);
}

function rowFlip(row) {
  if (!row) return null;
  return Object.freeze({
    id: row.id,
    playerId: row.player_id,
    wager: Number(row.wager),
    choice: row.choice,
    result: row.result,
    outcome: row.outcome,
    payoutGold: Number(row.payout_gold || 0),
    createdAt: row.created_at,
  });
}

function requiredText(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

export class SQLiteCoinflipRepository {
  constructor({ database }) {
    if (!database) throw new Error('SQLiteCoinflipRepository requires a database.');
    this.db = database;
    this.#migrate();
  }

  getFlip(flipId) {
    return rowFlip(this.db.prepare('SELECT * FROM coinflip_rounds WHERE id = ?').get(String(flipId || '').trim()));
  }

  carriedGold(playerId) {
    const row = this.db.prepare('SELECT thread_dust FROM players WHERE id = ?').get(String(playerId || '').trim());
    if (!row) {
      const error = new Error('Player not found.');
      error.code = 'coinflip_player_not_found';
      throw error;
    }
    return Number(row.thread_dust || 0);
  }

  settle({ playerId, idempotencyKey, fingerprint, flip, responseFactory }) {
    const ownerId = requiredText(playerId, 'Coinflip player id');
    const key = requiredText(idempotencyKey, 'Coinflip idempotency key');
    const requestFingerprint = requiredText(fingerprint, 'Coinflip request fingerprint');
    if (!flip || flip.playerId !== ownerId) throw new Error('Coinflip owner does not match the player.');
    if (typeof responseFactory !== 'function') throw new Error('Coinflip response factory is required.');

    this.db.exec('BEGIN IMMEDIATE');
    try {
      const replay = this.#replay(ownerId, key, requestFingerprint);
      if (replay) {
        this.db.exec('COMMIT');
        return { replayed: true, response: replay };
      }

      const before = this.carriedGold(ownerId);
      if (before < flip.wager) {
        const error = new Error(`You only carry ${before} Gold, but this Coinflip wager costs ${flip.wager} Gold.`);
        error.code = 'insufficient_coinflip_gold';
        throw error;
      }

      this.db.prepare('UPDATE players SET thread_dust = thread_dust - ? WHERE id = ?').run(flip.wager, ownerId);
      this.#insertFlip(flip);
      if (flip.payoutGold > 0) {
        this.db.prepare('UPDATE players SET thread_dust = thread_dust + ? WHERE id = ?').run(flip.payoutGold, ownerId);
      }
      const carriedGold = this.carriedGold(ownerId);
      const response = responseFactory({ flip: this.getFlip(flip.id), carriedGold });
      this.#recordCommand({
        playerId: ownerId,
        idempotencyKey: key,
        fingerprint: requestFingerprint,
        flipId: flip.id,
        response,
      });
      this.db.exec('COMMIT');
      return { replayed: false, response };
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  #replay(playerId, idempotencyKey, fingerprint) {
    const row = this.db.prepare(`
      SELECT request_fingerprint, response_json
      FROM coinflip_command_idempotency
      WHERE player_id = ? AND idempotency_key = ?
    `).get(playerId, idempotencyKey);
    if (!row) return null;
    if (row.request_fingerprint !== fingerprint) {
      const error = new Error('This Idempotency-Key was already used for a different Coinflip command.');
      error.code = 'coinflip_replay_mismatch';
      throw error;
    }
    return parseJson(row.response_json);
  }

  #recordCommand({ playerId, idempotencyKey, fingerprint, flipId, response }) {
    this.db.prepare(`
      INSERT INTO coinflip_command_idempotency (
        player_id, idempotency_key, request_fingerprint, flip_id, response_json
      ) VALUES (?, ?, ?, ?, ?)
    `).run(playerId, idempotencyKey, fingerprint, flipId, JSON.stringify(response));
  }

  #insertFlip(flip) {
    this.db.prepare(`
      INSERT INTO coinflip_rounds (
        id, player_id, wager, choice, result, outcome, payout_gold
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      flip.id,
      flip.playerId,
      flip.wager,
      flip.choice,
      flip.result,
      flip.outcome,
      flip.payoutGold,
    );
  }

  #migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS coinflip_rounds (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        wager INTEGER NOT NULL CHECK(wager > 0),
        choice TEXT NOT NULL CHECK(choice IN ('heads', 'tails')),
        result TEXT NOT NULL CHECK(result IN ('heads', 'tails')),
        outcome TEXT NOT NULL CHECK(outcome IN ('win', 'loss')),
        payout_gold INTEGER NOT NULL DEFAULT 0 CHECK(payout_gold >= 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_coinflip_rounds_player_created
        ON coinflip_rounds(player_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS coinflip_command_idempotency (
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        idempotency_key TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL,
        flip_id TEXT NOT NULL REFERENCES coinflip_rounds(id) ON DELETE CASCADE,
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (player_id, idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS idx_coinflip_commands_round
        ON coinflip_command_idempotency(flip_id, created_at);
    `);
  }
}
