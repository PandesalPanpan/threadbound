function normalizeCost(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

export class SQLiteShopRepository {
  constructor({ database }) {
    this.db = database;
  }

  purchaseEquipment({ playerId, cost, item }) {
    const price = normalizeCost(cost);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const player = this.db.prepare('SELECT thread_dust FROM players WHERE id = ?').get(playerId);
      if (!player) throw new Error('Player not found.');
      if (player.thread_dust < price) {
        const error = new Error(`You need ${price} Gold to buy this equipment.`);
        error.code = 'insufficient_gold';
        error.legacyCode = 'insufficient_thread_dust';
        throw error;
      }
      this.db.prepare(`
        INSERT INTO items (
          id, player_id, definition_id, name, slot, rarity, attack_bonus,
          effect_code, effect_json, visual_asset_id, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        item.id,
        playerId,
        item.definitionId,
        item.name,
        item.slot,
        item.rarity,
        item.attackBonus,
        item.effectCode,
        JSON.stringify(item.effect),
        item.visualAssetId || null,
        item.source,
      );
      this.db.prepare('UPDATE players SET thread_dust = thread_dust - ? WHERE id = ?').run(price, playerId);
      this.db.exec('COMMIT');
      return { cost: price, gold: player.thread_dust - price, threadDust: player.thread_dust - price, item };
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }
}
