import { simulateAutomaticBattle } from './AutomaticBattleSimulator.js';
import { createEquipmentAwareAutomaticBasicAttackResolver } from './EquipmentBattleEffectPolicy.js';

// M5-04 deliberately reuses existing world identities instead of introducing a new Arc.
// Encounter definitions are Area snapshots: they do not scale to the player's level.
export const ORDINARY_ADVENTURE_ENCOUNTERS = Object.freeze({
  1: Object.freeze([
    Object.freeze({ id: 'thread-wolf', name: 'Thread Wolf', hp: 24, attack: 7, defense: 1, speed: 11, critChance: 0.05 }),
  ]),
});

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Adventure requires positive ${label}.`);
  return value;
}

function clampRoll(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(0.999999, numeric));
}

export function ordinaryAdventureEncounterForArea(areaNumber, roll = 0) {
  const number = Number(areaNumber);
  const encounters = ORDINARY_ADVENTURE_ENCOUNTERS[number];
  if (!encounters?.length) {
    const error = new Error(`No ordinary Adventure encounter is configured for Area ${number}.`);
    error.code = 'adventure_unavailable_in_area';
    throw error;
  }
  const index = Math.floor(clampRoll(roll) * encounters.length);
  return encounters[index] || encounters[0];
}

/**
 * Resolves one ordinary Adventure fight through the same automatic battle engine
 * used by Hunt. Area selection stays outside the generic simulator so world/content
 * identity remains an Area policy instead of player-level scaling.
 */
export function resolveOrdinaryAdventure({ player, currentHealth, areaNumber, encounterRoll = 0, random = Math.random } = {}) {
  if (!player || typeof player !== 'object') throw new Error('Adventure requires a player combatant.');
  const playerId = String(player.id || '').trim();
  if (!playerId) throw new Error('Adventure requires a player id.');
  const maxHp = positiveInteger(player.maxHp, 'Health');
  if (!Number.isInteger(currentHealth) || currentHealth <= 0 || currentHealth > maxHp) {
    throw new Error('Adventure requires current Health between 1 and maximum Health.');
  }

  const encounter = ordinaryAdventureEncounterForArea(areaNumber, encounterRoll);
  const enemyId = `adventure-enemy:${encounter.id}`;
  const battle = simulateAutomaticBattle(
    { resolveAction: createEquipmentAwareAutomaticBasicAttackResolver({ random }) },
    {
      combatants: [
        { ...player, id: playerId, hp: currentHealth, maxHp },
        {
          id: enemyId,
          name: encounter.name,
          displayName: encounter.name,
          hp: encounter.hp,
          maxHp: encounter.hp,
          attack: encounter.attack,
          defense: encounter.defense,
          speed: encounter.speed,
          critChance: encounter.critChance,
          tags: ['ordinary-adventure-enemy', `area-${Number(areaNumber)}`],
        },
      ],
      context: { activity: 'adventure', areaNumber: Number(areaNumber), enemyId: encounter.id },
    },
  );

  const playerAfter = battle.combatants.find((combatant) => combatant.id === playerId);
  const remainingHp = Math.max(0, Number(playerAfter?.hp || 0));
  return Object.freeze({
    areaNumber: Number(areaNumber),
    enemy: Object.freeze({ ...encounter }),
    startingHp: currentHealth,
    maxHealth: maxHp,
    remainingHp,
    damageTaken: Math.max(0, currentHealth - remainingHp),
    victory: battle.outcome === 'victory' && battle.winnerId === playerId,
    battle,
  });
}
