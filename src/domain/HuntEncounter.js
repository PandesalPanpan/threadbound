import { simulateAutomaticBattle } from './AutomaticBattleSimulator.js';
import { createEquipmentAwareAutomaticBasicAttackResolver } from './EquipmentBattleEffectPolicy.js';

export const HUNT_ENEMIES = Object.freeze([
  Object.freeze({ id: 'frayed-mite', name: 'Frayed Mite', hp: 8, attack: 4, defense: 0, speed: 10, critChance: 0, retaliation: 2, gold: 1, experience: 10, dropChance: 0.24 }),
  Object.freeze({ id: 'hollow-crow', name: 'Hollow Crow', hp: 12, attack: 5, defense: 0, speed: 10, critChance: 0, retaliation: 3, gold: 2, experience: 15, dropChance: 0.30 }),
  Object.freeze({ id: 'thread-wolf', name: 'Thread Wolf', hp: 18, attack: 6, defense: 0, speed: 10, critChance: 0, retaliation: 4, gold: 3, experience: 20, dropChance: 0.36 }),
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

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Hunt requires positive ${label}.`);
  return value;
}

/**
 * Canonical Hunt combat on the shared automatic battle engine.
 * Hunt owns encounter selection/reward projection while AutomaticBattleSimulator
 * owns HP mutation, initiative, Crit, effects, resistances, and turn history.
 */
export function resolveAutomaticHunt({ player, currentHealth, enemyRoll = 0, random = Math.random } = {}) {
  if (!player || typeof player !== 'object') throw new Error('Hunt requires a player combatant.');
  const playerId = String(player.id || '').trim();
  if (!playerId) throw new Error('Hunt requires a player id.');
  const maxHp = positiveInteger(player.maxHp, 'Health');
  if (!Number.isInteger(currentHealth) || currentHealth <= 0 || currentHealth > maxHp) {
    throw new Error('Hunt requires current Health between 1 and maximum Health.');
  }

  const enemy = pickHuntEnemy(enemyRoll);
  const enemyId = `hunt-enemy:${enemy.id}`;
  const battle = simulateAutomaticBattle(
    { resolveAction: createEquipmentAwareAutomaticBasicAttackResolver({ random }) },
    {
      combatants: [
        {
          ...player,
          id: playerId,
          hp: currentHealth,
          maxHp,
        },
        {
          id: enemyId,
          name: enemy.name,
          displayName: enemy.name,
          hp: enemy.hp,
          maxHp: enemy.hp,
          attack: enemy.attack,
          defense: enemy.defense,
          speed: enemy.speed,
          critChance: enemy.critChance,
          tags: ['hunt-enemy'],
        },
      ],
      context: { activity: 'hunt', enemyId: enemy.id },
    },
  );

  const playerAfter = battle.combatants.find((combatant) => combatant.id === playerId);
  const remainingHp = Math.max(0, Number(playerAfter?.hp || 0));
  const victory = battle.outcome === 'victory' && battle.winnerId === playerId;
  const attacksRequired = battle.turns.filter((turn) => turn.actorId === playerId && turn.targetId === enemyId).length;
  const damageTaken = Math.max(0, currentHealth - remainingHp);
  const attackPower = Math.max(1, Math.floor(Number(player.attack || 1)));
  const gold = victory ? enemy.gold : 0;
  const experience = victory ? enemy.experience : 0;

  return {
    enemy: { ...enemy },
    attackPower,
    maxHealth: maxHp,
    startingHp: currentHealth,
    attacksRequired,
    damageTaken,
    remainingHp,
    victory,
    gold,
    experience,
    xp: experience,
    threadDust: gold,
    dropChance: victory ? enemy.dropChance : 0,
    battle,
  };
}

/**
 * Legacy compatibility helper retained for focused migration callers/tests.
 * New Hunt application flow uses resolveAutomaticHunt above.
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
    xp: experience,
    threadDust: gold,
    dropChance: victory ? enemy.dropChance : 0,
  };
}
