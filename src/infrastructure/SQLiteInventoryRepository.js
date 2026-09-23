import { assertEquipmentSellable, equipmentSellValue } from '../domain/EquipmentSellPolicy.js';
import { arcEquipmentBudgetLimit, arcEquipmentBudgetUsed } from '../domain/ArcEquipmentTemplatePolicy.js';
import { equipmentSlotUpgrade } from '../domain/RelicProgressionPolicy.js';

function finiteNonNegative(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export class SQLiteInventoryRepository {
  constructor({ database }) {
    this.db = database;
  }

  sellItem({ playerId, itemId }) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const activeRun = this.db.prepare("SELECT 1 FROM dungeon_runs dr JOIN dungeon_run_participants rp ON rp.run_id = dr.id WHERE rp.player_id = ? AND dr.phase IN ('combat', 'event', 'upgrade', 'boss', 'between_encounter') LIMIT 1").get(playerId);
      if (activeRun) {
        const error = new Error('Finish the active dungeon before selling equipment.');
        error.code = 'item_sell_during_run';
        throw error;
      }

      const item = this.db.prepare('SELECT * FROM items WHERE id = ? AND player_id = ?').get(itemId, playerId);
      if (!item) throw new Error('Item not found.');
      const player = this.db.prepare('SELECT equipped_item_id, thread_dust FROM players WHERE id = ?').get(playerId);
      if (!player) throw new Error('Player not found.');

      const equipped = this.db.prepare('SELECT slot FROM player_equipment WHERE player_id = ? AND item_id = ? LIMIT 1').get(playerId, itemId);
      if (equipped || player.equipped_item_id === itemId) {
        const error = new Error('Equipped equipment cannot be sold. Equip another item first.');
        error.code = 'equipped_item_cannot_be_sold';
        throw error;
      }

      const persistedItem = {
        rarity: item.rarity,
        attackBonus: item.attack_bonus,
        source: item.source,
        effect: JSON.parse(item.effect_json || '{}'),
      };
      assertEquipmentSellable(persistedItem);
      const saleGold = equipmentSellValue(persistedItem);

      const removed = this.db.prepare('DELETE FROM items WHERE id = ? AND player_id = ?').run(itemId, playerId);
      if (removed.changes !== 1) throw new Error('Item changed before it could be sold.');
      this.db.prepare('UPDATE players SET thread_dust = thread_dust + ? WHERE id = ?').run(saleGold, playerId);
      this.db.exec('COMMIT');
      return {
        id: item.id,
        playerId: item.player_id,
        name: item.name,
        rarity: item.rarity,
        attackBonus: item.attack_bonus,
        goldEarned: saleGold,
        gold: saleGold,
        // Compatibility alias for persisted/API consumers while thread_dust storage remains.
        threadDust: saleGold,
      };
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  salvageItem({ playerId, itemId }) {
    return this.sellItem({ playerId, itemId });
  }

  upgradeItem({ playerId, itemId, expectedLevel, cost, attackIncrease, statKey = null, statIncrease = null, budgetIncrease = null, attunementCode }) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      // This check belongs inside the same write transaction as Gold spending and item
      // mutation. The Service Layer keeps its earlier check for fast feedback, but only
      // this lock closes the race with a dungeon start committing at the same time.
      const activeRun = this.db.prepare("SELECT 1 FROM dungeon_runs dr JOIN dungeon_run_participants rp ON rp.run_id = dr.id WHERE rp.player_id = ? AND dr.phase IN ('combat', 'event', 'upgrade', 'boss', 'between_encounter') LIMIT 1").get(playerId);
      if (activeRun) {
        const error = new Error('Finish the active dungeon before upgrading equipment.');
        error.code = 'relic_upgrade_during_run';
        throw error;
      }

      const item = this.db.prepare('SELECT * FROM items WHERE id = ? AND player_id = ?').get(itemId, playerId);
      if (!item) throw new Error('Item not found.');
      const player = this.db.prepare('SELECT thread_dust FROM players WHERE id = ?').get(playerId);
      if (!player) throw new Error('Player not found.');

      let effect = {};
      try { effect = JSON.parse(item.effect_json || '{}'); } catch {}
      if (!effect || typeof effect !== 'object' || Array.isArray(effect)) effect = {};
      const storedLevel = Number(effect.upgradeLevel || 0);
      if (storedLevel !== expectedLevel) {
        const error = new Error('Equipment progression changed before this Upgrade could be applied. Refresh and retry.');
        error.code = 'stale_relic_upgrade';
        throw error;
      }
      if (Number(player.thread_dust || 0) < cost) {
        const error = new Error(`You need ${cost} Gold to Upgrade this item.`);
        error.code = 'insufficient_thread_dust';
        throw error;
      }

      const statUpgrade = equipmentSlotUpgrade(item.slot);
      const requestedStatKey = statKey || statUpgrade.statKey;
      const requestedStatIncrease = statIncrease == null
        ? (requestedStatKey === 'attackBonus' ? Number(attackIncrease ?? statUpgrade.statIncrease) : statUpgrade.statIncrease)
        : Number(statIncrease);
      const requestedBudgetIncrease = budgetIncrease == null ? statUpgrade.budgetIncrease : Number(budgetIncrease);
      if (requestedStatKey !== statUpgrade.statKey
        || requestedStatIncrease !== statUpgrade.statIncrease
        || requestedBudgetIncrease !== statUpgrade.budgetIncrease) {
        const error = new Error('Equipment Upgrade does not match the authoritative slot stat.');
        error.code = 'invalid_equipment_upgrade_stat';
        throw error;
      }

      effect.upgradeLevel = expectedLevel + 1;
      if (attunementCode) effect.attunementCode ||= attunementCode;
      const oldTemplate = effect.equipmentTemplate && typeof effect.equipmentTemplate === 'object' && !Array.isArray(effect.equipmentTemplate)
        ? effect.equipmentTemplate
        : {};
      const oldStats = oldTemplate.stats && typeof oldTemplate.stats === 'object' && !Array.isArray(oldTemplate.stats)
        ? oldTemplate.stats
        : {};
      const stats = {
        attackBonus: finiteNonNegative(item.attack_bonus),
        defenseBonus: finiteNonNegative(oldStats.defenseBonus),
        maxHpBonus: finiteNonNegative(oldStats.maxHpBonus ?? oldStats.maxHealthBonus),
        speedBonus: finiteNonNegative(oldStats.speedBonus),
        critChanceBonus: Math.min(1, finiteNonNegative(oldStats.critChanceBonus)),
      };
      stats[statUpgrade.statKey] += statUpgrade.statIncrease;
      const effects = Array.isArray(oldTemplate.effectCodes)
        ? oldTemplate.effectCodes.map((code) => String(code).trim().toLowerCase()).filter(Boolean)
        : [String(item.effect_code || effect.code || 'none').trim().toLowerCase() || 'none'];
      const requiredLevel = Math.max(1, Math.floor(Number(oldTemplate.requiredLevel) || 1));
      const areaNumber = Math.max(1, Math.floor(Number(oldTemplate.areaNumber) || 1));
      const budgetUsed = arcEquipmentBudgetUsed({ stats, effects });
      const baseBudgetLimit = arcEquipmentBudgetLimit({ rarity: String(item.rarity || 'common').toLowerCase(), requiredLevel, areaNumber });
      const storedBudgetLimit = Number(oldTemplate.budget?.limit);
      const previousBudgetLimit = Number.isFinite(storedBudgetLimit) && storedBudgetLimit > 0
        ? Math.max(storedBudgetLimit, baseBudgetLimit + storedLevel * statUpgrade.budgetIncrease)
        : baseBudgetLimit + storedLevel * statUpgrade.budgetIncrease;
      const budget = {
        used: budgetUsed,
        limit: Math.max(previousBudgetLimit + statUpgrade.budgetIncrease, budgetUsed),
      };
      effect.equipmentTemplate = {
        ...oldTemplate,
        effectCodes: effects,
        requiredLevel,
        areaNumber,
        stats,
        budget,
      };
      const nextAttackBonus = stats.attackBonus;
      const attackDelta = statUpgrade.statKey === 'attackBonus' ? statUpgrade.statIncrease : 0;
      const updated = this.db.prepare('UPDATE items SET attack_bonus = ?, effect_json = ? WHERE id = ? AND player_id = ?').run(
        nextAttackBonus,
        JSON.stringify(effect),
        itemId,
        playerId,
      );
      if (updated.changes !== 1) throw new Error('Item changed before it could be Upgraded.');
      this.db.prepare('UPDATE players SET thread_dust = thread_dust - ? WHERE id = ?').run(cost, playerId);
      this.db.exec('COMMIT');
      return {
        id: item.id,
        playerId: item.player_id,
        level: effect.upgradeLevel,
        attunementCode: effect.attunementCode || null,
        goldSpent: cost,
        threadDustSpent: cost,
        attackIncrease: attackDelta,
        statKey: statUpgrade.statKey,
        statLabel: statUpgrade.statLabel,
        statIncrease: statUpgrade.statIncrease,
        statText: statUpgrade.statText,
        budget,
      };
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }
}
