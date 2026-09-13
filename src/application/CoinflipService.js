import { createHash, randomUUID } from 'node:crypto';
import {
  normalizeCoinflipChoice,
  normalizeCoinflipWager,
  projectCoinflip,
  resolveCoinflip,
} from '../domain/CoinflipPolicy.js';
import { SQLiteCoinflipRepository } from '../infrastructure/SQLiteCoinflipRepository.js';

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

function responseFor({ flip, carriedGold }) {
  return Object.freeze({
    flip: projectCoinflip(flip),
    carriedGold,
    currency: 'Gold',
  });
}

/**
 * Application boundary for Gold-only Coinflip.
 *
 * M9-02 deliberately stops at authoritative game/economy behavior. Rich chat-card
 * presentation and public receipts are added later by M9-04. The repository owns
 * wager/payout transactions and idempotent command replay; this service owns use-
 * case coordination and delegates outcome rules to CoinflipPolicy.
 */
export class CoinflipService {
  constructor({
    repository,
    coinflipRepository = null,
    random = Math.random,
    idFactory = randomUUID,
  } = {}) {
    if (!repository) throw new Error('CoinflipService requires the game repository.');
    if (typeof random !== 'function') throw new Error('CoinflipService random source must be a function.');
    if (typeof idFactory !== 'function') throw new Error('CoinflipService idFactory must be a function.');
    this.repository = repository;
    this.coinflipRepository = coinflipRepository || new SQLiteCoinflipRepository({ database: repository.db });
    this.random = random;
    this.idFactory = idFactory;
  }

  flip(playerId, wager, choice, { idempotencyKey } = {}) {
    const amount = normalizeCoinflipWager(wager);
    const selected = normalizeCoinflipChoice(choice);
    const key = normalizeIdempotencyKey(idempotencyKey);
    const flip = resolveCoinflip({
      id: String(this.idFactory()),
      playerId,
      wager: amount,
      choice: selected,
      random: this.random,
    });
    const result = this.coinflipRepository.settle({
      playerId,
      idempotencyKey: key,
      fingerprint: fingerprint({ action: 'flip', wager: amount, choice: selected }),
      flip,
      responseFactory: responseFor,
    });
    return Object.freeze({ ...result.response, replayed: result.replayed });
  }
}

export { normalizeIdempotencyKey as normalizeCoinflipIdempotencyKey };
