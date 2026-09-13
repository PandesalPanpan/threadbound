import test from 'node:test';
import assert from 'node:assert/strict';
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

test('simulated adventurer safety contract exposes no Honey or human-economy mutation path', () => {
  assert.deepEqual(publicSimulatedAdventurerSafetyContract(), {
    simulationActionFields: ['tickKey', 'scheduledAt', 'actionType', 'experienceAward'],
    simulationActionTypes: ['hunt', 'adventure'],
    honey: 'forbidden',
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

test('repository rejects unsafe reward fields before opening the simulation transaction', () => {
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:' });
  const repository = new SQLiteSimulatedAdventurerRepository({ database: gameRepository.db });
  repository.save(new SimulatedAdventurer({ id: 'bot-rin', name: 'Rin' }), {
    lastSimulatedAt: '2026-09-13T10:00:00.000Z',
  });

  try {
    assert.throws(
      () => repository.applySimulationBatch({
        adventurerId: 'bot-rin',
        expectedLastSimulatedAt: '2026-09-13T10:00:00.000Z',
        cursorAt: '2026-09-13T12:00:00.000Z',
        actions: [validAction({ honeyAward: 50 })],
      }),
      (error) => error.code === 'simulated_adventurer_unsafe_mutation',
    );

    const state = repository.get('bot-rin');
    assert.equal(state.adventurer.experience, 0);
    assert.equal(state.adventurer.huntCount, 0);
    assert.equal(state.lastSimulatedAt, '2026-09-13T10:00:00.000Z');
    assert.deepEqual(repository.listTicks('bot-rin'), []);
  } finally {
    gameRepository.close();
  }
});

test('bot equipment materialization reuses validated Arc equipment rules', () => {
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
});
