function parseJson(value) {
  return JSON.parse(value);
}

function rowSpin(row) {
  if (!row) return null;
  return Object.freeze({
    id: row.id,
    playerId: row.player_id,
    wager: Number(row.wager),
    reels: Object.freeze([row.reel_1, row.reel_2, row.reel_3]),
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

export class SQLiteSlotsRepository {
  constructor({ database }) {
    if (!database) throw new Error('SQLiteSlotsRepository requires a database.');
    this.db = database;
    this.#migrate();
  }

  getSpin(spinId) {
    return rowSpin(this.db.prepare('SELECT * FROM slots_spins WHERE id = ?').get(String(spinId || '').trim()));
  }

  carriedGold(playerId) {
    const row = this.db.prepare('SELECT thread_dust FROM players WHERE id = ?').get(String(playerId || '').trim());
    if (!row) {
      const error = new Error('Player not found.');
      error.code = 'slots_player_not_found';
      throw error;
    }
    return Number(row.thread_dust || 0);
  }

  settle({ playerId, idempotencyKey, fingerprint, spin, responseFactory }) {
    const ownerId = requiredText(playerId, 'Slots player id');
    const key = requiredText(idempotencyKey, 'Slots idempotency key');
    const requestFingerprint = requiredText(fingerprint, 'Slots request fingerprint');
    if (!spin || spin.playerId !== ownerId) throw new Error('Slots owner does not match the player.');
    if (typeof responseFactory !== 'function') throw new Error('Slots response factory is required.');

    this.db.exec('BEGIN IMMEDIATE');
    try {
      const replay = this.#replay(ownerId, key, requestFingerprint);
      if (replay) {
        this.db.exec('COMMIT');
        return { replayed: true, response: replay };
      }

      const before = this.carriedGold(ownerId);
      if (before < spin.wager) {
        const error = new Error(`You only carry ${before} Gold, but this Slots wager costs ${spin.wager} Gold.`);
        error.code = 'insufficient_slots_gold';
        throw error;
      }

      this.db.prepare('UPDATE players SET thread_dust = thread_dust - ? WHERE id = ?').run(spin.wager, ownerId);
      this.#insertSpin(spin);
      if (spin.payoutGold > 0) {
        this.db.prepare('UPDATE players SET thread_dust = thread_dust + ? WHERE id = ?').run(spin.payoutGold, ownerId);
      }
      const carriedGold = this.carriedGold(ownerId);
      const response = responseFactory({ spin: this.getSpin(spin.id), carriedGold });
      this.#recordCommand({
        playerId: ownerId,
        idempotencyKey: key,
        fingerprint: requestFingerprint,
        spinId: spin.id,
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
      FROM slots_command_idempotency
      WHERE player_id = ? AND idempotency_key = ?
    `).get(playerId, idempotencyKey);
    if (!row) return null;
    if (row.request_fingerprint !== fingerprint) {
      const error = new Error('This Idempotency-Key was already used for a different Slots command.');
      error.code = 'slots_replay_mismatch';
      throw error;
    }
    return parseJson(row.response_json);
  }

  #recordCommand({ playerId, idempotencyKey, fingerprint, spinId, response }) {
    this.db.prepare(`
      INSERT INTO slots_command_idempotency (
        player_id, idempotency_key, request_fingerprint, spin_id, response_json
      ) VALUES (?, ?, ?, ?, ?)
    `).run(playerId, idempotencyKey, fingerprint, spinId, JSON.stringify(response));
  }

  #insertSpin(spin) {
    this.db.prepare(`
      INSERT INTO slots_spins (
        id, player_id, wager, reel_1, reel_2, reel_3, outcome, payout_gold
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      spin.id,
      spin.playerId,
      spin.wager,
      spin.reels[0],
      spin.reels[1],
      spin.reels[2],
      spin.outcome,
      spin.payoutGold,
    );
  }

  #migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS slots_spins (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        wager INTEGER NOT NULL CHECK(wager > 0),
        reel_1 TEXT NOT NULL,
        reel_2 TEXT NOT NULL,
        reel_3 TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK(outcome IN ('jackpot', 'win', 'loss')),
        payout_gold INTEGER NOT NULL DEFAULT 0 CHECK(payout_gold >= 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_slots_spins_player_created
        ON slots_spins(player_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS slots_command_idempotency (
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        idempotency_key TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL,
        spin_id TEXT NOT NULL REFERENCES slots_spins(id) ON DELETE CASCADE,
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (player_id, idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS idx_slots_commands_spin
        ON slots_command_idempotency(spin_id, created_at);
    `);
  }
}
