import { emptyEquipmentLoadout, normalizeEquipmentSlot } from '../domain/EquipmentSlotPolicy.js';

function decodeItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    playerId: row.player_id,
    definitionId: row.definition_id,
    name: row.name,
    slot: row.slot,
    rarity: row.rarity,
    attackBonus: row.attack_bonus,
    effectCode: row.effect_code,
    effect: JSON.parse(row.effect_json),
    visualAssetId: row.visual_asset_id || null,
    source: row.source,
    createdAt: row.created_at,
  };
}

export class SQLiteEquipmentRepository {
  constructor({ database }) {
    this.db = database;
    this.#migrate();
  }

  getLoadout(playerId) {
    const loadout = emptyEquipmentLoadout();
    const rows = this.db.prepare(`
      SELECT i.*
      FROM player_equipment pe
      JOIN items i ON i.id = pe.item_id
      WHERE pe.player_id = ?
    `).all(playerId);
    for (const row of rows) loadout[normalizeEquipmentSlot(row.slot)] = decodeItem(row);
    return loadout;
  }

  equip(playerId, itemId) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const item = this.db.prepare('SELECT * FROM items WHERE id = ? AND player_id = ?').get(itemId, playerId);
      if (!item) throw new Error('Item not found.');
      const slot = normalizeEquipmentSlot(item.slot);
      const activeRun = this.db.prepare("SELECT 1 FROM dungeon_runs dr JOIN dungeon_run_participants rp ON rp.run_id = dr.id WHERE rp.player_id = ? AND dr.phase IN ('combat', 'event', 'upgrade', 'boss') LIMIT 1").get(playerId);
      if (activeRun) {
        const error = new Error('Finish the active dungeon before changing equipped equipment.');
        error.code = 'item_equip_during_run';
        throw error;
      }
      this.db.prepare(`
        INSERT INTO player_equipment (player_id, slot, item_id)
        VALUES (?, ?, ?)
        ON CONFLICT(player_id, slot) DO UPDATE SET item_id = excluded.item_id
      `).run(playerId, slot, itemId);
      // Migration compatibility: current combat/read paths still consume this single pointer.
      // Keep it synchronized only for Weapon until those callers move to the loadout model.
      if (slot === 'weapon') this.db.prepare('UPDATE players SET equipped_item_id = ? WHERE id = ?').run(itemId, playerId);
      this.db.exec('COMMIT');
      return { slot, item: decodeItem(item) };
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  isEquipped(playerId, itemId) {
    return Boolean(this.db.prepare('SELECT 1 FROM player_equipment WHERE player_id = ? AND item_id = ? LIMIT 1').get(playerId, itemId));
  }

  #migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS player_equipment (
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        slot TEXT NOT NULL CHECK(slot IN ('weapon', 'helmet', 'armor', 'boots', 'accessory')),
        item_id TEXT NOT NULL UNIQUE REFERENCES items(id) ON DELETE CASCADE,
        PRIMARY KEY (player_id, slot)
      );
    `);
    // Existing persisted users may already have one equipped weapon through the legacy
    // players.equipped_item_id pointer. Import only valid owned items and never rewrite it.
    this.db.exec(`
      INSERT OR IGNORE INTO player_equipment (player_id, slot, item_id)
      SELECT p.id, 'weapon', i.id
      FROM players p
      JOIN items i ON i.id = p.equipped_item_id AND i.player_id = p.id
      WHERE p.equipped_item_id IS NOT NULL AND lower(i.slot) = 'weapon';
    `);
  }
}
