import { TARGETING_PROFILES } from './SimpleEncounterBattle.js';

export const SIMPLE_DUNGEON_RULES = Object.freeze({
  version: 2,
  recommendedAttack: 9,
  singletonHpMultiplier: 2,
  singletonRetaliationMultiplier: 1.5,
  bossHpMultiplier: 1.5,
  groupHpMultiplier: Object.freeze({ 1: 1, 2: 1.15, 3: 1.28 }),
  groupIncomingDamageMultiplier: Object.freeze({ 1: 1, 2: 1.3, 3: 1.5 }),
  partyHpMultiplier: Object.freeze([0, 1, 1.25, 1.45, 1.65]),
  partyIncomingDamageMultiplier: Object.freeze([0, 1, 1.05, 1.1, 1.15]),
  maxEnemiesPerStage: 3,
});

const PROFILE_BY_ID = Object.freeze({
  'frayed-wisp': 'random',
  'hollow-stalker': 'hunter',
  'silkbound-guard': 'bruiser',
  'first-needle': 'tactical',
  'glass-skulker': 'hunter',
  'stitch-leech': 'feral',
  'mirror-warden': 'bruiser',
  'shard-choir': 'tactical',
  'hollow-mirror': 'tactical',
});

function profileFor(enemy) {
  if (TARGETING_PROFILES.includes(enemy?.targetingProfile)) return enemy.targetingProfile;
  if (PROFILE_BY_ID[enemy?.id]) return PROFILE_BY_ID[enemy.id];
  if ((enemy?.abilities || []).includes('ally_hunter')) return 'hunter';
  return 'random';
}

function sourceEnemy(enemy, { boss = false } = {}) {
  if (!enemy) return enemy;
  return {
    ...structuredClone(enemy),
    targetingProfile: profileFor(enemy),
    simpleBaseHp: Math.max(1, Number(enemy.simpleBaseHp || enemy.hp || 1)),
    simpleBaseRetaliation: Math.max(1, Number(enemy.simpleBaseRetaliation || enemy.retaliation || 1)),
    isBoss: Boolean(boss || enemy.isBoss),
  };
}

function asStage(entry) {
  if (Array.isArray(entry)) return entry.map((enemy) => sourceEnemy(enemy));
  return [sourceEnemy(entry)];
}

export function simpleEncounterStages(definition) {
  const source = definition?.simpleStages || definition?.encounterStages || definition?.encounters || [];
  const stages = source.map(asStage);
  if (!stages.length) throw new Error('A simple Dungeon requires at least one encounter stage.');
  if (stages.some((stage) => stage.length < 1 || stage.length > SIMPLE_DUNGEON_RULES.maxEnemiesPerStage)) {
    throw new Error(`A simple Dungeon stage must contain between 1 and ${SIMPLE_DUNGEON_RULES.maxEnemiesPerStage} enemies.`);
  }
  return stages;
}

function hardenedEnemy(enemy, { boss = false } = {}) {
  if (!enemy) return enemy;
  const hpMultiplier = SIMPLE_DUNGEON_RULES.singletonHpMultiplier;
  const retaliationMultiplier = SIMPLE_DUNGEON_RULES.singletonRetaliationMultiplier;
  return {
    ...structuredClone(enemy),
    targetingProfile: profileFor(enemy),
    simpleBaseHp: Math.max(1, Number(enemy.simpleBaseHp || enemy.hp || 1)),
    simpleBaseRetaliation: Math.max(1, Number(enemy.simpleBaseRetaliation || enemy.retaliation || 1)),
    hp: Math.max(1, Math.ceil(Number(enemy.hp || 1) * hpMultiplier)),
    retaliation: Math.max(1, Math.ceil(Number(enemy.retaliation || 1) * retaliationMultiplier)),
    // The simple loop is a gear/stat check rather than a reaction minigame.
    abilities: [],
    intentCadence: 999999,
    simpleBoss: boss,
    isBoss: Boolean(boss || enemy.isBoss),
  };
}

/**
 * Snapshot the simple-Dungeon balance and stage composition into a run
 * definition. `encounters` stays a hardened singleton projection for legacy
 * callers; `simpleStages` is authoritative for new multi-enemy runs.
 */
export function prepareSimpleDungeon(definition) {
  if (!definition) throw new Error('Dungeon definition is required.');
  const stages = simpleEncounterStages(definition);
  const simpleStages = stages.map((stage) => stage.map((enemy) => sourceEnemy(enemy)));
  const flatLegacySource = Array.isArray(definition.encounters) && !definition.encounters.some((entry) => Array.isArray(entry))
    ? definition.encounters
    : simpleStages.map((stage) => stage[0]);
  const legacyEncounters = flatLegacySource.map((enemy) => hardenedEnemy(enemy));
  const boss = hardenedEnemy(definition.boss, { boss: true });
  return {
    ...structuredClone(definition),
    encounters: legacyEncounters,
    simpleStages,
    boss,
    simpleDifficultyVersion: SIMPLE_DUNGEON_RULES.version,
    simpleBalance: structuredClone(SIMPLE_DUNGEON_RULES),
    recommendedAttack: Number(definition.recommendedAttack || SIMPLE_DUNGEON_RULES.recommendedAttack),
  };
}

function sourceForStage(definition, stageIndex) {
  const stages = definition?.simpleStages || simpleEncounterStages(definition);
  return stages[stageIndex] || null;
}

function partyMultiplier(values, participantCount, fallback = 1) {
  return Number(values?.[participantCount] || fallback);
}

/**
 * Group rooms spend one shared room budget: average source HP/retaliation,
 * hardened once, then adjusted by the group and party multipliers. Splitting
 * that total across bodies preserves the action-economy payoff of defeating a
 * mob without multiplying the old singleton budget per enemy.
 */
