import { createEquipmentAwareAutomaticBasicAttackResolver } from './EquipmentBattleEffectPolicy.js';
import { projectCombatantWithAutomaticEffects } from './AutomaticBattleEffectPolicy.js';
import { AutomaticBattleSimulator } from './AutomaticBattleSimulator.js';
import { resolveAutomaticBattleSkill } from './AutomaticBattleSkillPolicy.js';
import { prepareAutomaticBattleCombatant } from './AutomaticBattleSkillCatalog.js';
import { selectEnemyTarget, selectPlayerTarget } from './SimpleEncounterBattle.js';
import {
  ARENA_COMBAT_RULES,
  arenaCombatRole,
  arenaRanges,
  arenaSpeedProfile,
  normalizeArenaSpeed,
  supportSkillNeeded,
  validateArenaPlacements,
} from './ArenaCombatPolicy.js';

const NEIGHBORS = Object.freeze([[0, -1], [-1, 0], [1, 0], [0, 1]]);
const TEAMS = Object.freeze(['players', 'enemies']);

function clone(value) {
  return structuredClone(value);
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hash32(value) {
  let hash = 2166136261;
  for (const character of String(value || '')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function createSeededRandom(seed) {
  let state = hash32(seed) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function battleIdentitySeed(combatants, context, seed) {
  if (seed !== undefined && seed !== null && String(seed).length > 0) return String(seed);
  const identity = String(context?.battleId || context?.runId || context?.duelId || context?.activity || 'arena-battle');
  const roster = [...combatants]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(({ id, team, hp, maxHp, attack, defense, speed, critChance, mana, skillCode, skills, effects, resistances, role, targetingProfile, isBoss, threat, lastTargetPlayerId, firstActionDamageBonus, tags, equipment }) => ({
      id, team, hp, maxHp, attack, defense, speed, critChance, mana, skillCode,
      skills: (skills || []).map((skill) => skill.id || skill.skillId || skill),
      role,
      targetingProfile: targetingProfile || null,
      isBoss: Boolean(isBoss),
      threat: Number(threat || 0),
      lastTargetPlayerId: lastTargetPlayerId || null,
      firstActionDamageBonus: Number(firstActionDamageBonus || 0),
      tags: tags || [],
      effects: effects || [],
      resistances: resistances || {},
      equipment: Object.fromEntries(Object.entries(equipment || {}).map(([slot, item]) => [slot, item ? {
        id: item.id || null,
        attackBonus: item.attackBonus || 0,
        defenseBonus: item.defenseBonus || 0,
        speedBonus: item.speedBonus || 0,
        critChanceBonus: item.critChanceBonus || 0,
        effectCode: item.effectCode || 'none',
      } : null])),
    }));
  return `${identity}:${JSON.stringify(roster)}`;
}

function integerStat(value, label, { minimum = 0, maximum = ARENA_COMBAT_RULES.maxUnitStat } = {}) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function normalizeUnit(source, team, index) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error(`${team} combatant ${index + 1} must be an object.`);
  }
  const id = String(source.id || source.playerId || source.combatantId || '').trim();
  if (!id) throw new Error(`${team} combatant ${index + 1} requires an id.`);
  const speed = normalizeArenaSpeed(source.speed ?? 10, id);
  const maxHp = integerStat(source.maxHp ?? source.maxHealth, `${id} maxHp`, { minimum: 1 });
  const hp = integerStat(source.hp ?? source.currentHealth ?? maxHp, `${id} hp`);
  if (hp > maxHp) throw new Error(`${id} hp cannot exceed maxHp.`);
  const attack = integerStat(source.attack ?? source.attackPower ?? source.retaliation ?? 1, `${id} Attack`, { minimum: 1 });
  const defense = integerStat(source.defense ?? 0, `${id} Defense`);
  const critChance = source.critChance ?? 0;
  if (typeof critChance !== 'number' || !Number.isFinite(critChance) || critChance < 0 || critChance > 1) {
    throw new Error(`${id} Crit Chance must be between 0 and 1.`);
  }
  const maxMana = integerStat(source.maxMana ?? 100, `${id} maxMana`);
  const mana = integerStat(source.mana ?? 0, `${id} Mana`);
  if (mana > maxMana) throw new Error(`${id} Mana cannot exceed maxMana.`);
  if (source.effects !== undefined && (!Array.isArray(source.effects) || source.effects.length > 20)) {
    throw new Error(`${id} effects must be an array with at most 20 entries.`);
  }
  const prepared = prepareAutomaticBattleCombatant({
    ...source,
    id,
    playerId: source.playerId || (team === 'players' ? id : undefined),
    combatantId: source.combatantId || id,
    name: String(source.displayName || source.name || `Combatant ${index + 1}`),
    displayName: String(source.displayName || source.name || `Combatant ${index + 1}`),
    team,
    hp,
    maxHp,
    attack,
    defense,
    speed,
    critChance,
    mana,
    maxMana,
    manaGain: integerStat(source.manaGain ?? 35, `${id} manaGain`),
    manaGainOnDamage: integerStat(source.manaGainOnDamage ?? 12, `${id} manaGainOnDamage`),
    effects: clone(source.effects || []),
    resistances: clone(source.resistances || {}),
  });
  const role = arenaCombatRole(prepared);
  const ranges = arenaRanges(prepared, role);
  return {
    ...prepared,
    id,
    team,
    role,
    attackRange: ranges.attack,
    supportRange: ranges.support,
    x: 0,
    y: 0,
    renderX: 0,
    renderY: 0,
    motion: null,
    facing: team === 'players' ? 1 : -1,
    shield: integerStat(source.shield ?? 0, `${id} shield`),
    threat: integerStat(source.threat ?? 0, `${id} threat`),
    nextActionAtMs: 0,
    lastTargetPlayerId: source.lastTargetPlayerId || null,
    intent: 'Ready',
  };
}

function validateBattleInput({ players, enemies, durationMs, placements }) {
  if (!Array.isArray(players) || players.length < 1 || players.length > ARENA_COMBAT_RULES.maxPlayers) {
    throw new Error(`Arena combat requires 1 to ${ARENA_COMBAT_RULES.maxPlayers} players.`);
  }
  if (!Array.isArray(enemies) || enemies.length < 1 || enemies.length > ARENA_COMBAT_RULES.maxEnemies) {
    throw new Error(`Arena combat requires 1 to ${ARENA_COMBAT_RULES.maxEnemies} enemies.`);
  }
  const duration = durationMs ?? ARENA_COMBAT_RULES.maxDurationMs;
  if (!Number.isInteger(duration) || duration < ARENA_COMBAT_RULES.tickMs
    || duration > ARENA_COMBAT_RULES.maxDurationMs || duration % ARENA_COMBAT_RULES.tickMs !== 0) {
    throw new Error(`Arena combat duration must be a multiple of ${ARENA_COMBAT_RULES.tickMs} ms up to ${ARENA_COMBAT_RULES.maxDurationMs} ms.`);
  }
  const normalizedPlayers = players.map((combatant, index) => normalizeUnit(combatant, 'players', index));
  const normalizedEnemies = enemies.map((combatant, index) => normalizeUnit(combatant, 'enemies', index));
  const units = [...normalizedPlayers, ...normalizedEnemies];
  if (new Set(units.map((unit) => unit.id)).size !== units.length) {
    throw new Error('Arena combatant ids must be unique across both teams.');
  }
  const positions = validateArenaPlacements(normalizedPlayers, normalizedEnemies, placements);
  for (const unit of units) {
    const position = positions[unit.id];
    unit.x = position.x;
    unit.y = position.y;
    unit.renderX = position.x;
    unit.renderY = position.y;
  }
  return { players: normalizedPlayers, enemies: normalizedEnemies, units, durationMs: duration };
}

function distance(left, right) {
  return Math.hypot((left.renderX ?? left.x) - (right.renderX ?? right.x), (left.renderY ?? left.y) - (right.renderY ?? right.y));
}

function living(units, team = null) {
  return units.filter((unit) => unit.hp > 0 && (!team || unit.team === team));
}

function teamOf(unit) {
  return unit.team === 'players' ? 'enemies' : 'players';
}

function occupiedTiles(units, exceptId = null) {
  return new Set(units.filter((unit) => unit.hp > 0 && unit.id !== exceptId).flatMap((unit) => [
    `${unit.x},${unit.y}`,
    ...(unit.motion ? [`${unit.motion.x},${unit.motion.y}`] : []),
  ]));
}

function pathFirstStep(unit, target, units, range) {
  const occupied = occupiedTiles(units, unit.id);
  const queue = [{ x: unit.x, y: unit.y, first: null }];
  const visited = new Set([`${unit.x},${unit.y}`]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const cell = queue[cursor];
    if (cell.first && distance(cell, target) <= range) return cell.first;
    const candidates = NEIGHBORS.map(([dx, dy]) => ({ x: cell.x + dx, y: cell.y + dy }));
    candidates.sort((left, right) => distance(left, target) - distance(right, target)
      || left.y - right.y || left.x - right.x);
    for (const next of candidates) {
      const key = `${next.x},${next.y}`;
      if (next.x < 0 || next.x >= ARENA_COMBAT_RULES.boardSize
        || next.y < 0 || next.y >= ARENA_COMBAT_RULES.boardSize
        || occupied.has(key) || visited.has(key)) continue;
      visited.add(key);
      queue.push({ ...next, first: cell.first || next });
    }
  }
  return null;
}

function retreatStep(unit, threats, units) {
  const occupied = occupiedTiles(units, unit.id);
  const safety = (cell) => Math.min(...threats.map((threat) => distance(cell, threat)));
  return NEIGHBORS.map(([dx, dy]) => ({ x: unit.x + dx, y: unit.y + dy }))
    .filter((cell) => cell.x >= 0 && cell.x < ARENA_COMBAT_RULES.boardSize
      && cell.y >= 0 && cell.y < ARENA_COMBAT_RULES.boardSize
      && !occupied.has(`${cell.x},${cell.y}`)
      && safety(cell) > safety(unit) + 0.1)
    .sort((left, right) => safety(right) - safety(left) || left.y - right.y || left.x - right.x)[0] || null;
}

function advanceMotion(unit, timeMs) {
  if (!unit.motion) return;
  if (unit.hp <= 0) {
    unit.motion = null;
    unit.renderX = unit.x;
    unit.renderY = unit.y;
    return;
  }
  const progress = Math.min(1, Math.max(0, (timeMs - unit.motion.startMs) / unit.motion.durationMs));
  unit.renderX = unit.x + (unit.motion.x - unit.x) * progress;
  unit.renderY = unit.y + (unit.motion.y - unit.y) * progress;
  if (progress >= 1) {
    unit.x = unit.motion.x;
    unit.y = unit.motion.y;
    unit.renderX = unit.x;
    unit.renderY = unit.y;
    unit.motion = null;
  }
}

function makeReplayUnit(unit) {
  const equipment = Object.fromEntries(Object.entries(unit.equipment || {}).map(([slot, item]) => [slot, item ? {
    id: item.id || null,
    name: item.name || null,
    slot: item.slot || slot,
    rarity: item.rarity || null,
    visualAssetId: item.visualAssetId || null,
    attackBonus: Number(item.attackBonus || 0),
    defenseBonus: Number(item.defenseBonus || 0),
    maxHpBonus: Number(item.maxHpBonus || 0),
    speedBonus: Number(item.speedBonus || 0),
    critChanceBonus: Number(item.critChanceBonus || 0),
  } : null]));
  return {
    id: unit.id,
    playerId: unit.playerId || null,
    combatantId: unit.combatantId || unit.id,
    name: unit.name,
    displayName: unit.displayName || unit.name,
    team: unit.team,
    role: unit.role,
    visualAssetId: unit.visualAssetId || null,
    attack: unit.attack,
    firstActionDamageBonus: Number(unit.firstActionDamageBonus || 0),
    defense: unit.defense,
    speed: unit.speed,
    critChance: unit.critChance || 0,
    skills: (unit.skills || []).map((skill) => skill.id || skill.skillId || skill),
    equipment,
    weaponFamily: unit.weaponFamily || null,
    targetingProfile: unit.targetingProfile || null,
    isBoss: Boolean(unit.isBoss),
    tags: clone(unit.tags || []),
    attackRange: unit.attackRange,
    x: unit.x,
    y: unit.y,
    hp: unit.hp,
    maxHp: unit.maxHp,
    mana: unit.mana,
    maxMana: unit.maxMana,
    shield: unit.shield || 0,
    effects: clone(unit.effects || []),
    defeated: unit.hp <= 0,
  };
}

function replaySnapshot(units, tick, events) {
  return {
    tick,
    timeMs: tick * ARENA_COMBAT_RULES.tickMs,
    units: units.map((unit) => ({
      ...makeReplayUnit(unit),
      renderX: unit.renderX,
      renderY: unit.renderY,
      motion: unit.motion ? { ...unit.motion } : null,
    })),
    events: events.map((event) => ({ ...event })),
  };
}

function changedStates(before, after) {
  const oldById = new Map(before.map((unit) => [unit.id, makeReplayUnit(unit)]));
  return after.flatMap((unit) => {
    const next = makeReplayUnit(unit);
    const previous = oldById.get(unit.id);
    return JSON.stringify(previous) === JSON.stringify(next) ? [] : [next];
  });
}

function effectiveAttackSpeed(unit, units) {
  const effectiveSpeed = (candidate) => Math.max(
    ARENA_COMBAT_RULES.minCharacterSpeed,
    Math.min(
      ARENA_COMBAT_RULES.maxCharacterSpeed,
      Number(projectCombatantWithAutomaticEffects(candidate).speed ?? candidate.speed),
    ),
  );
  const livingUnits = living(units);
  const effectiveSpeeds = livingUnits.map(effectiveSpeed);
  const slowestSpeed = Math.min(...effectiveSpeeds);
  const effective = effectiveSpeed(unit);
  return arenaSpeedProfile(effective, { slowestSpeed, combatantId: unit.id }).attacksPerSecond;
}

function actionCooldownMs(unit, units) {
  const speed = effectiveAttackSpeed(unit, units);
  return Math.ceil((1000 / speed) / ARENA_COMBAT_RULES.tickMs) * ARENA_COMBAT_RULES.tickMs;
}

function movementDurationMs(unit) {
  const profile = arenaSpeedProfile(unit.speed, { slowestSpeed: unit.speed, combatantId: unit.id });
  return Math.ceil((1000 / profile.tilesPerSecond) / ARENA_COMBAT_RULES.tickMs) * ARENA_COMBAT_RULES.tickMs;
}

function supportTarget(unit, friends) {
  const supportSkill = unit.skills?.[0];
  if (!supportSkill || unit.mana < supportSkill.manaCost
    || (!unit.forceSkillCast && !supportSkillNeeded(supportSkill, unit, friends))) return null;
  const effect = supportSkill.effect || {};
  const wantsHp = Number(effect.allyHeal || 0) > 0 || Number(effect.selfHealing || 0) > 0;
  const preferredTarget = unit.preferredSupportTargetId
    ? friends.find((friend) => friend.id === unit.preferredSupportTargetId && friend.hp > 0 && friend.hp < friend.maxHp)
    : null;
  const candidates = preferredTarget ? [preferredTarget] : friends.filter((friend) => friend.hp > 0 && (wantsHp
    ? friend.hp / friend.maxHp < ARENA_COMBAT_RULES.supportNeedRatio
    : friend.mana < friend.maxMana));
  return candidates.sort((left, right) => (
    (left.hp / left.maxHp) - (right.hp / right.maxHp)
    || (left.mana / Math.max(1, left.maxMana)) - (right.mana / Math.max(1, right.maxMana))
    || distance(unit, left) - distance(unit, right)
    || left.id.localeCompare(right.id)
  ))[0] || null;
}

function selectTarget(unit, friends, opponents, { context, seed, actionIndex, recentAttackerId }) {
  if (unit.team === 'enemies') {
    const selection = selectEnemyTarget({
      enemy: unit,
      participants: opponents.map((opponent) => ({ ...opponent, playerId: opponent.playerId || opponent.id })),
      runId: context.runId || context.battleId || seed,
      roomIndex: Number(context.roomIndex || 0),
      roundIndex: Math.floor(actionIndex / Math.max(1, friends.length + opponents.length)),
      actionIndex,
      recentAttackerId,
    });
    return {
      target: selection.target ? opponents.find((opponent) => opponent.id === selection.target.id) : null,
      policy: {
        profile: selection.targetingProfile,
        weights: selection.weights,
        roll: selection.roll,
      },
    };
  }

  if (unit.role === 'frontline') {
    return {
      target: [...opponents].sort((left, right) => (
        distance(unit, left) - distance(unit, right)
        || left.hp / left.maxHp - right.hp / right.maxHp
        || left.id.localeCompare(right.id)
      ))[0] || null,
      policy: { profile: 'nearest-frontline', weights: [], roll: null },
    };
  }
  const priority = selectPlayerTarget(opponents);
  const target = priority
    ? opponents.find((enemy) => enemy.id === priority.id)
    : null;
  return {
    target: target || [...opponents].sort((left, right) => (
      left.hp / left.maxHp - right.hp / right.maxHp
      || distance(unit, left) - distance(unit, right)
      || left.id.localeCompare(right.id)
    ))[0] || null,
    policy: { profile: unit.role === 'support' ? 'support-priority' : 'weakest-enemy', weights: [], roll: null },
  };
}

function battleOutcome(units) {
  const players = living(units, 'players');
  const enemies = living(units, 'enemies');
  if (players.length && enemies.length) return null;
  if (!players.length && !enemies.length) {
    return { outcome: 'draw', winnerId: null, loserId: null, winnerIds: [], loserIds: [], winnerTeam: null, loserTeam: null };
  }
  const winnerTeam = players.length ? 'players' : 'enemies';
  const loserTeam = players.length ? 'enemies' : 'players';
  const winners = living(units, winnerTeam);
  const losers = units.filter((unit) => unit.team === loserTeam && unit.hp <= 0);
  return {
    outcome: winnerTeam === 'players' ? 'victory' : 'defeat',
    winnerId: winners[0]?.id || null,
    loserId: losers[0]?.id || null,
    winnerIds: winners.map((unit) => unit.id),
    loserIds: losers.map((unit) => unit.id),
    winnerTeam,
    loserTeam,
  };
}

function unitStats(units) {
  return units.map((unit) => ({
    id: unit.id,
    name: unit.name,
    team: unit.team,
    role: unit.role,
    attackSpeed: arenaSpeedProfile(unit.speed, { slowestSpeed: unit.speed, combatantId: unit.id }).attacksPerSecond,
    movementSpeed: arenaSpeedProfile(unit.speed, { slowestSpeed: unit.speed, combatantId: unit.id }).tilesPerSecond,
    range: unit.attackRange,
  }));
}

function createBattleStepper({ units, turns, context, seed, random, actionIndexRef, recentAttackerRef }) {
  return (unit, target, atMs, supportCast) => {
    const before = units.map((candidate) => clone(candidate));
    const playerUnits = units.filter((candidate) => candidate.team === 'players');
    const enemyUnits = units.filter((candidate) => candidate.team === 'enemies');
    const actionIndex = actionIndexRef.value;
    const simulator = new AutomaticBattleSimulator({
      resolveAction: createEquipmentAwareAutomaticBasicAttackResolver({ random }),
      resolveSkill: (args) => {
        const action = resolveAutomaticBattleSkill(args);
        const bonus = Math.max(0, Math.floor(Number(args.actor.firstActionDamageBonus || 0)));
        if (!bonus || !Number(action.targetDamage || 0)
          || args.turns.some((turn) => turn.actorId === args.actor.id && turn.targetId !== null && Number(turn.targetDamage || 0) > 0)) return action;
        return {
          ...action,
          targetDamage: Number(action.targetDamage || 0) + bonus,
          metadata: { ...(action.metadata || {}), firstActionDamageBonus: bonus },
        };
      },
      selectActor: () => unit.id,
      selectTarget: () => target.id,
      selectSkill: ({ actor }) => {
        const ready = actor.skills?.find((skill) => actor.mana >= skill.manaCost) || null;
        if (!ready) return null;
        const effect = ready.effect || {};
        const needsAlly = Number(effect.allyHeal || 0) > 0
          || Number(effect.selfHealing || 0) > 0
          || Number(effect.allyMana || 0) > 0
          || (Array.isArray(effect.allyEffects) && effect.allyEffects.length > 0);
        const hasOffense = Number(effect.damageBonus || 0) > 0
          || Number(effect.damageMultiplier || 1) > 0
          || Boolean(effect.splash);
        if (unit.role === 'support' && needsAlly && !supportCast && !hasOffense) return null;
        return ready;
      },
      maxTurns: turns.length + 1,
    });
    const resolved = simulator.simulate({
      players: playerUnits,
      enemies: enemyUnits,
      context: { ...context, arenaTimeMs: atMs, seed },
      priorTurns: turns,
    });
    const nextById = new Map(resolved.combatants.map((candidate) => [candidate.id, candidate]));
    units.splice(0, units.length, ...units.map((candidate) => nextById.get(candidate.id) || candidate));
    const addedTurns = resolved.turns.slice(turns.length);
    turns.push(...addedTurns);
    actionIndexRef.value += addedTurns.length;
    const latest = addedTurns.at(-1) || null;
    if (latest && latest.metadata?.actionType) {
      recentAttackerRef.value = latest.actorId;
      const updatedActor = units.find((candidate) => candidate.id === latest.actorId);
      if (updatedActor) updatedActor.nextActionAtMs = atMs + actionCooldownMs(updatedActor, units);
    }
    return { latest, before, addedTurns };
  };
}

function appendActionEvents({ latest, before, units, atMs, target, actor, targetPolicy, replayEvents, events }) {
  const stateChanges = changedStates(before, units);
  const metadata = latest?.metadata || {};
  const actionType = metadata.actionType || 'effect-tick';
  const event = {
    kind: actionType === 'effect-tick' ? 'effect' : 'action',
    atMs,
    turnNumber: latest?.turnNumber ?? null,
    actorId: actor.id,
    targetId: latest?.targetId || target?.id || null,
    actionType,
    skillId: metadata.skillId || null,
    skillName: metadata.skillName || null,
    damageEvents: clone(metadata.damageEvents || []),
    healingEvents: clone(metadata.healingEvents || []),
    manaEvents: clone(metadata.manaEvents || []),
    effectEvents: clone([...(metadata.effectEvents || []), ...(metadata.effectApplications || [])]),
    critical: Boolean(metadata.critical),
    targetPolicy: targetPolicy ? clone(targetPolicy) : null,
    actorPosition: { x: actor.renderX, y: actor.renderY },
    targetPosition: target ? { x: target.renderX, y: target.renderY } : null,
    updates: stateChanges,
  };
  replayEvents.push(event);
  for (const damage of event.damageEvents) {
    const source = units.find((unit) => unit.id === damage.actorId);
    const damaged = units.find((unit) => unit.id === damage.targetId);
    if (source && damaged && source.team !== damaged.team) {
      source.threat = Math.min(ARENA_COMBAT_RULES.maxUnitStat, source.threat + Math.max(0, Number(damage.damage || 0)));
      if (source.team === 'enemies') source.lastTargetPlayerId = damaged.playerId || damaged.id;
    }
  }
  if (actionType === 'effect-tick') {
    events.push({
      type: 'EffectTickResolved',
      turnNumber: latest?.turnNumber ?? null,
      actorId: actor.id,
      damage: Number(latest?.effectDamage || 0),
      effectEvents: event.effectEvents,
    });
  } else {
    events.push({
      type: 'TurnResolved',
      turnNumber: latest.turnNumber,
      actorId: latest.actorId,
      targetId: latest.targetId,
      actionType,
      skillId: event.skillId,
      damageEvents: event.damageEvents,
      healingEvents: event.healingEvents,
    });
    for (const damage of event.damageEvents) {
      events.push({ type: 'DamageDealt', turnNumber: latest.turnNumber, ...damage });
    }
    for (const healing of event.healingEvents) {
      events.push({ type: 'HealingApplied', turnNumber: latest.turnNumber, ...healing });
    }
  }
}

/**
 * One server-authoritative simulation for all live combat families. Activity
 * services supply the real encounter roster and context; this Domain Model
 * owns formation, movement, path reservations, targeting, action timing,
 * skills/status application, HP/Mana mutation, and terminal outcome.
 */
export function simulateArenaCombat({
  players,
  enemies,
  context = {},
  seed = null,
  placements = {},
  durationMs = ARENA_COMBAT_RULES.maxDurationMs,
  includeFrames = false,
} = {}) {
  if (context == null || typeof context !== 'object' || Array.isArray(context)) {
    throw new Error('Arena combat context must be an object.');
  }
  let safeContext;
  try {
    const encodedContext = JSON.stringify(context);
    if (encodedContext.length > 16_384) throw new Error('Arena combat context must not exceed 16 KB.');
    safeContext = JSON.parse(encodedContext);
  } catch (error) {
    if (error.message.includes('16 KB')) throw error;
    throw new Error('Arena combat context must be a JSON-safe object.');
  }
  if (!safeContext || typeof safeContext !== 'object' || Array.isArray(safeContext)) {
    throw new Error('Arena combat context must be a JSON-safe object.');
  }
  if (seed !== null && seed !== undefined && String(seed).length > 256) {
    throw new Error('Arena combat seed must not exceed 256 characters.');
  }
  const input = validateBattleInput({ players, enemies, durationMs, placements });
  const units = input.units;
  const initialCombatants = units.map((unit) => makeReplayUnit(unit));
  const battleSeed = battleIdentitySeed(units, safeContext, seed);
  const random = createSeededRandom(battleSeed);
  const turns = [];
  const events = [{
    type: 'BattleStarted',
    replayVersion: 1,
    context: clone(safeContext),
    combatants: initialCombatants,
  }];
  const replayEvents = [];
  const actionIndexRef = { value: 0 };
  const recentAttackerRef = { value: null };
  let outcome = null;
  let durationReachedMs = 0;
  const frames = includeFrames ? [replaySnapshot(units, 0, [])] : null;
  const stepAction = createBattleStepper({ units, turns, context: safeContext, seed: battleSeed, random, actionIndexRef, recentAttackerRef });

  for (let tick = 1; tick <= input.durationMs / ARENA_COMBAT_RULES.tickMs; tick += 1) {
    const atMs = tick * ARENA_COMBAT_RULES.tickMs;
    durationReachedMs = atMs;
    const tickEvents = [];
    for (const unit of units) advanceMotion(unit, atMs);

    const preferredTeam = tick % 2 === 0 ? 'enemies' : 'players';
    const due = units.filter((unit) => unit.hp > 0 && !unit.motion && atMs >= unit.nextActionAtMs)
      .sort((left, right) => left.nextActionAtMs - right.nextActionAtMs
        || (left.team === preferredTeam ? -1 : 1) - (right.team === preferredTeam ? -1 : 1)
        || left.id.localeCompare(right.id));

    for (const candidate of due) {
      const unit = units.find((current) => current.id === candidate.id);
      if (!unit || unit.hp <= 0 || unit.motion) continue;
      const friends = living(units, unit.team);
      const opponents = living(units, teamOf(unit));
      if (!friends.length || !opponents.length) break;

      let allySupportTarget = null;
      let supportCast = false;
      if (unit.role === 'support') {
        allySupportTarget = supportTarget(unit, friends);
        if (allySupportTarget && distance(unit, allySupportTarget) > unit.supportRange) {
          const step = pathFirstStep(unit, allySupportTarget, units, unit.supportRange);
          if (step) {
            const duration = movementDurationMs(unit);
            unit.motion = { ...step, startMs: atMs, durationMs: duration };
            unit.intent = `Following ${allySupportTarget.displayName || allySupportTarget.name}`;
            const moveEvent = {
              kind: 'move',
              atMs,
              unitId: unit.id,
              fromX: unit.x,
              fromY: unit.y,
              toX: step.x,
              toY: step.y,
              durationMs: duration,
            };
            replayEvents.push(moveEvent);
            tickEvents.push({ type: 'move', ...moveEvent });
            continue;
          }
        } else if (allySupportTarget) {
          supportCast = true;
        }
      }

      const selection = selectTarget(unit, friends, opponents, {
        context: safeContext,
        seed: battleSeed,
        actionIndex: actionIndexRef.value,
        recentAttackerId: recentAttackerRef.value,
      });
      const target = selection.target;
      if (!target) continue;
      unit.targetId = target.id;
      if (target.x !== unit.x) unit.facing = target.x > unit.x ? 1 : -1;

      const threats = opponents.filter((opponent) => opponent.role === 'frontline' && distance(unit, opponent) < 2);
      if (unit.role !== 'frontline' && threats.length) {
        const step = retreatStep(unit, threats, units);
        if (step) {
          const duration = movementDurationMs(unit);
          unit.motion = { ...step, startMs: atMs, durationMs: duration };
          unit.intent = 'Keeping distance';
          const moveEvent = {
            kind: 'move',
            atMs,
            unitId: unit.id,
            fromX: unit.x,
            fromY: unit.y,
            toX: step.x,
            toY: step.y,
            durationMs: duration,
          };
          replayEvents.push(moveEvent);
          tickEvents.push({ type: 'move', ...moveEvent });
          continue;
        }
      }

      const supportSkillRangeSatisfied = supportCast && allySupportTarget
        && distance(unit, allySupportTarget) <= unit.supportRange;
      const attackRangeSatisfied = distance(unit, target) <= unit.attackRange;
      if (!attackRangeSatisfied && !supportSkillRangeSatisfied) {
        const step = pathFirstStep(unit, target, units, unit.attackRange);
        if (step) {
          const duration = movementDurationMs(unit);
          unit.motion = { ...step, startMs: atMs, durationMs: duration };
          unit.intent = 'Closing in';
          const moveEvent = {
            kind: 'move',
            atMs,
            unitId: unit.id,
            fromX: unit.x,
            fromY: unit.y,
            toX: step.x,
            toY: step.y,
            durationMs: duration,
          };
          replayEvents.push(moveEvent);
          tickEvents.push({ type: 'move', ...moveEvent });
        } else {
          unit.intent = 'Waiting for a clear path';
        }
        continue;
      }

      const beforeActionCount = turns.length;
      const resolved = stepAction(unit, target, atMs, supportSkillRangeSatisfied);
      const addedTurn = resolved.latest;
      if (addedTurn) {
        appendActionEvents({
          latest: addedTurn,
          before: resolved.before,
          units,
          atMs,
          target,
          actor: units.find((current) => current.id === unit.id) || unit,
          targetPolicy: selection.policy,
          replayEvents,
          events,
        });
        tickEvents.push(replayEvents.at(-1));
      }
      if (turns.length === beforeActionCount && unit.hp > 0) {
        unit.nextActionAtMs = atMs + actionCooldownMs(unit, units);
      }
      outcome = battleOutcome(units);
      if (outcome) break;
    }

    outcome ||= battleOutcome(units);
    if (includeFrames) frames.push(replaySnapshot(units, tick, tickEvents));
    if (outcome) break;
  }

  if (!outcome) {
    outcome = {
      outcome: 'draw',
      winnerId: null,
      loserId: null,
      winnerIds: [],
      loserIds: [],
      winnerTeam: null,
      loserTeam: null,
    };
    events.push({ type: 'BattleTimedOut', durationMs: durationReachedMs, stopReason: 'timeout' });
  }
  events.push({ type: 'BattleCompleted', ...outcome, turnNumber: turns.length, durationMs: durationReachedMs });

  const finalUnits = units.map((unit) => makeReplayUnit(unit));
  const replay = Object.freeze({
    kind: 'arena-combat-replay',
    version: ARENA_COMBAT_RULES.version,
    seed: battleSeed,
    context: clone(safeContext),
    boardSize: ARENA_COMBAT_RULES.boardSize,
    tickMs: ARENA_COMBAT_RULES.tickMs,
    durationMs: durationReachedMs,
    outcome: outcome.outcome,
    combatants: initialCombatants,
    events: replayEvents.map((event) => clone(event)),
    finalCombatants: finalUnits,
  });
  return {
    ...outcome,
    context: clone(safeContext),
    outcome: outcome.outcome,
    combatants: clone(units),
    players: clone(units.filter((unit) => unit.team === 'players')),
    enemies: clone(units.filter((unit) => unit.team === 'enemies')),
    teams: {
      players: clone(units.filter((unit) => unit.team === 'players')),
      enemies: clone(units.filter((unit) => unit.team === 'enemies')),
    },
    turns: clone(turns),
    events: clone(events),
    replay,
    duration: durationReachedMs / 1000,
    durationMs: durationReachedMs,
    stopReason: outcome.outcome === 'draw' && durationReachedMs >= input.durationMs ? 'timeout' : null,
    stats: unitStats(units),
    ...(includeFrames ? { frames } : {}),
  };
}

export { ARENA_COMBAT_RULES };
