export const HEALING_RULES = Object.freeze({
  healthPotionHeal: 12,
  passiveRecoverySecondsPerHp: 60,
});

function wholeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
}

/**
 * Canonical routine Heal policy.
 *
 * Heal is intentionally simple: outside an active dungeon, a wounded player may
 * consume one health potion for a fixed bounded amount. Legacy tactical Mend is
 * a separate compatibility mechanic and must not leak into this policy.
 */
export function resolveHealAction({
  activeRun = null,
  currentHealth,
  maxHealth,
  healthPotions,
} = {}) {
  if (activeRun) {
    const error = new Error('Heal is only available outside an active dungeon.');
    error.code = 'heal_during_dungeon';
    throw error;
  }

  const current = Math.max(0, wholeNumber(currentHealth));
  const maximum = Math.max(1, wholeNumber(maxHealth, 1));
  const potions = Math.max(0, wholeNumber(healthPotions));

  if (current >= maximum) {
    const error = new Error('You are already at full health.');
    error.code = 'health_already_full';
    throw error;
  }
  if (potions <= 0) {
    const error = new Error('You have no health potions. Heal naturally over time or buy another potion.');
    error.code = 'no_health_potions';
    throw error;
  }

  const nextHealth = Math.min(maximum, current + HEALING_RULES.healthPotionHeal);
  return Object.freeze({
    method: 'health_potion',
    consumeHealthPotions: 1,
    healed: nextHealth - current,
    currentHealth: nextHealth,
    maxHealth: maximum,
    healthPotions: potions - 1,
  });
}

/**
 * Projection helper for the existing lazy out-of-combat recovery rule. The
 * repository remains responsible for persisting/lazily materializing HP; this
 * policy owns the timing vocabulary so presentation code does not invent it.
 */
export function passiveRecoveryProjection({ currentHealth, maxHealth, healthUpdatedAt, now = Date.now() } = {}) {
  const current = Math.max(0, wholeNumber(currentHealth));
  const maximum = Math.max(1, wholeNumber(maxHealth, 1));
  if (current >= maximum) return Object.freeze({ nextHealthInSeconds: 0, fullHealthInSeconds: 0 });

  const value = String(healthUpdatedAt || '');
  const timestamp = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`).getTime();
  const elapsedSeconds = Number.isFinite(timestamp) ? Math.max(0, Math.floor((now - timestamp) / 1000)) : 0;
  const cadence = HEALING_RULES.passiveRecoverySecondsPerHp;
  const nextHealthInSeconds = Math.max(1, cadence - (elapsedSeconds % cadence));

  return Object.freeze({
    nextHealthInSeconds,
    fullHealthInSeconds: nextHealthInSeconds + Math.max(0, maximum - current - 1) * cadence,
  });
}
