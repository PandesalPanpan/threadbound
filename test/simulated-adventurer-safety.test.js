import test from 'node:test';
import assert from 'node:assert/strict';
import { HoneyPurchaseService } from '../src/application/HoneyPurchaseService.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { SQLiteSimulatedAdventurerRepository } from '../src/infrastructure/SQLiteSimulatedAdventurerRepository.js';
import { SimulatedAdventurer } from '../src/domain/SimulatedAdventurer.js';
import {
  assertSafeSimulatedAdventurerSimulationActions,
  assertSimulatedAdventurerMutationTarget,
  forbidSimulatedAdventurerHoneyMutation,
  materializeValidatedSimulatedAdventurerEquipment,
  publicSimulatedAdventurerSafetyContract,
} from '../src/domain/SimulatedAdventurerSafetyPolicy.js';

function validAction(overrides = {}) {
  return {
    tickKey: 'dedicated:42',
    bucket: 42,
    scheduledAt: '2026-09-13T12:00:00.000Z',
    actionType: 'hunt',
    experienceAward: 12,
    ...overrides,
  };
}

function validTemplate(overrides = {}) {
  return {
    id: 'bot-steel-sword',
    namePattern: 'Steel Sword',
    slot: 'weapon',
    rarity: 'common',
    attackBonus: 2,
    stats: {
      attackBonus: 2,
      defenseBonus: 0,
      maxHpBonus: 0,
      speedBonus: 0,
      critChanceBonus: 0,
    },
    effects: ['none'],
    requiredLevel: 1,
    areaNumber: 1,
    visualAssetId: 'equipment.weapon.basic-sword',
    ...overrides,
  };
}

test('simulated adventurer safety contract exposes no bot Honey or human-economy mutation path', () => {
  assert.deepEqual(publicSimulatedAdventurerSafetyContract(), {
    simulationActionFields: ['tickKey', 'bucket', 'scheduledAt', 'actionType', 'experienceAward'],
    simulationActionTypes: ['hunt', 'adventure'],
    honey: 'human-only-external-threaded-wallet',
    mutationTarget: 'self-simulated-only',
    equipmentSource: 'extended-validated-arc-equipment-template',
  });

  assert.throws(
    () => forbidSimulatedAdventurerHoneyMutation(),
    (error) => error.code === 'simulated_adventurer_honey_forbidden',
  );
  assert.equal(assertSimulatedAdventurerMutationTarget({
    adventurerId: 'bot-rin',
    targetId: 'bot-rin',
    targetKind: 'simulated',
  }), true);
  assert.throws(
    () => assertSimulatedAdventurerMutationTarget({
      adventurerId: 'bot-rin',
      targetId: 'human-a',
      targetKind: 'human',
    }),
    (error) => error.code === 'simulated_adventurer_human_economy_forbidden',
  );
});

test('simulation actions fail closed on Gold, Honey, item, or target mutation fields', () => {
  assert.doesNotThrow(() => assertSafeSimulatedAdventurerSimulationActions([validAction()]));

  for (const unsafe of [
    { goldAward: 10 },
    { honeyAward: 1 },
    { itemGrant: { id: 'forged-item' } },
    { targetPlayerId: 'human-a' },
  ]) {
    assert.throws(
      () => assertSafeSimulatedAdventurerSimulationActions([validAction(unsafe)]),
      (error) => error.code === 'simulated_adventurer_unsafe_mutation',
    );
  }
});

test('repository rejects unsafe bot rewards before changing bot or human economy state', () => {
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'human-a' });
  const human = gameRepository.getOrCreatePlayer({ threadedUserId: 'human-threaded', displayName: 'Human A' });
  gameRepository.addThreadDust(human.id, 25);
  const repository = new SQLiteSimulatedAdventurerRepository({ database: gameRepository.db });
  repository.save(new SimulatedAdventurer({ id: 'bot-rin', name: 'Rin' }), {
    lastSimulatedAt: '2026-09-13T10:00:00.000Z',
  });

  try {
    for (const unsafe of [
      { goldAward: 50 },
      { honeyAward: 50 },
      { itemGrant: { id: 'forged-item' } },
      { targetPlayerId: human.id },
    ]) {
      assert.throws(
        () => repository.applySimulationBatch({
          adventurerId: 'bot-rin',
          expectedLastSimulatedAt: '2026-09-13T10:00:00.000Z',
          cursorAt: '2026-09-13T12:00:00.000Z',
          actions: [validAction(unsafe)],
        }),
        (error) => error.code === 'simulated_adventurer_unsafe_mutation',
      );
    }

    const state = repository.get('bot-rin');
    assert.equal(state.adventurer.experience, 0);
    assert.equal(state.adventurer.huntCount, 0);
    assert.equal(state.lastSimulatedAt, '2026-09-13T10:00:00.000Z');
    assert.deepEqual(repository.listTicks('bot-rin'), []);
    assert.equal(gameRepository.getPlayer(human.id).threadDust, 25);
    assert.deepEqual(gameRepository.listItems(human.id), []);
  } finally {
    gameRepository.close();
  }
});

