import test from 'node:test';
import assert from 'node:assert/strict';
import { GameService } from '../src/application/GameService.js';
import { EQUIPMENT_SLOTS } from '../src/domain/EquipmentSlotPolicy.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function item(id, slot, attackBonus = 1) {
  return {
    id,
    definitionId: `definition-${id}`,
    name: `${slot} ${id}`,
    slot,
    rarity: 'common',
    attackBonus,
    effectCode: 'none',
    effect: {
      code: 'none',
      name: 'Plain',
      description: 'Integration test equipment.',
      upgradeLevel: 0,
      attunementCode: null,
    },
    source: 'test',
  };
}

test('GameService projects five-slot equipment and canonical readable stats while preserving compatibility aliases', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-1' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'u1', displayName: 'Adventurer' });
  for (const slot of EQUIPMENT_SLOTS) repository.addItem(player.id, item(`item-${slot}`, slot, slot === 'weapon' ? 3 : 1));

  const events = [];
  const service = new GameService({
    repository,
    eventBus: {
      publish(event) { events.push(event); },
      publishAll(published) { events.push(...published); },
    },
  });

  const initial = service.dashboard(player.id);
  assert.deepEqual(Object.keys(initial.character.equipment), EQUIPMENT_SLOTS);
  for (const slot of EQUIPMENT_SLOTS) assert.equal(initial.character.equipment[slot], null);
  assert.equal(initial.character.equippedItem, null);
  assert.deepEqual(initial.character.stats, {
    attack: 6,
    defense: 2,
    maxHp: 40,
    speed: 10,
    critChance: 0.05,
    critChancePercent: 5,
  });
  assert.equal(initial.character.attackPower, initial.character.stats.attack);
  assert.equal(initial.character.maxHealth, initial.character.stats.maxHp);

  service.equipItem(player.id, 'item-helmet');
  let dashboard = service.dashboard(player.id);
  assert.equal(dashboard.character.equipment.helmet.id, 'item-helmet');
  assert.equal(dashboard.character.equipment.weapon, null);
  assert.equal(dashboard.character.equippedItem, null);
  assert.equal(repository.getPlayer(player.id).equippedItemId, null, 'non-Weapon slots must not overload the legacy pointer');
  assert.equal(dashboard.character.stats.attack, 6, 'non-Weapon legacy attackBonus does not silently change Attack');

  service.equipItem(player.id, 'item-weapon');
  dashboard = service.dashboard(player.id);
  assert.equal(dashboard.character.equipment.weapon.id, 'item-weapon');
  assert.equal(dashboard.character.equipment.helmet.id, 'item-helmet');
  assert.equal(dashboard.character.equippedItem.id, 'item-weapon', 'legacy alias remains the equipped Weapon');
  assert.equal(repository.getPlayer(player.id).equippedItemId, 'item-weapon');
  assert.equal(dashboard.character.stats.attack, dashboard.character.baseAttack + 3);
  assert.equal(dashboard.character.attack, dashboard.character.stats.attack);
  assert.equal(dashboard.character.attackPower, dashboard.character.stats.attack, 'legacy attackPower alias follows the canonical policy');
  assert.equal(dashboard.character.defense, 2);
  assert.equal(dashboard.character.maxHp, 40);
  assert.equal(dashboard.character.maxHealth, dashboard.character.maxHp, 'legacy maxHealth alias follows the canonical policy');
  assert.equal(dashboard.character.speed, 10);
  assert.equal(dashboard.character.critChance, 0.05);
  assert.equal(dashboard.character.critChancePercent, 5);

  assert.deepEqual(
    events.filter((event) => event.type === 'ItemEquipped').map(({ itemId, slot }) => ({ itemId, slot })),
    [
      { itemId: 'item-helmet', slot: 'helmet' },
      { itemId: 'item-weapon', slot: 'weapon' },
    ],
  );
  repository.close();
});
