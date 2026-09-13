import test from 'node:test';
import assert from 'node:assert/strict';
import { HoneyPurchaseService } from '../src/application/HoneyPurchaseService.js';

test('Honey purchases delegate the wallet mutation to Threaded and persist only the resulting grant', async () => {
  const calls = [];
  const repository = {
    getPlayer(playerId) {
      return { id: playerId, threadedUserId: 'threaded-user-1', displayName: 'Human Adventurer' };
    },
    getPurchaseGrant() { return null; },
    addItem(playerId, item) { calls.push({ type: 'item', playerId, item }); },
    recordPurchaseGrant(grant) {
      calls.push({ type: 'grant', grant });
      return {
        created: true,
        grant: {
          ...grant,
          threadedTransactionId: grant.threadedTransactionId,
          itemInstanceId: grant.itemInstanceId,
        },
      };
    },
  };
  const threadedGateway = {
    async spendPoints(accessToken, request) {
      calls.push({ type: 'threaded-spend', accessToken, request });
      return { transaction_id: 'threaded-tx-1', balance: 75 };
    },
  };
  const service = new HoneyPurchaseService({ repository, threadedGateway });

  const result = await service.purchaseTrainingCache({
    playerId: 'player-1',
    threadedUserId: 'threaded-user-1',
    accessToken: 'threaded-token',
    idempotencyKey: 'purchase-key-123',
  });

  const spend = calls.find((call) => call.type === 'threaded-spend');
  assert.deepEqual(spend, {
    type: 'threaded-spend',
    accessToken: 'threaded-token',
    request: {
      amount: 25,
      purpose: 'game:item_purchase',
      externalReference: 'threadbound:training-cache:purchase-key-123',
      idempotencyKey: 'purchase-key-123',
    },
  });
  assert.equal(result.spend.balance, 75);
  assert.equal(result.grantApplied, true);

  const grant = calls.find((call) => call.type === 'grant');
  assert.equal(grant.grant.threadedTransactionId, 'threaded-tx-1');
  assert.equal(grant.grant.playerId, 'player-1');
  assert.equal(grant.grant.threadedUserId, 'threaded-user-1');

  // Threadbound records the externally-authorized transaction and awarded item only.
  // There is deliberately no repository Honey balance read/write in this use case.
  assert.deepEqual(calls.map((call) => call.type), ['threaded-spend', 'item', 'grant']);
});

test('Honey purchase fails before Threaded spend when authenticated identity does not match the persisted human', async () => {
  let gatewayCalls = 0;
  const repository = {
    getPlayer() {
      return { id: 'player-1', threadedUserId: 'threaded-user-1', displayName: 'Human Adventurer' };
    },
  };
  const threadedGateway = {
    async spendPoints() {
      gatewayCalls += 1;
      return { transaction_id: 'must-not-happen' };
    },
  };
  const service = new HoneyPurchaseService({ repository, threadedGateway });

  await assert.rejects(
    service.purchaseTrainingCache({
      playerId: 'player-1',
      threadedUserId: 'another-threaded-user',
      accessToken: 'threaded-token',
      idempotencyKey: 'identity-mismatch',
    }),
    (error) => error.code === 'honey_identity_mismatch',
  );
  assert.equal(gatewayCalls, 0);
});
