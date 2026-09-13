function integer(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number)) throw new Error(`${label} must be a whole number.`);
  return number;
}

export function normalizeCoinflipWager(value) {
  const wager = integer(value, 'Coinflip wager');
  if (wager <= 0) {
    const error = new Error('Coinflip wager must be a positive whole number of Gold.');
    error.code = 'invalid_coinflip_wager';
    throw error;
  }
  return wager;
}

export function normalizeCoinflipChoice(value) {
  const choice = String(value || '').trim().toLowerCase();
  if (!['heads', 'tails'].includes(choice)) {
    const error = new Error('Coinflip choice must be heads or tails.');
    error.code = 'invalid_coinflip_choice';
    throw error;
  }
  return choice;
}

export function coinflipSettlementGold(wager, outcome) {
  const amount = normalizeCoinflipWager(wager);
  if (outcome === 'win') return amount * 2;
  if (outcome === 'loss') return 0;
  throw new Error(`Unsupported Coinflip outcome: ${outcome}`);
}

export function resolveCoinflip({ id, playerId, wager, choice, random = Math.random }) {
  const flipId = String(id || '').trim();
  const ownerId = String(playerId || '').trim();
  if (!flipId) throw new Error('Coinflip id is required.');
  if (!ownerId) throw new Error('Coinflip player id is required.');
  if (typeof random !== 'function') throw new Error('Coinflip random source must be a function.');

  const amount = normalizeCoinflipWager(wager);
  const selected = normalizeCoinflipChoice(choice);
  const sample = Number(random());
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    const error = new Error('Coinflip random source must return values in [0, 1).');
    error.code = 'invalid_coinflip_random';
    throw error;
  }

  const result = sample < 0.5 ? 'heads' : 'tails';
  const outcome = result === selected ? 'win' : 'loss';
  return Object.freeze({
    id: flipId,
    playerId: ownerId,
    wager: amount,
    choice: selected,
    result,
    outcome,
    payoutGold: coinflipSettlementGold(amount, outcome),
  });
}

export function projectCoinflip(flip) {
  if (!flip) return null;
  return Object.freeze({
    id: String(flip.id),
    wager: normalizeCoinflipWager(flip.wager),
    currency: 'Gold',
    choice: normalizeCoinflipChoice(flip.choice),
    result: normalizeCoinflipChoice(flip.result),
    outcome: flip.outcome,
    payoutGold: integer(flip.payoutGold ?? 0, 'Coinflip payout'),
  });
}
