import test from 'node:test';
import assert from 'node:assert/strict';
import { Town, TOWN_SERVICE_TYPES } from '../src/domain/Town.js';
import { FOUNDATION_TOWNS, townById, townsForArea } from '../src/content/TownCatalog.js';
import { TownService } from '../src/application/TownService.js';
import { AreaProgression } from '../src/domain/AreaProgression.js';
import { SQLiteAreaRepository } from '../src/infrastructure/SQLiteAreaRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

test('Town is an immutable Area-owned hub with constrained service and NPC references', () => {
  const town = new Town({
    id: 'test-town',
    name: 'Test Town',
    areaNumber: 2,
    services: ['shop', 'bank', 'guild_hall'],
    npcIds: ['merchant-one', 'guild-master'],
  });

  assert.deepEqual(town.toJSON(), {
    id: 'test-town',
    name: 'Test Town',
    area: { id: 'area-2', number: 2, name: 'Area 2' },
    areaNumber: 2,
    services: ['shop', 'bank', 'guild_hall'],
    npcIds: ['merchant-one', 'guild-master'],
  });
  assert.equal(town.hasService('bank'), true);
  assert.equal(town.hasService('quest'), false);
  assert.equal(Object.isFrozen(town), true);
  assert.equal(Object.isFrozen(town.services), true);
  assert.ok(TOWN_SERVICE_TYPES.includes('quest'));
});

test('Town rejects invalid Area identity, unsupported services, and duplicate hub references', () => {
  assert.throws(
    () => new Town({ id: 'bad-town', name: 'Bad Town', areaNumber: 0 }),
    /Area number must be an integer of at least 1/i,
  );
  assert.throws(
    () => new Town({ id: 'bad-town', name: 'Bad Town', areaNumber: 1, services: ['teleport'] }),
    /Unsupported Town service/i,
  );
  assert.throws(
    () => new Town({ id: 'bad-town', name: 'Bad Town', areaNumber: 1, services: ['shop', 'shop'] }),
    /must not contain duplicates/i,
  );
  assert.throws(
    () => new Town({ id: 'bad-town', name: 'Bad Town', areaNumber: 1, npcIds: ['mara', 'mara'] }),
    /must not contain duplicates/i,
  );
});

test('foundation Town catalog is neutral, stable, and keyed by Area without adding Arc content', () => {
  assert.equal(FOUNDATION_TOWNS.length, 1);
  assert.equal(townById('area-1-town')?.areaNumber, 1);
  assert.deepEqual(townsForArea(1).map((town) => town.id), ['area-1-town']);
  assert.deepEqual(townsForArea(2), []);
  assert.deepEqual(townsForArea(0), []);
});

function fixture() {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'town-service-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'town-service-user', displayName: 'Town Service Adventurer' });
  const areaRepository = new SQLiteAreaRepository({ database: repository.db });
  const service = new TownService({ repository, areaRepository });
  return { repository, player, areaRepository, service };
}

test('TownService exposes only Town hubs belonging to the authoritative current Area', () => {
  const { repository, player, areaRepository, service } = fixture();
  try {
    const area1 = service.browse(player.id);
    assert.equal(area1.currentArea.id, 'area-1');
    assert.deepEqual(area1.towns.map((town) => town.id), ['area-1-town']);
    assert.equal(service.get(player.id, 'area-1-town').areaNumber, 1);

    areaRepository.save(player.id, new AreaProgression().withHighestUnlockedArea(2).withCurrentArea(2));
    const area2 = service.browse(player.id);
    assert.equal(area2.currentArea.id, 'area-2');
    assert.deepEqual(area2.towns, []);
    assert.throws(
      () => service.get(player.id, 'area-1-town'),
      (error) => error.code === 'town_unavailable' && /current Area/i.test(error.message),
    );
  } finally {
    repository.close();
  }
});
