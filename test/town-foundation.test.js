import test from 'node:test';
import assert from 'node:assert/strict';
import { Town, TOWN_SERVICE_TYPES } from '../src/domain/Town.js';
import { FOUNDATION_NPCS, FOUNDATION_TOWNS, npcById, projectTown, townById, townsForArea } from '../src/content/TownCatalog.js';
import { TownService } from '../src/application/TownService.js';
import { AreaService } from '../src/application/AreaService.js';
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

test('foundation Town catalog stays neutral while projecting stable generated-sprite NPC identities', () => {
  assert.equal(FOUNDATION_TOWNS.length, 1);
  assert.equal(FOUNDATION_NPCS.length, 4);
  assert.equal(townById('area-1-town')?.areaNumber, 1);
  assert.deepEqual(townsForArea(1).map((town) => town.id), ['area-1-town']);
  assert.deepEqual(townsForArea(2), []);
  assert.deepEqual(townsForArea(0), []);
  assert.equal(npcById('area-1-shopkeeper')?.service, 'shop');
  assert.match(npcById('area-1-shopkeeper')?.dialogue || '', /supplies/i);
  const projected = projectTown(townById('area-1-town'));
  assert.deepEqual(projected.npcs.map((npc) => npc.id), FOUNDATION_NPCS.map((npc) => npc.id));
  assert.ok(projected.npcs.every((npc) => ['male', 'female'].includes(npc.spriteVariant)));
  assert.ok(projected.npcs.every((npc) => typeof npc.dialogue === 'string' && npc.dialogue.length > 0));
});

function fixture({ eventBus = null } = {}) {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'town-service-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'town-service-user', displayName: 'Town Service Adventurer' });
  const areaRepository = new SQLiteAreaRepository({ database: repository.db });
  const service = new TownService({ repository, eventBus, areaRepository });
  return { repository, player, areaRepository, service };
}

test('TownService exposes only Town hubs and NPC read models belonging to the authoritative current Area', () => {
  const { repository, player, areaRepository, service } = fixture();
  try {
    const area1 = service.browse(player.id);
    assert.equal(area1.currentArea.id, 'area-1');
    assert.deepEqual(area1.towns.map((town) => town.id), ['area-1-town']);
    assert.equal(area1.towns[0].npcs.length, 4);
    assert.equal(service.get(player.id, 'area-1-town').npcs[0].id, 'area-1-shopkeeper');

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

test('TownService interaction validates current Town residency and publishes one concise NPC event', () => {
  const events = [];
  const { repository, player, areaRepository, service } = fixture({ eventBus: { publish: (event) => events.push(event) } });
  try {
    const interaction = service.interact(player.id, 'area-1-town', 'area-1-shopkeeper');
    assert.deepEqual(interaction, {
      townId: 'area-1-town',
      townName: 'Area 1 Town',
      areaNumber: 1,
      npcId: 'area-1-shopkeeper',
      npcName: 'Shopkeeper',
      role: 'Shop',
      service: 'shop',
      dialogue: 'Need supplies? I keep the essentials close and the prices clear.',
    });
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], { type: 'NpcInteracted', playerId: player.id, ...interaction });

    assert.throws(
      () => service.interact(player.id, 'area-1-town', 'not-a-resident'),
      (error) => error.code === 'npc_unavailable',
    );
    assert.equal(events.length, 1);

    areaRepository.save(player.id, new AreaProgression().withHighestUnlockedArea(2).withCurrentArea(2));
    assert.throws(
      () => service.interact(player.id, 'area-1-town', 'area-1-shopkeeper'),
      (error) => error.code === 'town_unavailable',
    );
    assert.equal(events.length, 1);
  } finally {
    repository.close();
  }
});

test('AreaService composes the current-Area Town read projection without moving Town rules into the browser', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'area-town-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'area-town-user', displayName: 'Area Town Adventurer' });
  const areaRepository = new SQLiteAreaRepository({ database: repository.db });
  const service = new AreaService({ repository, eventBus: { publish() {} }, areaRepository });
  try {
    const area1 = service.browse(player.id);
    assert.deepEqual(area1.towns.map((town) => town.id), ['area-1-town']);
    assert.deepEqual(area1.towns[0].npcs.map((npc) => npc.service), ['shop', 'upgrade', 'bank', 'heal']);

    areaRepository.save(player.id, new AreaProgression().withHighestUnlockedArea(2).withCurrentArea(2));
    assert.deepEqual(service.browse(player.id).towns, []);
  } finally {
    repository.close();
  }
});
