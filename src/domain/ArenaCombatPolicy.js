import { projectCombatLoadout } from './CombatLoadoutPolicy.js';

export const ARENA_COMBAT_RULES = Object.freeze({
  version: 1,
  boardSize: 8,
  tickMs: 50,
  maxDurationMs: 60_000,
  maxPlayers: 4,
  maxEnemies: 3,
  minCharacterSpeed: 1,
  maxCharacterSpeed: 100,
  minAttackSpeed: 0.4,
  maxAttackSpeed: 3,
  minMovementSpeed: 1,
  maxMovementSpeed: 4,
  rangedAttackDistance: 3.2,
  meleeAttackDistance: 1.45,
  supportDistance: 2.6,
  supportNeedRatio: 0.82,
  maxUnitStat: 10_000,
});

const X_SLOTS = Object.freeze([3, 4, 2, 5]);
const ROLE_ORDER = Object.freeze({ frontline: 0, ranged: 1, support: 2 });

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isSupportSkill(skill) {
  const effect = skill?.effect || {};
  return Number(effect.allyHeal || 0) > 0
    || Number(effect.selfHealing || 0) > 0
    || Number(effect.allyMana || 0) > 0
    || (Array.isArray(effect.allyEffects) && effect.allyEffects.length > 0);
}

export function normalizeArenaSpeed(value, combatantId = 'Combatant') {
  if (!Number.isInteger(value)
    || value < ARENA_COMBAT_RULES.minCharacterSpeed
    || value > ARENA_COMBAT_RULES.maxCharacterSpeed) {
    throw new Error(`${combatantId} Speed must be an integer from ${ARENA_COMBAT_RULES.minCharacterSpeed} to ${ARENA_COMBAT_RULES.maxCharacterSpeed}.`);
  }
  return value;
}

/**
 * Existing character Speed remains the source stat. Its attack and movement
 * clocks are separate domain mappings: attacks use the established 10 Speed
 * per action/second initiative scale with the existing 2x relative cap, while
 * movement uses a bounded tile/second scale. Neither formula lives in browser
 * code, and changing one clock does not derive it from the other.
 */
export function arenaSpeedProfile(speed, {
  slowestSpeed = speed,
  combatantId = 'Combatant',
  attackSpeedBonus = 0,
  movementSpeedBonus = 0,
} = {}) {
  const rawSpeed = normalizeArenaSpeed(speed, combatantId);
  const slowest = normalizeArenaSpeed(slowestSpeed, 'Slowest combatant');
  if (!finiteNumber(attackSpeedBonus) || attackSpeedBonus < 0 || attackSpeedBonus > 0.5) {
    throw new Error(`${combatantId} Attack Speed bonus must be from 0 to 0.5.`);
  }
  if (!finiteNumber(movementSpeedBonus) || movementSpeedBonus < 0 || movementSpeedBonus > 2) {
    throw new Error(`${combatantId} Movement Speed bonus must be from 0 to 2.`);
  }
  const effectiveAttackSpeed = Math.min(rawSpeed, slowest * 2);
  const baseAttacksPerSecond = Math.max(
    ARENA_COMBAT_RULES.minAttackSpeed,
    Math.min(ARENA_COMBAT_RULES.maxAttackSpeed, effectiveAttackSpeed / 10),
  );
  const attacksPerSecond = Math.min(ARENA_COMBAT_RULES.maxAttackSpeed, baseAttacksPerSecond * (1 + attackSpeedBonus));
  const tilesPerSecond = Math.max(
    ARENA_COMBAT_RULES.minMovementSpeed,
    Math.min(ARENA_COMBAT_RULES.maxMovementSpeed, 0.9 + rawSpeed * 0.075 + movementSpeedBonus),
  );
  return Object.freeze({
    sourceSpeed: rawSpeed,
    effectiveAttackSpeed,
    attacksPerSecond,
    tilesPerSecond,
  });
}

export function arenaCombatRole(combatant = {}) {
  const explicitCombatRole = String(combatant.combatRole || '').trim().toLowerCase();
  if (explicitCombatRole && !['front', 'frontline', 'ranged', 'support', 'healer', 'mana-support'].includes(explicitCombatRole)) {
    throw new Error(`Unsupported combat role: ${explicitCombatRole}.`);
  }
  return projectCombatLoadout({
    equipment: combatant.equipment || {},
    equippedItem: combatant.equippedItem || null,
    combatant,
  }).role;
}

