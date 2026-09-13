import { createHash, randomUUID } from 'node:crypto';
import {
  normalizeSlotsWager,
  projectSlotsSpin,
  resolveSlotsSpin,
} from '../domain/SlotsPolicy.js';
import { SQLiteSlotsRepository } from '../infrastructure/SQLiteSlotsRepository.js';

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

function responseFor({ spin, carriedGold }) {
  return Object.freeze({
    spin: projectSlotsSpin(spin),
    carriedGold,
    currency: 'Gold',
  });
}

/**
 * Application boundary for Gold-only Slots.
 *
 * M9-03 deliberately stops at authoritative game/economy behavior. Rich chat-card
 * presentation and public receipts are added later by M9-04. The repository owns
 * wager/payout transactions and idempotent command replay; this service owns use-
 * case coordination and delegates reel/outcome rules to SlotsPolicy.
 */
export class SlotsService {
  constructor({
    repository,
    slotsRepository = null,
    random = Math.random,
    idFactory = randomUUID,
  } = {}) {
    if (!repository) throw new Error('SlotsService requires the game repository.');
    if (typeof random !== 'function') throw new Error('SlotsService random source must be a function.');
    if (typeof idFactory !== 'function') throw new Error('SlotsService idFactory must be a function.');
    this.repository = repository;
    this.slotsRepository = slotsRepository || new SQLiteSlotsRepository({ database: repository.db });
    this.random = random;
    this.idFactory = idFactory;
  }

  spin(playerId, wager, { idempotencyKey } = {}) {
    const amount = normalizeSlotsWager(wager);
    const key = normalizeIdempotencyKey(idempotencyKey);
    const spin = resolveSlotsSpin({
      id: String(this.idFactory()),
      playerId,
      wager: amount,
      random: this.random,
    });
    const result = this.slotsRepository.settle({
      playerId,
      idempotencyKey: key,
      fingerprint: fingerprint({ action: 'spin', wager: amount }),
      spin,
      responseFactory: responseFor,
    });
    return Object.freeze({ ...result.response, replayed: result.replayed });
  }
}

export { normalizeIdempotencyKey as normalizeSlotsIdempotencyKey };
