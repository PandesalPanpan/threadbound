export const NORMAL_DEATH_RULES = Object.freeze({
  carriedGoldLossPercent: 20,
});

function nonNegativeWhole(value, label) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be a non-negative whole number.`);
  return number;
}

/**
 * Canonical normal-death penalty. Only carried Gold is at risk here; banked Gold
 * is deliberately outside this policy and must never be included in the loss base.
 */
export function resolveNormalDeathPenalty({ carriedGold } = {}) {
  const carried = nonNegativeWhole(carriedGold ?? 0, 'carriedGold');
  const goldLost = Math.floor((carried * NORMAL_DEATH_RULES.carriedGoldLossPercent) / 100);
  return Object.freeze({
    carriedGoldBefore: carried,
    goldLost,
    carriedGoldAfter: carried - goldLost,
    lossPercent: NORMAL_DEATH_RULES.carriedGoldLossPercent,
  });
}
