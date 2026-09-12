import { resolveDangerousDeathPenalty } from '../domain/DeathPenaltyPolicy.js';

export class DangerousDeathPenaltyService {
  constructor({ bankRepository, equipmentRepository } = {}) {
    if (!bankRepository) throw new Error('DangerousDeathPenaltyService requires bankRepository.');
    if (!equipmentRepository) throw new Error('DangerousDeathPenaltyService requires equipmentRepository.');
    this.bankRepository = bankRepository;
    this.equipmentRepository = equipmentRepository;
  }

  /**
   * Coordinates an opt-in dangerous-content death penalty from authoritative,
   * already-persisted activity risk evidence. This service does not decide
   * whether an activity is dangerous; the calling activity owns that configured
   * contract and must persist the warning acknowledgement before entry.
   */
  apply({
    playerId,
    config,
    activityId,
    activityStartedAt,
    riskAcknowledgement,
  } = {}) {
    if (!playerId) throw new Error('playerId is required.');

    const balance = this.bankRepository.getBalance(playerId);
    const loadout = this.equipmentRepository.getLoadout(playerId);
    const equippedItems = Object.values(loadout).filter(Boolean);
    const decision = resolveDangerousDeathPenalty({
      carriedGold: balance.carriedGold,
      config,
      activityId,
      activityStartedAt,
      riskAcknowledgement,
      equippedItems,
    });

    if (decision.penaltyType === 'item-loss') {
      const removed = this.equipmentRepository.loseEquippedItem(playerId, decision.itemLoss.id);
      const after = this.bankRepository.getBalance(playerId);
      return Object.freeze({
        ...decision,
        itemLoss: Object.freeze({
          id: removed.item.id,
          name: removed.item.name,
          slot: removed.slot,
        }),
        carriedGold: after.carriedGold,
        bankedGold: after.bankedGold,
      });
    }

    const committed = this.bankRepository.loseCarriedGold(playerId, decision.goldLost);
    return Object.freeze({
      ...decision,
      goldLost: committed.goldLost,
      carriedGold: committed.carriedGold,
      bankedGold: committed.bankedGold,
    });
  }
}
