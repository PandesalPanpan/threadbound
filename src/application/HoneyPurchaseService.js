export class HoneyPurchaseService {
  constructor({ repository, threadedGateway }) {
    this.repository = repository;
    this.threadedGateway = threadedGateway;
  }

  async purchaseTrainingCache({ playerId, threadedUserId, accessToken, idempotencyKey }) {
    const definition = { id: 'training-cache', itemDefinitionId: 'demo-training-sword', name: 'Demo Training Sword', price: 25 };
    const existing = this.repository.getPurchaseGrant(playerId, idempotencyKey);
    const externalReference = `threadbound:${definition.id}:${idempotencyKey}`;

    const spend = await this.threadedGateway.spendPoints(accessToken, {
      amount: definition.price,
      purpose: 'game:item_purchase',
      externalReference,
      idempotencyKey,
    });

    if (existing && existing.threadedTransactionId !== spend.transaction_id) {
      const error = new Error('The retried purchase did not resolve to the original Threaded transaction.');
      error.code = 'purchase_replay_mismatch';
      throw error;
    }
    if (existing) return { grantApplied: false, grant: existing, spend, definition };

    const item = {
      id: `purchase-${playerId}-${idempotencyKey}`,
      definitionId: definition.itemDefinitionId,
      name: definition.name,
      slot: 'weapon', rarity: 'common', attackBonus: 1, effectCode: 'none',
      effect: { code: 'none', name: 'Plain Weave', description: 'No special combat effect.' },
      source: 'honey-purchase',
    };
    this.repository.addItem(playerId, item);
    const grant = this.repository.recordPurchaseGrant({
      playerId,
      threadedUserId: String(threadedUserId),
      idempotencyKey,
      threadedTransactionId: spend.transaction_id,
      itemInstanceId: item.id,
    });
    return { grantApplied: true, grant, spend, definition, item };
  }
}
