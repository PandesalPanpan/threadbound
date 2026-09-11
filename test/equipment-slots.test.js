import test from 'node:test';
import assert from 'node:assert/strict';
import { EQUIPMENT_SLOTS, normalizeEquipmentSlot, publicEquipmentSlots } from '../src/domain/EquipmentSlotPolicy.js';
import { AdventureRun } from '../src/domain/AdventureRun.js';
import { SQLiteEquipmentRepository } from '../src/infrastructure/SQLiteEquipmentRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function equipment(id, slot, attackBonus = 1) {
  return {
    id,
    definitionId: `def-${id}`,
    name: `${slot} ${id}`,
    slot,
    rarity: 'common',
    attackBonus,
    effectCode: 'none',
    effect: { code: 'none', name: 'Plain', description: 'Test item.', upgradeLevel: 0, attunementCode: null },
    source: 'test',
  };
}

test('equipment slot policy exposes exactly the familiar five-slot contract', () => {
  assert.deepEqual(EQUIPMENT_SLOTS, ['weapon', 'helmet', 'armor', 'boots', 'accessory']);
  assert.deepEqual(publicEquipmentSlots().map((slot) => slot.label), ['Weapon', 'Helmet', 'Armor', 'Boots', 'Accessory']);
  assert.equal(normalizeEquipmentSlot(' Helmet '), 'helmet');
  assert.throws(() => normalizeEquipmentSlot('relic'), (error) => error.code === 'invalid_equipment_slot');
});

test('per-slot loadout persists one item per slot while preserving the legacy Weapon pointer', () => {
  const game = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'p1' });
  const player = game.getOrCreatePlayer({ threadedUserId: 'u1', displayName: 'Adventurer' });
  for (const slot of EQUIPMENT_SLOTS) game.addItem(player.id, equipment(slot, slot));
  game.addItem(player.id, equipment('helmet-2', 'helmet', 2));
  const repository = new SQLiteEquipmentRepository({ database: game.db });

  for (const slot of EQUIPMENT_SLOTS) repository.equip(player.id, slot);
  let loadout = repository.getLoadout(player.id);
  assert.deepEqual(Object.keys(loadout), EQUIPMENT_SLOTS);
  for (const slot of EQUIPMENT_SLOTS) assert.equal(loadout[slot]?.id, slot);
  assert.equal(game.getPlayer(player.id).equippedItemId, 'weapon');

  repository.equip(player.id, 'helmet-2');
  loadout = repository.getLoadout(player.id);
  assert.equal(loadout.helmet.id, 'helmet-2');
  assert.equal(loadout.weapon.id, 'weapon');
  assert.equal(repository.isEquipped(player.id, 'helmet'), false);
  assert.equal(repository.isEquipped(player.id, 'helmet-2'), true);
  game.close();
});

test('legacy equipped Weapon migrates into the new loadout and active runs still lock equipment changes', () => {
  const game = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'p1' });
  const player = game.getOrCreatePlayer({ threadedUserId: 'u1', displayName: 'Adventurer' });
  game.addItem(player.id, equipment('legacy-weapon', 'weapon', 3));
  game.addItem(player.id, equipment('helmet', 'helmet'));
  game.equipItem(player.id, 'legacy-weapon');

  const repository = new SQLiteEquipmentRepository({ database: game.db });
  assert.equal(repository.getLoadout(player.id).weapon.id, 'legacy-weapon');

  const run = AdventureRun.start({
    id: 'slot-run',
    ownerType: 'player',
    ownerId: player.id,
    startedByPlayerId: player.id,
    participants: [{ playerId: player.id, maxHealth: 40 }],
    dungeonId: 'frayed-hollow',
  });
  game.createRun(run.toJSON());
  assert.throws(() => repository.equip(player.id, 'helmet'), (error) => error.code === 'item_equip_during_run');
  assert.equal(repository.getLoadout(player.id).helmet, null);
  game.close();
});
