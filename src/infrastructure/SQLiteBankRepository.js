function normalizeAmount(value) {
  const amount = Math.floor(Number(value));
  if (!Number.isInteger(amount) || amount <= 0) {
    const error = new Error('Bank amount must be a positive whole number of Gold.');
    error.code = 'invalid_bank_amount';
    throw error;
  }
  return amount;
}

function normalizeLoss(value) {
  const amount = Math.floor(Number(value));
  if (!Number.isInteger(amount) || amount < 0) {
    const error = new Error('Carried Gold loss must be a non-negative whole number.');
    error.code = 'invalid_carried_gold_loss';
    throw error;
  }
  return amount;
}

export class SQLiteBankRepository {
  constructor({ database }) {
    this.db = database;
    this.#migrate();
  }

  getBalance(playerId) {
    const row = this.db.prepare(`
      SELECT p.thread_dust AS carried_gold, COALESCE(b.banked_gold, 0) AS banked_gold
      FROM players p
      LEFT JOIN player_bank_balances b ON b.player_id = p.id
      WHERE p.id = ?
    `).get(playerId);
    if (!row) throw new Error('Player not found.');
    return { carriedGold: Number(row.carried_gold || 0), bankedGold: Number(row.banked_gold || 0) };
  }

  loseCarriedGold(playerId, value) {
    const requested = normalizeLoss(value);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const before = this.getBalance(playerId);
      const goldLost = Math.min(before.carriedGold, requested);
      if (goldLost > 0) {
        this.db.prepare('UPDATE players SET thread_dust = thread_dust - ? WHERE id = ?').run(goldLost, playerId);
      }
      const after = this.getBalance(playerId);
      this.db.exec('COMMIT');
      return {
        carriedGoldBefore: before.carriedGold,
        carriedGold: after.carriedGold,
        bankedGold: after.bankedGold,
        goldLost,
      };
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  deposit(playerId, value) {
    const amount = normalizeAmount(value);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const balance = this.getBalance(playerId);
      if (balance.carriedGold < amount) {
        const error = new Error(`You only carry ${balance.carriedGold} Gold.`);
        error.code = 'insufficient_carried_gold';
        throw error;
      }
      this.db.prepare('UPDATE players SET thread_dust = thread_dust - ? WHERE id = ?').run(amount, playerId);
      this.db.prepare(`
        INSERT INTO player_bank_balances (player_id, banked_gold)
        VALUES (?, ?)
        ON CONFLICT(player_id) DO UPDATE SET banked_gold = banked_gold + excluded.banked_gold
      `).run(playerId, amount);
      this.db.exec('COMMIT');
      return this.getBalance(playerId);
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  withdraw(playerId, value) {
    const amount = normalizeAmount(value);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const balance = this.getBalance(playerId);
      if (balance.bankedGold < amount) {
        const error = new Error(`You only have ${balance.bankedGold} Gold banked.`);
        error.code = 'insufficient_banked_gold';
        throw error;
      }
      this.db.prepare('UPDATE player_bank_balances SET banked_gold = banked_gold - ? WHERE player_id = ?').run(amount, playerId);
      this.db.prepare('UPDATE players SET thread_dust = thread_dust + ? WHERE id = ?').run(amount, playerId);
      this.db.exec('COMMIT');
      return this.getBalance(playerId);
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  #migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS player_bank_balances (
        player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
        banked_gold INTEGER NOT NULL DEFAULT 0 CHECK(banked_gold >= 0)
      );
    `);
  }
}

export { normalizeAmount, normalizeLoss };