export function simpleStageBudget(stage, participantCount, { boss = false } = {}) {
  const sources = stage?.length ? stage : [];
  const groupSize = sources.length;
  const hpBase = sources.reduce((sum, enemy) => sum + Number(enemy.simpleBaseHp || enemy.hp || 1), 0) / Math.max(1, groupSize);
  const retaliationBase = sources.reduce((sum, enemy) => sum + Number(enemy.simpleBaseRetaliation || enemy.retaliation || 1), 0) / Math.max(1, groupSize);
  if (boss || groupSize === 1) {
    return {
      hp: Math.max(1, Math.ceil(hpBase * (boss ? SIMPLE_DUNGEON_RULES.bossHpMultiplier : SIMPLE_DUNGEON_RULES.singletonHpMultiplier) * partyMultiplier(SIMPLE_DUNGEON_RULES.partyHpMultiplier, participantCount))),
      retaliation: Math.max(1, Math.ceil(retaliationBase * SIMPLE_DUNGEON_RULES.singletonRetaliationMultiplier * partyMultiplier(SIMPLE_DUNGEON_RULES.partyIncomingDamageMultiplier, participantCount))),
    };
  }
  return {
    hp: Math.max(1, Math.ceil(hpBase * SIMPLE_DUNGEON_RULES.singletonHpMultiplier * (SIMPLE_DUNGEON_RULES.groupHpMultiplier[groupSize] || 1) * partyMultiplier(SIMPLE_DUNGEON_RULES.partyHpMultiplier, participantCount))),
    retaliation: Math.max(1, Math.ceil(retaliationBase * SIMPLE_DUNGEON_RULES.singletonRetaliationMultiplier * (SIMPLE_DUNGEON_RULES.groupIncomingDamageMultiplier[groupSize] || 1) * partyMultiplier(SIMPLE_DUNGEON_RULES.partyIncomingDamageMultiplier, participantCount))),
  };
}

/**
 * Allocate a stage budget across its source enemies. The final member receives
 * the remainder so integer rounding never changes the total room budget.
 */
export function instantiateSimpleStage({ definition, stage, roomIndex = 0, participantCount = 1, boss = false }) {
  const sources = (stage || []).map((enemy) => sourceEnemy(enemy, { boss }));
  if (!sources.length) throw new Error('Cannot instantiate an empty simple Dungeon stage.');
  if (sources.length > SIMPLE_DUNGEON_RULES.maxEnemiesPerStage) throw new Error('A simple Dungeon stage cannot contain more than three enemies.');
  const budget = simpleStageBudget(sources, participantCount, { boss });
  const hpSourceTotal = sources.reduce((sum, enemy) => sum + Number(enemy.simpleBaseHp || enemy.hp || 1), 0);
  const retaliationSourceTotal = sources.reduce((sum, enemy) => sum + Number(enemy.simpleBaseRetaliation || enemy.retaliation || 1), 0);
  let hpRemaining = budget.hp;
  let retaliationRemaining = budget.retaliation;
  return sources.map((enemy, index) => {
    const last = index === sources.length - 1;
    const hp = last
      ? hpRemaining
      : Math.max(1, Math.round(budget.hp * Number(enemy.simpleBaseHp || enemy.hp || 1) / hpSourceTotal));
    const retaliation = last
      ? retaliationRemaining
      : Math.max(1, Math.round(budget.retaliation * Number(enemy.simpleBaseRetaliation || enemy.retaliation || 1) / retaliationSourceTotal));
    hpRemaining -= hp;
    retaliationRemaining -= retaliation;
    const definitionId = enemy.id || enemy.definitionId;
    return {
      combatantId: `room-${roomIndex}:${definitionId}:${index}`,
      id: definitionId,
      definitionId,
      name: enemy.name || definitionId,
      visualAssetId: enemy.visualAssetId || null,
      hp,
      maxHp: hp,
      retaliation,
      targetingProfile: profileFor(enemy),
      abilities: [],
      intentCadence: 999999,
      isBoss: Boolean(boss || enemy.isBoss),
      battlePhase: boss ? 1 : 0,
      phaseName: boss ? 'Stitching' : null,
      statuses: { exposed: 0 },
      lastTargetPlayerId: null,
      sourceDungeonId: definition?.id || null,
    };
  });
}

export function simpleStageFor(definition, stageIndex) {
  return sourceForStage(definition, stageIndex);
}

export function simpleRulesSummary(definition) {
  return {
    version: Number(definition?.simpleDifficultyVersion || SIMPLE_DUNGEON_RULES.version),
    recommendedAttack: Number(definition?.recommendedAttack || SIMPLE_DUNGEON_RULES.recommendedAttack),
    maxEnemiesPerStage: SIMPLE_DUNGEON_RULES.maxEnemiesPerStage,
    targetingProfiles: [...TARGETING_PROFILES],
  };
}

export function dungeonReadiness({ attackPower, maxHealth, currentHealth = maxHealth, definition }) {
  const recommendedAttack = Number(definition?.recommendedAttack || SIMPLE_DUNGEON_RULES.recommendedAttack);
  const health = Number(currentHealth || 0);
  return {
    recommendedAttack,
    attackPower: Number(attackPower || 0),
    maxHealth: Number(maxHealth || 0),
    currentHealth: health,
    canEnter: health > 0,
    ready: Number(attackPower || 0) >= recommendedAttack && health > 0,
    attackShortfall: Math.max(0, recommendedAttack - Number(attackPower || 0)),
    healthError: health > 0 ? null : 'Too wounded to enter. Recover or use a potion first.',
  };
}

export function recoverBetweenEncounters(participants) {
  // Kept as a migration-safe export for older callers. New simple runs never
  // receive free room recovery; healing must be an explicit domain action.
  return [];
}
