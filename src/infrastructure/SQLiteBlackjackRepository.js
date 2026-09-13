function parseJson(value, fallback) {
  if (value == null) return fallback;
  return JSON.parse(value);
}

function rowRound(row) {
  if (!row) return null;
  return Object.freeze({
    id: row.id,
    playerId: row.player_id,
    wager: Number(row.wager),
    deck: Object.freeze(parseJson(row.deck_json, [])),
    nextCardIndex: Number(row.next_card_index),
    playerHand: Object.freeze(parseJson(row.player_hand_json, [])),
    dealerHand: Object.freeze(parseJson(row.dealer_hand_json, [])),
    status: row.status,
    outcome: row.outcome,
    payoutGold: Number(row.payout_gold || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
  });
}

function requiredText(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

export class SQLiteBlackjackRepository {
  constructor({ database }) {
    if (!database) throw new Error('SQLiteBlackjackRepository requires a database.');
    this.db = database;
    this.#migrate();
  }

  getRound(roundId) {
    return rowRound(this.db.prepare('SELECT * FROM blackjack_rounds WHERE id = ?').get(String(roundId || '').trim()));
  }

  getActiveRound(playerId) {
    return rowRound(this.db.prepare(`
      SELECT * FROM blackjack_rounds
      WHERE player_id = ? AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(String(playerId || '').trim()));
  }

  carriedGold(playerId) {
    const row = this.db.prepare('SELECT thread_dust FROM players WHERE id = ?').get(String(playerId || '').trim());
    if (!row) {
      const error = new Error('Player not found.');
      error.code = 'blackjack_player_not_found';
      throw error;
    }
    return Number(row.thread_dust || 0);
  }

  startRound({ playerId, idempotencyKey, fingerprint, round, responseFactory }) {
    const ownerId = requiredText(playerId, 'Blackjack player id');
    const key = requiredText(idempotencyKey, 'Blackjack idempotency key');
    const requestFingerprint = requiredText(fingerprint, 'Blackjack request fingerprint');
    if (!round || round.playerId !== ownerId) throw new Error('Blackjack round owner does not match the player.');
    if (typeof responseFactory !== 'function') throw new Error('Blackjack response factory is required.');

    this.db.exec('BEGIN IMMEDIATE');
    try {
      const replay = this.#replay(ownerId, key, requestFingerprint);
      if (replay) {
        this.db.exec('COMMIT');
        return { replayed: true, response: replay };
      }
      if (this.getActiveRound(ownerId)) {
        const error = new Error('Finish the active Blackjack round before starting another.');
        error.code = 'blackjack_round_active';
        throw error;
      }
      const before = this.carriedGold(ownerId);
      if (before < round.wager) {
        const error = new Error(`You only carry ${before} Gold, but this Blackjack wager costs ${round.wager} Gold.`);
        error.code = 'insufficient_blackjack_gold';
        throw error;
      }

      this.db.prepare('UPDATE players SET thread_dust = thread_dust - ? WHERE id = ?').run(round.wager, ownerId);
      this.#insertRound(round);
      if (round.status === 'resolved' && round.payoutGold > 0) {
        this.db.prepare('UPDATE players SET thread_dust = thread_dust + ? WHERE id = ?').run(round.payoutGold, ownerId);
      }
      const carriedGold = this.carriedGold(ownerId);
      const response = responseFactory({ round: this.getRound(round.id), carriedGold });
      this.#recordCommand({ playerId: ownerId, idempotencyKey: key, fingerprint: requestFingerprint, action: 'start', roundId: round.id, response });
      this.db.exec('COMMIT');
      return { replayed: false, response };
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  applyAction({ playerId, roundId, action, idempotencyKey, fingerprint, resolveRound, responseFactory }) {
    const ownerId = requiredText(playerId, 'Blackjack player id');
    const targetRoundId = requiredText(roundId, 'Blackjack round id');
    const key = requiredText(idempotencyKey, 'Blackjack idempotency key');
    const requestFingerprint = requiredText(fingerprint, 'Blackjack request fingerprint');
    const command = requiredText(action, 'Blackjack action').toLowerCase();
    if (typeof resolveRound !== 'function') throw new Error('Blackjack round resolver is required.');
    if (typeof responseFactory !== 'function') throw new Error('Blackjack response factory is required.');

    this.db.exec('BEGIN IMMEDIATE');
    try {
      const replay = this.#replay(ownerId, key, requestFingerprint);
      if (replay) {
        this.db.exec('COMMIT');
        return { replayed: true, response: replay };
      }
      const current = this.getRound(targetRoundId);
      if (!current || current.playerId !== ownerId) {
        const error = new Error('Blackjack round not found for this player.');
        error.code = 'blackjack_round_not_found';
        throw error;
      }
      if (current.status !== 'active') {
        const error = new Error('This Blackjack round is already resolved.');
        error.code = 'blackjack_round_resolved';
        throw error;
      }

      const next = resolveRound(current, command);
      this.#updateRound(next);
      if (next.status === 'resolved' && next.payoutGold > 0) {
        this.db.prepare('UPDATE players SET thread_dust = thread_dust + ? WHERE id = ?').run(next.payoutGold, ownerId);
      }
      const carriedGold = this.carriedGold(ownerId);
      const response = responseFactory({ round: this.getRound(targetRoundId), carriedGold });
      this.#recordCommand({ playerId: ownerId, idempotencyKey: key, fingerprint: requestFingerprint, action: command, roundId: targetRoundId, response });
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
      FROM blackjack_command_idempotency
      WHERE player_id = ? AND idempotency_key = ?
    `).get(playerId, idempotencyKey);
    if (!row) return null;
    if (row.request_fingerprint !== fingerprint) {
      const error = new Error('This Idempotency-Key was already used for a different Blackjack command.');
      error.code = 'blackjack_replay_mismatch';
      throw error;
    }
    return JSON.parse(row.response_json);
  }

  #recordCommand({ playerId, idempotencyKey, fingerprint, action, roundId, response }) {
    this.db.prepare(`
      INSERT INTO blackjack_command_idempotency (
        player_id, idempotency_key, request_fingerprint, action, round_id, response_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(playerId, idempotencyKey, fingerprint, action, roundId, JSON.stringify(response));
  }

  #insertRound(round) {
    this.db.prepare(`
      INSERT INTO blackjack_rounds (
        id, player_id, wager, deck_json, next_card_index, player_hand_json,
        dealer_hand_json, status, outcome, payout_gold, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'resolved' THEN CURRENT_TIMESTAMP ELSE NULL END)
    `).run(
      round.id,
      round.playerId,
      round.wager,
      JSON.stringify(round.deck),
      round.nextCardIndex,
      JSON.stringify(round.playerHand),
      JSON.stringify(round.dealerHand),
      round.status,
      round.outcome,
      round.payoutGold,
      round.status,
    );
  }

  #updateRound(round) {
    this.db.prepare(`
      UPDATE blackjack_rounds
      SET next_card_index = ?, player_hand_json = ?, dealer_hand_json = ?, status = ?,
          outcome = ?, payout_gold = ?, updated_at = CURRENT_TIMESTAMP,
          resolved_at = CASE WHEN ? = 'resolved' THEN COALESCE(resolved_at, CURRENT_TIMESTAMP) ELSE NULL END
      WHERE id = ?
    `).run(
      round.nextCardIndex,
      JSON.stringify(round.playerHand),
      JSON.stringify(round.dealerHand),
      round.status,
      round.outcome,
      round.payoutGold,
      round.status,
      round.id,
    );
  }

  #migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS blackjack_rounds (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        wager INTEGER NOT NULL CHECK(wager > 0),
        deck_json TEXT NOT NULL,
        next_card_index INTEGER NOT NULL CHECK(next_card_index >= 0),
        player_hand_json TEXT NOT NULL,
        dealer_hand_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active', 'resolved')),
        outcome TEXT NULL CHECK(outcome IS NULL OR outcome IN ('win', 'loss', 'push')),
        payout_gold INTEGER NOT NULL DEFAULT 0 CHECK(payout_gold >= 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolved_at TEXT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_blackjack_one_active_round
        ON blackjack_rounds(player_id) WHERE status = 'active';
      CREATE INDEX IF NOT EXISTS idx_blackjack_rounds_player_created
        ON blackjack_rounds(player_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS blackjack_command_idempotency (
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        idempotency_key TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL,
        action TEXT NOT NULL,
        round_id TEXT NOT NULL REFERENCES blackjack_rounds(id) ON DELETE CASCADE,
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (player_id, idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS idx_blackjack_commands_round
        ON blackjack_command_idempotency(round_id, created_at);
    `);
  }
}
