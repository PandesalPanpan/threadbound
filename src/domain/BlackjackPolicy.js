const SUITS = Object.freeze(['C', 'D', 'H', 'S']);
const RANKS = Object.freeze(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']);
const CARD_VALUES = Object.freeze({ A: 11, J: 10, Q: 10, K: 10 });

function integer(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number)) throw new Error(`${label} must be a whole number.`);
  return number;
}

export function normalizeBlackjackWager(value) {
  const wager = integer(value, 'Blackjack wager');
  if (wager <= 0) {
    const error = new Error('Blackjack wager must be a positive whole number of Gold.');
    error.code = 'invalid_blackjack_wager';
    throw error;
  }
  return wager;
}

export function createBlackjackDeck() {
  return Object.freeze(SUITS.flatMap((suit) => RANKS.map((rank) => `${rank}${suit}`)));
}

function normalizedCard(value) {
  const card = String(value || '').trim().toUpperCase();
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  if (!SUITS.includes(suit) || !RANKS.includes(rank)) {
    const error = new Error(`Invalid Blackjack card: ${value}`);
    error.code = 'invalid_blackjack_card';
    throw error;
  }
  return card;
}

export function shuffleBlackjackDeck({ random = Math.random } = {}) {
  if (typeof random !== 'function') throw new Error('Blackjack random source must be a function.');
  const deck = [...createBlackjackDeck()];
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const sample = Number(random());
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new Error('Blackjack random source must return values in [0, 1).');
    const swapIndex = Math.floor(sample * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return Object.freeze(deck);
}

export function scoreBlackjackHand(cards = []) {
  if (!Array.isArray(cards)) throw new Error('Blackjack hand must be an array.');
  let total = 0;
  let aces = 0;
  for (const value of cards) {
    const card = normalizedCard(value);
    const rank = card.slice(0, -1);
    if (rank === 'A') aces += 1;
    total += CARD_VALUES[rank] ?? Number(rank);
  }
  let softAces = aces;
  while (total > 21 && softAces > 0) {
    total -= 10;
    softAces -= 1;
  }
  return Object.freeze({
    total,
    soft: softAces > 0,
    blackjack: cards.length === 2 && total === 21,
    bust: total > 21,
  });
}

function frozenRound(round) {
  return Object.freeze({
    id: String(round.id),
    playerId: String(round.playerId),
    wager: normalizeBlackjackWager(round.wager),
    deck: Object.freeze((round.deck || []).map(normalizedCard)),
    nextCardIndex: integer(round.nextCardIndex, 'Blackjack deck cursor'),
    playerHand: Object.freeze((round.playerHand || []).map(normalizedCard)),
    dealerHand: Object.freeze((round.dealerHand || []).map(normalizedCard)),
    status: round.status,
    outcome: round.outcome ?? null,
    payoutGold: integer(round.payoutGold ?? 0, 'Blackjack payout'),
  });
}

function drawCard(round, handKey) {
  if (round.nextCardIndex >= round.deck.length) {
    const error = new Error('Blackjack deck was exhausted before the round resolved.');
    error.code = 'blackjack_deck_exhausted';
    throw error;
  }
  const hand = [...round[handKey], round.deck[round.nextCardIndex]];
  return frozenRound({ ...round, [handKey]: hand, nextCardIndex: round.nextCardIndex + 1 });
}

export function blackjackSettlementGold(wager, outcome) {
  const amount = normalizeBlackjackWager(wager);
  if (outcome === 'win') return amount * 2;
  if (outcome === 'push') return amount;
  if (outcome === 'loss') return 0;
  throw new Error(`Unsupported Blackjack outcome: ${outcome}`);
}

function resolved(round, outcome) {
  return frozenRound({
    ...round,
    status: 'resolved',
    outcome,
    payoutGold: blackjackSettlementGold(round.wager, outcome),
  });
}

function compareHands(round) {
  const player = scoreBlackjackHand(round.playerHand);
  const dealer = scoreBlackjackHand(round.dealerHand);
  if (player.bust) return resolved(round, 'loss');
  if (dealer.bust) return resolved(round, 'win');
  if (player.total > dealer.total) return resolved(round, 'win');
  if (player.total < dealer.total) return resolved(round, 'loss');
  return resolved(round, 'push');
}

function settleDealer(round) {
  let next = round;
  while (scoreBlackjackHand(next.dealerHand).total < 17) next = drawCard(next, 'dealerHand');
  return compareHands(next);
}

export function startBlackjackRound({ id, playerId, wager, deck = createBlackjackDeck() }) {
  const roundId = String(id || '').trim();
  const ownerId = String(playerId || '').trim();
  if (!roundId) throw new Error('Blackjack round id is required.');
  if (!ownerId) throw new Error('Blackjack player id is required.');
  if (!Array.isArray(deck) || deck.length < 4) throw new Error('Blackjack deck must contain at least four cards.');
  const normalizedDeck = deck.map(normalizedCard);
  if (new Set(normalizedDeck).size !== normalizedDeck.length) throw new Error('Blackjack deck cannot contain duplicate cards.');

  let round = frozenRound({
    id: roundId,
    playerId: ownerId,
    wager,
    deck: normalizedDeck,
    nextCardIndex: 0,
    playerHand: [],
    dealerHand: [],
    status: 'active',
    outcome: null,
    payoutGold: 0,
  });
  round = drawCard(round, 'playerHand');
  round = drawCard(round, 'dealerHand');
  round = drawCard(round, 'playerHand');
  round = drawCard(round, 'dealerHand');

  const player = scoreBlackjackHand(round.playerHand);
  const dealer = scoreBlackjackHand(round.dealerHand);
  if (player.blackjack && dealer.blackjack) return resolved(round, 'push');
  if (player.blackjack) return resolved(round, 'win');
  if (dealer.blackjack) return resolved(round, 'loss');
  return round;
}

export function applyBlackjackAction(roundInput, action) {
  let round = frozenRound(roundInput);
  if (round.status !== 'active') {
    const error = new Error('This Blackjack round is already resolved.');
    error.code = 'blackjack_round_resolved';
    throw error;
  }
  const normalizedAction = String(action || '').trim().toLowerCase();
  if (!['hit', 'stand'].includes(normalizedAction)) {
    const error = new Error('Blackjack action must be hit or stand.');
    error.code = 'invalid_blackjack_action';
    throw error;
  }
  if (normalizedAction === 'stand') return settleDealer(round);

  round = drawCard(round, 'playerHand');
  const player = scoreBlackjackHand(round.playerHand);
  if (player.bust) return resolved(round, 'loss');
  if (player.total === 21) return settleDealer(round);
  return round;
}

export function projectBlackjackRound(roundInput) {
  if (!roundInput) return null;
  const round = frozenRound(roundInput);
  const active = round.status === 'active';
  const dealerVisible = active ? round.dealerHand.slice(0, 1) : round.dealerHand;
  return Object.freeze({
    id: round.id,
    wager: round.wager,
    currency: 'Gold',
    status: round.status,
    outcome: round.outcome,
    payoutGold: round.payoutGold,
    playerHand: round.playerHand,
    playerScore: scoreBlackjackHand(round.playerHand).total,
    dealerHand: Object.freeze([...dealerVisible]),
    dealerScore: scoreBlackjackHand(dealerVisible).total,
    dealerHiddenCardCount: active ? Math.max(0, round.dealerHand.length - dealerVisible.length) : 0,
    availableActions: Object.freeze(active ? ['hit', 'stand'] : []),
  });
}