export function arenaRanges(combatant, role = arenaCombatRole(combatant)) {
  const configured = combatant.rangeTiles ?? combatant.arenaRangeTiles;
  if (configured !== undefined) {
    if (!finiteNumber(configured) || configured < 1 || configured > ARENA_COMBAT_RULES.boardSize) {
      throw new Error(`${combatant.id || 'Combatant'} rangeTiles must be between 1 and ${ARENA_COMBAT_RULES.boardSize}.`);
    }
  }
  const loadout = projectCombatLoadout({
    equipment: combatant.equipment || {},
    equippedItem: combatant.equippedItem || null,
    combatant,
  });
  return Object.freeze({
    attack: configured ?? loadout.attackRangeTiles
      ?? (role === 'frontline' ? ARENA_COMBAT_RULES.meleeAttackDistance : ARENA_COMBAT_RULES.rangedAttackDistance),
    support: combatant.supportRangeTiles ?? loadout.supportRangeTiles ?? ARENA_COMBAT_RULES.supportDistance,
  });
}

function formationCell(team, role, roleIndex) {
  const x = X_SLOTS[roleIndex % X_SLOTS.length];
  if (team === 'players') {
    const row = role === 'frontline' ? 5 : role === 'ranged' ? 6 : 7;
    return { x, y: Math.min(7, row + Math.floor(roleIndex / X_SLOTS.length)) };
  }
  const row = role === 'frontline' ? 2 : role === 'ranged' ? 1 : 0;
  return { x, y: Math.max(0, row - Math.floor(roleIndex / X_SLOTS.length)) };
}

/**
 * Server-owned default deployment. Frontline units start closer to the
 * centerline; ranged/support units start behind them. Stable role and ID order
 * makes the formation independent of browser state.
 */
export function defaultArenaFormation(players, enemies) {
  const placements = {};
  for (const [team, combatants] of [['players', players], ['enemies', enemies]]) {
    const sorted = [...combatants].sort((left, right) => (
      ROLE_ORDER[arenaCombatRole(left)] - ROLE_ORDER[arenaCombatRole(right)]
      || String(left.id).localeCompare(String(right.id))
    ));
    const roleIndices = new Map();
    for (const combatant of sorted) {
      const role = arenaCombatRole(combatant);
      const roleIndex = roleIndices.get(role) || 0;
      roleIndices.set(role, roleIndex + 1);
      placements[String(combatant.id)] = formationCell(team, role, roleIndex);
    }
  }
  return placements;
}

export function validateArenaPlacements(players, enemies, placements = {}) {
  if (placements == null || typeof placements !== 'object' || Array.isArray(placements)) {
    throw new Error('Arena placements must be an object keyed by combatant id.');
  }
  const known = new Map([
    ...players.map((combatant) => [String(combatant.id), 'players']),
    ...enemies.map((combatant) => [String(combatant.id), 'enemies']),
  ]);
  for (const id of Object.keys(placements)) {
    if (!known.has(id)) throw new Error(`Arena placement references unknown combatant ${id}.`);
  }
  const result = defaultArenaFormation(players, enemies);
  const occupied = new Set();
  for (const combatant of [...players, ...enemies]) {
    const id = String(combatant.id);
    const position = placements[id] || result[id];
    const team = known.get(id);
    if (!position || !Number.isInteger(position.x) || !Number.isInteger(position.y)
      || position.x < 0 || position.x >= ARENA_COMBAT_RULES.boardSize
      || position.y < 0 || position.y >= ARENA_COMBAT_RULES.boardSize
      || (team === 'players' && position.y < 5)
      || (team === 'enemies' && position.y > 2)) {
      throw new Error(`${id} must be placed on its side of the arena.`);
    }
    const key = `${position.x},${position.y}`;
    if (occupied.has(key)) throw new Error('Each combatant needs a separate starting tile.');
    occupied.add(key);
    result[id] = { x: position.x, y: position.y };
  }
  return result;
}

export function supportSkillNeeded(skill, actor, allies) {
  if (!isSupportSkill(skill)) return false;
  const effect = skill.effect || {};
  if (Number(effect.allyHeal || 0) > 0 || Number(effect.selfHealing || 0) > 0) {
    return allies.some((ally) => ally.hp > 0
      && ally.hp / Math.max(1, ally.maxHp) < ARENA_COMBAT_RULES.supportNeedRatio);
  }
  if (Number(effect.allyMana || 0) > 0) {
    return allies.some((ally) => ally.hp > 0 && ally.id !== actor.id && ally.mana < ally.maxMana);
  }
  return true;
}
