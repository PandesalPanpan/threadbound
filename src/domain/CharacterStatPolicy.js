const BASE_STATS = Object.freeze({
  defense: 2,
  speed: 10,
  critChance: 0.05,
});

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function equipmentItems(equipment = {}) {
  return Object.values(equipment || {}).filter(Boolean);
}

function itemBonus(item, key) {
  return finiteNumber(item?.[key] ?? item?.effect?.equipmentTemplate?.stats?.[key], 0);
}

export function deriveCharacterStats({ baseAttack = 6, maxHealth = 40, equipment = {} } = {}) {
  const items = equipmentItems(equipment);
  const weapon = equipment?.weapon || null;
  const attack = Math.max(1, Math.floor(finiteNumber(baseAttack, 6) + finiteNumber(weapon?.attackBonus, 0)));
  const defense = Math.max(0, Math.floor(BASE_STATS.defense + items.reduce((sum, item) => sum + finiteNumber(item.defenseBonus, 0), 0)));
  const maxHp = Math.max(1, Math.floor(finiteNumber(maxHealth, 40) + items.reduce((sum, item) => sum + finiteNumber(item.maxHpBonus ?? item.maxHealthBonus, 0), 0)));
  const speed = Math.max(1, Math.floor(BASE_STATS.speed + items.reduce((sum, item) => sum + finiteNumber(item.speedBonus, 0), 0)));
  const critChance = Math.max(0, Math.min(1, BASE_STATS.critChance + items.reduce((sum, item) => sum + finiteNumber(item.critChanceBonus, 0), 0)));
  const healingPower = Math.max(0, Math.floor(items.reduce((sum, item) => sum + itemBonus(item, 'healingPowerBonus'), 0)));
  const attackSpeedBonus = Math.min(0.5, Math.max(0, items.reduce((sum, item) => sum + itemBonus(item, 'attackSpeedBonus'), 0)));
  const movementSpeedBonus = Math.min(2, Math.max(0, items.reduce((sum, item) => sum + itemBonus(item, 'movementSpeedBonus'), 0)));

  return Object.freeze({
    attack,
    defense,
    maxHp,
    speed,
    critChance,
    critChancePercent: Math.round(critChance * 1000) / 10,
    healingPower,
    attackSpeedBonus,
    movementSpeedBonus,
  });
}

export function publicBaseCharacterStats() {
  return { ...BASE_STATS };
}
