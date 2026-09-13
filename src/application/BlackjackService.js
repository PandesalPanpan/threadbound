import { createHash, randomUUID } from 'node:crypto';
import {
  applyBlackjackAction,
  normalizeBlackjackWager,
  projectBlackjackRound,
  shuffleBlackjackDeck,
  startBlackjackRound,
} from '../domain/BlackjackPolicy.js';
import { SQLiteBlackjackRepository } from '../infrastructure/SQLiteBlackjackRepository.js';

function normalizeIdempotencyKey(value) {
  const key = String(value || '').trim();
  if (key.length < 8 || key.length > 128) {
    const error = new Error('Idempotency-Key must be between 8 and 128 characters.');
    error.code = 'invalid_idempotency_key';
    throw error;
  }
  return key;
}

function fingerprint(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function responseFor({ round, carriedGold }) {
  return Object.freeze({
    round: projectBlackjackRound(round),
    carriedGold,
    currency: 'Gold',
  });
}

/**
 * Application boundary for Gold-only Blackjack.
 *
 * M9-01 deliberately stops at authoritative game/economy behavior. Rich chat-card
 * presentation and public receipts are added later by M9-04. The repository owns
 * wager/payout transactions and idempotent command replay; this service owns use-
 * case coordination and delegates card rules to BlackjackPolicy.
 */
export class BlackjackService {
  constructor({
    repository,
    blackjackRepository = null,
    random = Math.random,
    idFactory = randomUUID,
    deckFactory = ({ random: source }) => shuffleBlackjackDeck({ random: source }),
  } = {}) {
    if (!repository) throw new Error('BlackjackService requires the game repository.');
    if (typeof random !== 'function') throw new Error('BlackjackService random source must be a function.');
    if (typeof idFactory !== 'function') throw new Error('BlackjackService idFactory must be a function.');
    if (typeof deckFactory !== 'function') throw new Error('BlackjackService deckFactory must be a function.');
    this.repository = repository;
    this.blackjackRepository = blackjackRepository || new SQLiteBlackjackRepository({ database: repository.db });
    this.random = random;
    this.idFactory = idFactory;
    this.deckFactory = deckFactory;
  }

  browse(playerId) {
    return Object.freeze({
      round: projectBlackjackRound(this.blackjackRepository.getActiveRound(playerId)),
      carriedGold: this.blackjackRepository.carriedGold(playerId),
      currency: 'Gold',
    });
  }

  start(playerId, wager, { idempotencyKey } = {}) {
    const amount = normalizeBlackjackWager(wager);
    const key = normalizeIdempotencyKey(idempotencyKey);
    const deck = this.deckFactory({ random: this.random });
    const round = startBlackjackRound({
      id: String(this.idFactory()),
      playerId,
      wager: amount,
      deck,
    });
    const result = this.blackjackRepository.startRound({
      playerId,
      idempotencyKey: key,
      fingerprint: fingerprint({ action: 'start', wager: amount }),
      round,
      responseFactory: responseFor,
    });
    return Object.freeze({ ...result.response, replayed: result.replayed });
  }

  hit(playerId, roundId, { idempotencyKey } = {}) {
    return this.#act(playerId, roundId, 'hit', idempotencyKey);
  }

  stand(playerId, roundId, { idempotencyKey } = {}) {
    return this.#act(playerId, roundId, 'stand', idempotencyKey);
  }

  #act(playerId, roundId, action, idempotencyKey) {
    const targetRoundId = String(roundId || '').trim();
    if (!targetRoundId) {
      const error = new Error('Blackjack round id is required.');
      error.code = 'blackjack_round_not_found';
      throw error;
    }
    const key = normalizeIdempotencyKey(idempotencyKey);
    const result = this.blackjackRepository.applyAction({
      playerId,
      roundId: targetRoundId,
      action,
      idempotencyKey: key,
      fingerprint: fingerprint({ action, roundId: targetRoundId }),
      resolveRound: (round) => applyBlackjackAction(round, action),
      responseFactory: responseFor,
    });
    return Object.freeze({ ...result.response, replayed: result.replayed });
  }
}

export { normalizeIdempotencyKey as normalizeBlackjackIdempotencyKey };
