export const PROGRESSION_BOSS_ENRAGE_CAP = 4;
export const PROGRESSION_BOSS_ENRAGE_STEP = 0.10;

export function progressionBossEnrage(stackCount, { cap = PROGRESSION_BOSS_ENRAGE_CAP, step = PROGRESSION_BOSS_ENRAGE_STEP } = {}) {
  const requested = Number.isFinite(Number(stackCount)) ? Math.floor(Number(stackCount)) : 0;
  const stack = Math.min(Math.max(0, requested), cap);
  const multiplier = 1 + (stack * step);
  return Object.freeze({
    stack,
    cap,
    step,
    multiplier,
    percentIncrease: Math.round(stack * step * 100),
  });
}

export function applyProgressionBossEnrage(definition, stackCount) {
  if (!definition?.progressionAdventure || !definition.boss) return definition;
  const enrage = progressionBossEnrage(stackCount);
  if (enrage.stack === 0) return Object.freeze({ ...definition, progressionEnrage: enrage });
  return Object.freeze({
    ...definition,
    progressionEnrage: enrage,
    boss: Object.freeze({
      ...definition.boss,
      hp: Math.ceil(Number(definition.boss.hp) * enrage.multiplier),
      retaliation: Math.ceil(Number(definition.boss.retaliation) * enrage.multiplier),
    }),
  });
}
