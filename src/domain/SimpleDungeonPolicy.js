export const SIMPLE_DUNGEON_RULES = Object.freeze({
  version: 1,
  recommendedAttack: 9,
  enemyHealthMultiplier: 2,
  retaliationMultiplier: 1.5,
  betweenEncounterRecovery: 0.20,
});

function harderEnemy(enemy, { boss = false } = {}) {
  if (!enemy) return enemy;
  const hpMultiplier = SIMPLE_DUNGEON_RULES.enemyHealthMultiplier;
  const retaliationMultiplier = SIMPLE_DUNGEON_RULES.retaliationMultiplier;
  return {
    ...structuredClone(enemy),
    hp: Math.max(1, Math.ceil(Number(enemy.hp || 1) * hpMultiplier)),
    retaliation: Math.max(1, Math.ceil(Number(enemy.retaliation || 1) * retaliationMultiplier)),
    // The simple loop is a gear/stat check rather than a reaction minigame.
    abilities: [],
    intentCadence: 999999,
    simpleBoss: boss,
  };
}

/**
 * Snapshot difficulty into the run so future balance changes never mutate a run
 * already in progress.
 */
export function prepareSimpleDungeon(definition) {
  if (!definition) throw new Error('Dungeon definition is required.');
  if (definition.simpleDifficultyVersion === SIMPLE_DUNGEON_RULES.version) return structuredClone(definition);
  return {
    ...structuredClone(definition),
    encounters: (definition.encounters || []).map((enemy) => harderEnemy(enemy)),
    boss: harderEnemy(definition.boss, { boss: true }),
    recommendedAttack: Number(definition.recommendedAttack || SIMPLE_DUNGEON_RULES.recommendedAttack),
    simpleDifficultyVersion: SIMPLE_DUNGEON_RULES.version,
  };
}

export function dungeonReadiness({ attackPower, maxHealth, definition }) {
  const recommendedAttack = Number(definition?.recommendedAttack || SIMPLE_DUNGEON_RULES.recommendedAttack);
  return {
    recommendedAttack,
    attackPower: Number(attackPower || 0),
    maxHealth: Number(maxHealth || 0),
    ready: Number(attackPower || 0) >= recommendedAttack,
    attackShortfall: Math.max(0, recommendedAttack - Number(attackPower || 0)),
  };
}

export function recoverBetweenEncounters(participants) {
  const recovery = [];
  for (const participant of participants || []) {
    if (participant.hp <= 0) continue;
    const amount = Math.max(1, Math.ceil(participant.maxHp * SIMPLE_DUNGEON_RULES.betweenEncounterRecovery));
    const before = participant.hp;
    participant.hp = Math.min(participant.maxHp, participant.hp + amount);
    recovery.push({ playerId: participant.playerId, amount: participant.hp - before, hp: participant.hp, maxHp: participant.maxHp });
  }
  return recovery.filter((entry) => entry.amount > 0);
}
