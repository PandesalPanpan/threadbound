export const GAMBLING_MIN_WAGER_GOLD = 1;
// There is no product-wide cap. Each repository transaction still checks the
// current carried balance immediately before debiting the wager.
export const GAMBLING_MAX_WAGER_GOLD = null;

export function normalizeGamblingWager(value, { game = 'Gambling', code = 'invalid_gambling_wager' } = {}) {
  const wager = Number(value);
  if (!Number.isInteger(wager)) {
    const error = new Error(`${game} wager must be a whole number of Gold.`);
    error.code = code;
    throw error;
  }
  if (wager < GAMBLING_MIN_WAGER_GOLD) {
    const error = new Error(`${game} wager must be at least ${GAMBLING_MIN_WAGER_GOLD} Gold.`);
    error.code = code;
    throw error;
  }
  return wager;
}

export function gamblingBalanceLimits() {
  return Object.freeze({
    minWagerGold: GAMBLING_MIN_WAGER_GOLD,
    maxWagerGold: GAMBLING_MAX_WAGER_GOLD,
    currency: 'Gold',
  });
}
