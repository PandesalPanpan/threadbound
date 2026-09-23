import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/application/EventBus.js';
import { SimpleDungeonService } from '../src/application/SimpleDungeonService.js';
import { SQLiteEquipmentRepository } from '../src/infrastructure/SQLiteEquipmentRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function equipmentItem(id, slot, stats) {
  return {
    id,
    definitionId: id,
    name: id,
    slot,
    rarity: 'common',
    attackBonus: Number(stats.attackBonus || 0),
    effectCode: 'none',
    effect: {
      code: 'none',
      equipmentTemplate: { effectCodes: ['none'], stats },
    },
    source: 'test',
  };
}

test('simple Dungeon readiness and start use effective equipped Max HP', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'dungeon-health-player' });
  try {
    const player = repository.getOrCreatePlayer({ threadedUserId: 'dungeon-health-user', displayName: 'Adventurer' });
    const equipmentRepository = new SQLiteEquipmentRepository({ database: repository.db });
    repository.addItem(player.id, equipmentItem('dungeon-health-weapon', 'weapon', { attackBonus: 3 }));
    repository.addItem(player.id, equipmentItem('dungeon-health-armor', 'armor', { maxHpBonus: 8 }));
    equipmentRepository.equip(player.id, 'dungeon-health-weapon');
    equipmentRepository.equip(player.id, 'dungeon-health-armor');
    repository.setPlayerHealth(player.id, 45);

    const service = new SimpleDungeonService({ repository, eventBus: new EventBus(), equipmentRepository });
    const readiness = service.readiness(player.id, 'frayed-hollow');
    assert.equal(readiness.members[0].attackPower, 9);
    assert.equal(readiness.members[0].maxHealth, 48);
    assert.equal(readiness.members[0].currentHealth, 45);
    assert.equal(readiness.members[0].ready, true);

    const run = service.startDungeon(player.id, 'frayed-hollow');
    assert.equal(run.participants[0].maxHp, 48);
    assert.equal(run.participants[0].hp, 45);
    assert.equal(repository.getPlayer(player.id).maxHealth, 48);
    assert.equal(repository.getPlayer(player.id).currentHealth, 45);
  } finally {
    repository.close();
  }
});
