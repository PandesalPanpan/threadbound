export class SQLiteInventoryRepository {
  constructor({ database }) {
    this.db = database;
  }

  salvageItem({ playerId, itemId, threadDust }) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const item = this.db.prepare('SELECT * FROM items WHERE id = ? AND player_id = ?').get(itemId, playerId);
      if (!item) throw new Error('Item not found.');
      const player = this.db.prepare('SELECT equipped_item_id FROM players WHERE id = ?').get(playerId);
      if (!player) throw new Error('Player not found.');
      if (player.equipped_item_id === itemId) {
        const error = new Error('Equipped gear cannot be salvaged. Equip another item first.');
        error.code = 'equipped_item_cannot_be_salvaged';
        throw error;
      }
      const removed = this.db.prepare('DELETE FROM items WHERE id = ? AND player_id = ?').run(itemId, playerId);
      if (removed.changes !== 1) throw new Error('Item changed before it could be salvaged.');
      this.db.prepare('UPDATE players SET thread_dust = thread_dust + ? WHERE id = ?').run(threadDust, playerId);
      this.db.exec('COMMIT');
      return {
        id: item.id,
        playerId: item.player_id,
        name: item.name,
        rarity: item.rarity,
        attackBonus: item.attack_bonus,
        threadDust,
      };
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  upgradeItem({ playerId, itemId, expectedLevel, cost, attackIncrease, attunementCode }) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      // This check belongs inside the same write transaction as Dust spending and item
      // mutation. The Service Layer keeps its earlier check for fast feedback, but only
      // this lock closes the race with a dungeon start committing at the same time.
      const activeRun = this.db.prepare("SELECT 1 FROM dungeon_runs dr JOIN dungeon_run_participants rp ON rp.run_id = dr.id WHERE rp.player_id = ? AND dr.phase IN ('combat', 'event', 'upgrade', 'boss') LIMIT 1").get(playerId);
      if (activeRun) {
        const error = new Error('Finish the active dungeon before Tempering a relic.');
        error.code = 'relic_upgrade_during_run';
        throw error;
      }

      const item = this.db.prepare('SELECT * FROM items WHERE id = ? AND player_id = ?').get(itemId, playerId);
      if (!item) throw new Error('Item not found.');
      const player = this.db.prepare('SELECT thread_dust FROM players WHERE id = ?').get(playerId);
      if (!player) throw new Error('Player not found.');

      const effect = JSON.parse(item.effect_json || '{}');
      const storedLevel = Number(effect.upgradeLevel || 0);
      if (storedLevel !== expectedLevel) {
        const error = new Error('Relic progression changed before this Temper could be applied. Refresh and retry.');
        error.code = 'stale_relic_upgrade';
        throw error;
      }
      if (Number(player.thread_dust || 0) < cost) {
        const error = new Error(`You need ${cost} Thread Dust to Temper this relic.`);
        error.code = 'insufficient_thread_dust';
        throw error;
      }

      effect.upgradeLevel = expectedLevel + 1;
      effect.attunementCode ||= attunementCode;
      const updated = this.db.prepare('UPDATE items SET attack_bonus = attack_bonus + ?, effect_json = ? WHERE id = ? AND player_id = ?').run(
        attackIncrease,
        JSON.stringify(effect),
        itemId,
        playerId,
      );
      if (updated.changes !== 1) throw new Error('Relic changed before it could be Tempered.');
      this.db.prepare('UPDATE players SET thread_dust = thread_dust - ? WHERE id = ?').run(cost, playerId);
      this.db.exec('COMMIT');
      return {
        id: item.id,
        playerId: item.player_id,
        level: effect.upgradeLevel,
        attunementCode: effect.attunementCode,
        threadDustSpent: cost,
        attackIncrease,
      };
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }
}
