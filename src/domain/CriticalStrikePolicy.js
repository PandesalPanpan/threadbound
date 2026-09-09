const BASE_CRIT_CHANCE = 0.1;
const EXPOSED_CRIT_BONUS = 0.2;
const CRIT_MULTIPLIER = 1.75;

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function criticalStrike({ runId, runVersion, playerId, enemyId, actionKey = 'attack', baseDamage, exposed = false }) {
  const raw = Math.max(0, Number(baseDamage || 0));
  const chance = Math.min(0.95, BASE_CRIT_CHANCE + (exposed ? EXPOSED_CRIT_BONUS : 0));
  const roll = stableHash(`${runId}:${runVersion}:${playerId}:${enemyId}:${actionKey}`) / 0x100000000;
  const critical = raw > 0 && roll < chance;
  return {
    critical,
    chance,
    multiplier: CRIT_MULTIPLIER,
    damage: critical ? Math.max(raw + 1, Math.ceil(raw * CRIT_MULTIPLIER)) : raw,
  };
}

export const CRITICAL_STRIKE_RULES = Object.freeze({
  baseChance: BASE_CRIT_CHANCE,
  exposedBonus: EXPOSED_CRIT_BONUS,
  multiplier: CRIT_MULTIPLIER,
});
