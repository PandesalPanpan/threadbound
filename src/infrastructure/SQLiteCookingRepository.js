import { normalizeCookingRecipe, planCookingConsumption } from '../domain/CookingRecipePolicy.js';
import { isItemLossProtected, SQLiteEquipmentRepository } from './SQLiteEquipmentRepository.js';
import { SQLiteFightBuffRepository } from './SQLiteFightBuffRepository.js';

function ingredientCandidate(row) {
  let effect = {};
  try { effect = JSON.parse(row.effect_json || '{}'); } catch {}
  return {
    id: row.id,
    definitionId: row.definition_id,
    source: row.source,
    effect,
  };
}

export class SQLiteCookingRepository {
  constructor({ database } = {}) {
    if (!database) throw new Error('SQLiteCookingRepository requires the shared database.');
    this.db = database;
    // Cooking must protect every canonical equipped slot even when this repository
    // is constructed directly in a focused worker/test before another service has
    // initialized equipment persistence.
    this.equipmentRepository = new SQLiteEquipmentRepository({ database });
    this.fightBuffRepository = new SQLiteFightBuffRepository({ database });
  }

  cook({ playerId, recipe }) {
    const normalized = normalizeCookingRecipe(recipe);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const player = this.db.prepare('SELECT id, equipped_item_id FROM players WHERE id = ?').get(playerId);
      if (!player) throw new Error('Player not found.');

      const activeRun = this.db.prepare("SELECT 1 FROM dungeon_runs dr JOIN dungeon_run_participants rp ON rp.run_id = dr.id WHERE rp.player_id = ? AND dr.phase IN ('combat', 'event', 'upgrade', 'boss') LIMIT 1").get(playerId);
      if (activeRun) {
        const error = new Error('Finish the active dungeon before cooking.');
        error.code = 'cooking_during_dungeon';
        throw error;
      }

      const area = this.db.prepare('SELECT highest_unlocked_area_number FROM player_area_progression WHERE player_id = ?').get(playerId);
      const highestUnlockedAreaNumber = Number(area?.highest_unlocked_area_number || 1);
      if (highestUnlockedAreaNumber < normalized.areaNumber) {
        const error = new Error(`Unlock Area ${normalized.areaNumber} before cooking ${normalized.name}.`);
        error.code = 'cooking_area_locked';
        error.requiredAreaNumber = normalized.areaNumber;
        throw error;
      }

      if (this.fightBuffRepository.hasActive(playerId, normalized.buff.code)) {
        const error = new Error(`${normalized.name}'s buff is already active. Finish its remaining fights before cooking it again.`);
        error.code = 'cooking_buff_already_active';
        throw error;
      }

      const equippedRows = this.db.prepare('SELECT item_id FROM player_equipment WHERE player_id = ?').all(playerId);
      const equippedItemIds = new Set(equippedRows.map((row) => row.item_id));
      if (player.equipped_item_id) equippedItemIds.add(player.equipped_item_id);

      const rows = this.db.prepare(`
        SELECT id, definition_id, source, effect_json, created_at
        FROM items
        WHERE player_id = ?
        ORDER BY created_at ASC, id ASC
      `).all(playerId);
      const eligibleItems = rows
        .map(ingredientCandidate)
        .filter((item) => !equippedItemIds.has(item.id) && !isItemLossProtected(item));

      const plan = planCookingConsumption(normalized, eligibleItems);
      for (const itemId of plan.consumeItemIds) {
        const removed = this.db.prepare('DELETE FROM items WHERE id = ? AND player_id = ?').run(itemId, playerId);
        if (removed.changes !== 1) throw new Error('A cooking ingredient changed before the recipe could be completed.');
      }

      const buff = this.fightBuffRepository.activate({
        playerId,
        buffCode: normalized.buff.code,
        sourceRecipeId: normalized.id,
        fights: normalized.buff.fights,
      });
      this.db.exec('COMMIT');

      return Object.freeze({
        recipe: normalized,
        consumedItemIds: plan.consumeItemIds,
        buff,
      });
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }
}
