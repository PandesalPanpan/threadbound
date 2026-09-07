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
}
