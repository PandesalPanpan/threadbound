import { rarityTier } from '../domain/ItemRarityPolicy.js';

function parseEffect(value) {
  if (value && typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function nonNegativeNumber(value, fallback = 0) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function positiveInteger(value, fallback = 1) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

/**
 * Canonical SQLite item Data Mapper shared by inventory, equipment, and Codex
 * repositories. Old rows only have attack_bonus/effect_code and safely hydrate
 * to zero for newer stats while preserving their original effect payload.
 */
export function mapSQLiteItemRow(row) {
  if (!row) return null;
  const effect = parseEffect(row.effect_json);
  const template = effect.equipmentTemplate && typeof effect.equipmentTemplate === 'object'
    ? effect.equipmentTemplate
    : {};
  const stats = template.stats && typeof template.stats === 'object' ? template.stats : {};
  const rarity = String(row.rarity || 'common').toLowerCase();
  const effectCode = String(row.effect_code || effect.code || 'none');
  const effectCodes = Array.isArray(template.effectCodes)
    ? template.effectCodes.map((code) => String(code).trim().toLowerCase()).filter(Boolean)
    : [effectCode];
  const budget = template.budget && typeof template.budget === 'object'
    ? { used: nonNegativeNumber(template.budget.used), limit: nonNegativeNumber(template.budget.limit) }
    : null;
  return {
    id: row.id,
    playerId: row.player_id,
    definitionId: row.definition_id,
    name: row.name,
    slot: row.slot,
    rarity,
    rarityTier: rarityTier(rarity),
    attackBonus: nonNegativeNumber(row.attack_bonus, nonNegativeNumber(stats.attackBonus)),
    defenseBonus: nonNegativeNumber(stats.defenseBonus),
    maxHpBonus: nonNegativeNumber(stats.maxHpBonus ?? stats.maxHealthBonus),
    speedBonus: nonNegativeNumber(stats.speedBonus),
    critChanceBonus: Math.min(1, nonNegativeNumber(stats.critChanceBonus)),
    healingPowerBonus: nonNegativeNumber(stats.healingPowerBonus),
    attackSpeedBonus: Math.min(0.5, nonNegativeNumber(stats.attackSpeedBonus)),
    movementSpeedBonus: Math.min(2, nonNegativeNumber(stats.movementSpeedBonus)),
    effectCode,
    effectCodes,
    effect,
    weaponFamily: template.weaponFamily ? String(template.weaponFamily) : null,
    combatProfileCode: template.combatProfileCode ? String(template.combatProfileCode).trim().toLowerCase() : null,
    itemFamily: template.itemFamily ? String(template.itemFamily) : null,
    materialFamily: template.materialFamily ? String(template.materialFamily) : null,
    requiredLevel: positiveInteger(template.requiredLevel),
    areaNumber: positiveInteger(template.areaNumber),
    equipmentBudget: budget,
    visualAssetId: row.visual_asset_id || null,
    source: row.source,
    createdAt: row.created_at,
  };
}

function tableExists(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1").get(name));
}

/** Returns persisted equipped item rows, with the pre-loadout Weapon pointer fallback. */
export function sqliteEquipmentRowsForPlayer(db, playerId) {
  if (tableExists(db, 'player_equipment')) {
    const rows = db.prepare(`
      SELECT i.*
      FROM player_equipment pe
      JOIN items i ON i.id = pe.item_id
      WHERE pe.player_id = ?
    `).all(playerId);
    if (rows.some((row) => String(row.slot || '').toLowerCase() === 'weapon')) return rows;
    const legacyWeapon = db.prepare(`
      SELECT i.*
      FROM players p
      JOIN items i ON i.id = p.equipped_item_id AND i.player_id = p.id
      WHERE p.id = ? AND lower(i.slot) = 'weapon'
    `).all(playerId);
    return [...rows, ...legacyWeapon];
  }

  return db.prepare(`
    SELECT i.*
    FROM players p
    JOIN items i ON i.id = p.equipped_item_id AND i.player_id = p.id
    WHERE p.id = ? AND lower(i.slot) = 'weapon'
  `).all(playerId);
}

export function sqliteEquipmentMaxHpBonus(db, playerId) {
  return sqliteEquipmentRowsForPlayer(db, playerId)
    .map(mapSQLiteItemRow)
    .reduce((sum, item) => sum + Number(item?.maxHpBonus || 0), 0);
}
