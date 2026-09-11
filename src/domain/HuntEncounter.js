export const HUNT_ENEMIES = Object.freeze([
  Object.freeze({ id: 'frayed-mite', name: 'Frayed Mite', hp: 8, retaliation: 2, gold: 1, experience: 10, dropChance: 0.24 }),
  Object.freeze({ id: 'hollow-crow', name: 'Hollow Crow', hp: 12, retaliation: 3, gold: 2, experience: 15, dropChance: 0.30 }),
  Object.freeze({ id: 'thread-wolf', name: 'Thread Wolf', hp: 18, retaliation: 4, gold: 3, experience: 20, dropChance: 0.36 }),
]);

function clampRoll(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(0.999999, numeric));
}

export function pickHuntEnemy(roll = 0) {
  const index = Math.floor(clampRoll(roll) * HUNT_ENEMIES.length);
  return HUNT_ENEMIES[index] || HUNT_ENEMIES[0];
}

/**
 * A Hunt is intentionally resolved in one command. It is the lightweight
 * progression loop: permanent character stats decide how many exchanges are
 * needed, while the player does not manage a temporary combat subsystem.
 */
export function resolveHunt({ attackPower, maxHealth, currentHealth = maxHealth, enemyRoll = 0 }) {
  if (!Number.isInteger(attackPower) || attackPower <= 0) throw new Error('Hunt requires positive Attack.');
  if (!Number.isInteger(maxHealth) || maxHealth <= 0) throw new Error('Hunt requires positive Health.');
  if (!Number.isInteger(currentHealth) || currentHealth <= 0 || currentHealth > maxHealth) throw new Error('Hunt requires current Health between 1 and maximum Health.');

  const enemy = pickHuntEnemy(enemyRoll);
  const attacksRequired = Math.max(1, Math.ceil(enemy.hp / attackPower));
  const enemyHits = Math.max(0, attacksRequired - 1);
  const damageTaken = enemyHits * enemy.retaliation;
  const remainingHp = Math.max(0, currentHealth - damageTaken);
  const victory = remainingHp > 0;
  const gold = victory ? enemy.gold : 0;
  const experience = victory ? enemy.experience : 0;

  return {
    enemy: { ...enemy },
    attackPower,
    maxHealth,
    startingHp: currentHealth,
    attacksRequired,
    damageTaken,
    remainingHp,
    victory,
    gold,
    experience,
    // Player-facing copy uses XP; cumulative persistence remains named experience.
    xp: experience,
    // Compatibility alias for callers/tests that still consume the old reward field.
    threadDust: gold,
    dropChance: victory ? enemy.dropChance : 0,
  };
}
