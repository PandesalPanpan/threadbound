const SLOT_SYMBOLS = Object.freeze(['coin', 'sword', 'shield', 'crown']);
const TRIPLE_PAYOUT_MULTIPLIER = Object.freeze({
  coin: 2,
  sword: 3,
  shield: 4,
  crown: 6,
});

function integer(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number)) throw new Error(`${label} must be a whole number.`);
  return number;
}

export function normalizeSlotsWager(value) {
  const wager = integer(value, 'Slots wager');
  if (wager <= 0) {
    const error = new Error('Slots wager must be a positive whole number of Gold.');
    error.code = 'invalid_slots_wager';
    throw error;
  }
  return wager;
}

function normalizeSymbol(value) {
  const symbol = String(value || '').trim().toLowerCase();
  if (!SLOT_SYMBOLS.includes(symbol)) {
    const error = new Error(`Invalid Slots symbol: ${value}`);
    error.code = 'invalid_slots_symbol';
    throw error;
  }
  return symbol;
}

function sampleSymbol(random) {
  const sample = Number(random());
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    const error = new Error('Slots random source must return values in [0, 1).');
    error.code = 'invalid_slots_random';
    throw error;
  }
  return SLOT_SYMBOLS[Math.floor(sample * SLOT_SYMBOLS.length)];
}

export function slotsSettlementGold(wager, reels) {
  const amount = normalizeSlotsWager(wager);
  if (!Array.isArray(reels) || reels.length !== 3) throw new Error('Slots requires exactly three reels.');
  const symbols = reels.map(normalizeSymbol);
  const counts = new Map();
  for (const symbol of symbols) counts.set(symbol, (counts.get(symbol) || 0) + 1);
  const triple = counts.size === 1 ? symbols[0] : null;
  if (triple) return amount * TRIPLE_PAYOUT_MULTIPLIER[triple];
  if ([...counts.values()].includes(2)) return amount;
  return 0;
}

export function resolveSlotsSpin({ id, playerId, wager, random = Math.random }) {
  const spinId = String(id || '').trim();
  const ownerId = String(playerId || '').trim();
  if (!spinId) throw new Error('Slots spin id is required.');
  if (!ownerId) throw new Error('Slots player id is required.');
  if (typeof random !== 'function') throw new Error('Slots random source must be a function.');

  const amount = normalizeSlotsWager(wager);
  const reels = Object.freeze([
    sampleSymbol(random),
    sampleSymbol(random),
    sampleSymbol(random),
  ]);
  const payoutGold = slotsSettlementGold(amount, reels);
  const allSame = new Set(reels).size === 1;
  const outcome = allSame && reels[0] === 'crown'
    ? 'jackpot'
    : payoutGold > 0
      ? 'win'
      : 'loss';

  return Object.freeze({
    id: spinId,
    playerId: ownerId,
    wager: amount,
    reels,
    outcome,
    payoutGold,
  });
}

export function projectSlotsSpin(spin) {
  if (!spin) return null;
  const reels = Object.freeze((spin.reels || []).map(normalizeSymbol));
  if (reels.length !== 3) throw new Error('Slots projection requires exactly three reels.');
  return Object.freeze({
    id: String(spin.id),
    wager: normalizeSlotsWager(spin.wager),
    currency: 'Gold',
    reels,
    outcome: spin.outcome,
    payoutGold: integer(spin.payoutGold ?? 0, 'Slots payout'),
  });
}

export { SLOT_SYMBOLS };