test('simulated adventurer IDs cannot reach the external Honey gateway', async () => {
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:' });
  const repository = new SQLiteSimulatedAdventurerRepository({ database: gameRepository.db });
  repository.save(new SimulatedAdventurer({ id: 'bot-rin', name: 'Rin' }));
  let gatewayCalls = 0;
  const service = new HoneyPurchaseService({
    repository: gameRepository,
    threadedGateway: {
      async spendPoints() {
        gatewayCalls += 1;
        return { transaction_id: 'must-not-happen' };
      },
    },
  });

  try {
    await assert.rejects(
      service.purchaseTrainingCache({
        playerId: 'bot-rin',
        threadedUserId: 'bot-rin',
        accessToken: 'not-a-human-token',
        idempotencyKey: 'bot-honey-attempt',
      }),
      (error) => error.code === 'simulated_adventurer_honey_forbidden',
    );
    assert.equal(gatewayCalls, 0);
    assert.deepEqual(gameRepository.listItems('bot-rin'), []);
  } finally {
    gameRepository.close();
  }
});

test('bot equipment persistence accepts canonical Arc materialization and rejects forged snapshots', () => {
  const item = materializeValidatedSimulatedAdventurerEquipment({
    template: validTemplate(),
    itemId: 'bot-rin:steel-sword:1',
    name: 'Rin’s Steel Sword',
  });

  assert.deepEqual(item, {
    id: 'bot-rin:steel-sword:1',
    templateId: 'bot-steel-sword',
    name: 'Rin’s Steel Sword',
    slot: 'weapon',
    rarity: 'common',
    attackBonus: 2,
    defenseBonus: 0,
    maxHpBonus: 0,
    speedBonus: 0,
    critChanceBonus: 0,
    effects: ['none'],
    requiredLevel: 1,
    areaNumber: 1,
    visualAssetId: 'equipment.weapon.basic-sword',
  });

  assert.throws(
    () => materializeValidatedSimulatedAdventurerEquipment({
      template: validTemplate({
        attackBonus: 999,
        stats: {
          attackBonus: 999,
          defenseBonus: 0,
          maxHpBonus: 0,
          speedBonus: 0,
          critChanceBonus: 0,
        },
      }),
      itemId: 'forged',
      name: 'Forged',
    }),
    (error) => error.code === 'simulated_adventurer_invalid_item',
  );

  assert.throws(
    () => materializeValidatedSimulatedAdventurerEquipment({
      template: { id: 'legacy', rarity: 'common', attackBonus: 1, effects: ['none'] },
      itemId: 'legacy-item',
      name: 'Legacy Item',
    }),
    (error) => error.code === 'simulated_adventurer_invalid_item',
  );

  const gameRepository = new SQLiteGameRepository({ filename: ':memory:' });
  const repository = new SQLiteSimulatedAdventurerRepository({ database: gameRepository.db });
  try {
    const saved = repository.save(new SimulatedAdventurer({
      id: 'bot-rin',
      name: 'Rin',
      equipment: { weapon: item },
    }));
    assert.equal(saved.adventurer.equipment.weapon.templateId, 'bot-steel-sword');
    assert.equal(saved.adventurer.stats.attack, 8);

    assert.throws(
      () => repository.save(new SimulatedAdventurer({
        id: 'bot-forged',
        name: 'Forged',
        equipment: {
          weapon: { id: 'forged-item', slot: 'weapon', rarity: 'mythic', attackBonus: 999 },
        },
      })),
      (error) => error.code === 'simulated_adventurer_invalid_item',
    );
    assert.equal(repository.get('bot-forged'), null);
  } finally {
    gameRepository.close();
  }
});
