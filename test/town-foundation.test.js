import test from 'node:test';
import assert from 'node:assert/strict';
import { Town, TOWN_SERVICE_TYPES } from '../src/domain/Town.js';
import { AREA_TOWNS, FOUNDATION_NPCS, FOUNDATION_TOWNS, WORLD_NPCS, npcById, projectTown, townById, townsForArea } from '../src/content/TownCatalog.js';
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
    area: { id: 'area-2', number: 2, name: 'Emberglass Orchard' },
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

test('world Town catalog exposes four Area hubs and stable generated-sprite NPC identities', () => {
  assert.equal(FOUNDATION_TOWNS.length, 1);
  assert.equal(AREA_TOWNS.length, 3);
  assert.equal(WORLD_NPCS.length, 18);
  assert.equal(FOUNDATION_NPCS.length, 5);
  assert.equal(townById('area-1-town')?.areaNumber, 1);
  assert.deepEqual(townsForArea(1).map((town) => town.id), ['area-1-town']);
  assert.deepEqual(townsForArea(2).map((town) => town.id), ['area-2-town']);
  assert.deepEqual(townsForArea(3).map((town) => town.id), ['area-3-town']);
  assert.deepEqual(townsForArea(4).map((town) => town.id), ['area-4-town']);
  assert.deepEqual(townsForArea(0), []);
  assert.equal(npcById('area-1-shopkeeper')?.service, 'shop');
  assert.match(npcById('area-1-shopkeeper')?.dialogue || '', /supplies/i);
  assert.equal(npcById('mae-bramble')?.kind, 'background');
  assert.equal(npcById('mae-bramble')?.service, 'quest');
  const projected = projectTown(townById('area-1-town'));
  assert.deepEqual(projected.npcs.map((npc) => npc.id), FOUNDATION_NPCS.map((npc) => npc.id));
  assert.ok(projected.npcs.every((npc) => ['male', 'female'].includes(npc.spriteVariant)));
  assert.ok(projected.npcs.every((npc) => typeof npc.dialogue === 'string' && npc.dialogue.length > 0));
});

test('background NPC dialogue uses the current Area context and the same authorized receipt path', () => {
  const events = [];
  const { repository, player, areaRepository, service } = fixture({ eventBus: { publish: (event) => events.push(event) } });
  try {
    areaRepository.save(player.id, new AreaProgression({ currentAreaNumber: 3, highestUnlockedAreaNumber: 3 }));
    const npc = npcById('rook-gale');
    const interaction = service.interact(player.id, 'area-3-town', 'rook-gale');
    assert.equal(interaction.townName, 'Kitewatch');
    assert.equal(interaction.npcName, 'Rook Gale');
    assert.ok(npc.dialogueByContext.frontier.includes(interaction.dialogue));
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], { type: 'NpcInteracted', playerId: player.id, ...interaction });
    assert.throws(() => service.interact(player.id, 'area-2-town', 'rook-gale'), (error) => error.code === 'town_unavailable');
    assert.throws(() => service.interact(player.id, 'area-3-town', 'area-1-shopkeeper'), (error) => error.code === 'npc_unavailable');
    assert.equal(events.length, 1);
  } finally {
    repository.close();
  }
});

test('Mae uses authored dialogue for the player’s accepted and claimed Quest history', () => {
  const { repository, player, areaRepository } = fixture({ eventBus: { publish() {} } });
  try {
    const mae = npcById('mae-bramble');
    const maeQuest = {
      id: 'welcome-to-bellbloom',
      areaNumber: 1,
      townId: 'area-1-town',
      npcId: 'mae-bramble',
      objectives: [{ id: 'speak-to-mae', type: 'speak', targetId: 'mae-bramble' }],
    };
    const questRepository = {
      list: () => [{ questId: 'welcome-to-bellbloom', status: 'active', definition: maeQuest }],
    };
    const service = new TownService({
      repository,
      eventBus: { publish() {} },
      areaRepository,
      questRepository,
    });

    const interaction = service.interact(player.id, 'area-1-town', 'mae-bramble');
    assert.ok(mae.dialogueByContext['quest-active'].includes(interaction.dialogue));

    const completedQuestService = new TownService({
      repository,
      eventBus: { publish() {} },
      areaRepository,
      questRepository: { list: () => [{ questId: 'welcome-to-bellbloom', status: 'claimed', definition: maeQuest }] },
    });
    const completedInteraction = completedQuestService.interact(player.id, 'area-1-town', 'mae-bramble');
    assert.ok(mae.dialogueByContext['quest-completed'].includes(completedInteraction.dialogue));
  } finally {
    repository.close();
  }
});

test('Mae does not use Quest-specific dialogue for another NPC’s or another Area’s Quest', () => {
  const { repository, player, areaRepository } = fixture({ eventBus: { publish() {} } });
  try {
    const mae = npcById('mae-bramble');
    const service = new TownService({
      repository,
      eventBus: { publish() {} },
      areaRepository,
      questRepository: {
        list: () => [
          { questId: 'welcome-to-bellbloom', status: 'active' }, // the catalog assigns this one to the shopkeeper
          { questId: 'warm-road-check-in', status: 'active' }, // Area 2 guide
        ],
      },
    });

    const interaction = service.interact(player.id, 'area-1-town', 'mae-bramble');
    assert.ok(mae.dialogueByContext.welcome.includes(interaction.dialogue));
    assert.equal(mae.dialogueByContext['quest-active'].includes(interaction.dialogue), false);
  } finally {
    repository.close();
  }
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
    assert.equal(area1.towns[0].npcs.length, FOUNDATION_NPCS.length);
    assert.ok(service.get(player.id, 'area-1-town').npcs.some((npc) => npc.id === 'area-1-shopkeeper'));

    areaRepository.save(player.id, new AreaProgression().withHighestUnlockedArea(2).withCurrentArea(2));
    const area2 = service.browse(player.id);
    assert.equal(area2.currentArea.id, 'area-2');
    assert.deepEqual(area2.towns.map((town) => town.id), ['area-2-town']);
    assert.throws(
      () => service.get(player.id, 'area-1-town'),
      (error) => error.code === 'town_unavailable' && /current Area/i.test(error.message),
    );
  } finally {
    repository.close();
  }
});

test('Arc Towns that alias a foundation hub enrich it without duplicating its public hub or NPCs', () => {
  const events = [];
  const { repository, player, areaRepository } = fixture({ eventBus: { publish: (event) => events.push(event) } });
  const arcTown = {
    id: 'bellbloom',
    name: 'Bellbloom',
    areaNumber: 1,
    services: ['cook', 'quest'],
    npcIds: ['mae-bramble', 'arc-bard'],
    npcs: [
      { id: 'mae-bramble', name: 'Mae Bramble', role: 'Quest Guide', service: 'quest', dialogue: 'Duplicate authored record.' },
      { id: 'arc-bard', name: 'Orin Copperspoon', role: 'Cook', service: 'cook', dialogue: 'A new Arc resident.', visualAssetId: 'character.road-sellsword.v1' },
    ],
  };
  const arcManifestService = {
    runtimeTowns: ({ areaNumber }) => areaNumber === 1 ? [arcTown] : [],
    runtimeTownById: (id) => id === arcTown.id ? arcTown : null,
  };
  const service = new TownService({
    repository,
    eventBus: { publish: (event) => events.push(event) },
    areaRepository,
    arcManifestService,
  });

  try {
    const towns = service.browse(player.id).towns;
    assert.equal(towns.length, 1);
    assert.equal(towns[0].id, 'area-1-town');
    assert.ok(towns[0].services.includes('cook'));
    assert.equal(towns[0].npcs.filter((npc) => npc.id === 'mae-bramble').length, 1);
    assert.ok(towns[0].npcs.some((npc) => npc.id === 'arc-bard'));
    assert.equal(service.get(player.id, 'bellbloom').id, 'area-1-town');

    const interaction = service.interact(player.id, 'bellbloom', 'arc-bard');
    assert.deepEqual(interaction, {
      townId: 'area-1-town',
      townName: 'Bellbloom',
      areaNumber: 1,
      npcId: 'arc-bard',
      npcName: 'Orin Copperspoon',
      role: 'Cook',
      service: 'cook',
      dialogue: 'A new Arc resident.',
    });
    assert.equal(events.length, 1);
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
      townName: 'Bellbloom',
      areaNumber: 1,
      npcId: 'area-1-shopkeeper',
      npcName: 'Shopkeeper',
      role: 'Shop',
      service: 'shop',
      dialogue: interaction.dialogue,
    });
    assert.match(interaction.dialogue, /supplies|Welcome to Bellbloom/i);
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
    assert.deepEqual(area1.towns[0].npcs.map((npc) => npc.service), ['quest', 'shop', 'upgrade', 'bank', 'heal']);
    assert.equal(area1.nextLockedArea.progressionChallenge.dungeonId, 'brightbell-trial');
    assert.equal(area1.nextLockedArea.progressionChallenge.requiredHumanPlayers, 2);
    assert.match(area1.nextLockedArea.lockReason, /2 ready human players/i);
    assert.throws(() => service.travel(player.id, 2), (error) => error.code === 'area_locked');

    areaRepository.save(player.id, new AreaProgression().withHighestUnlockedArea(2).withCurrentArea(2));
    const area2 = service.browse(player.id);
    assert.deepEqual(area2.towns.map((town) => town.id), ['area-2-town']);
    assert.equal(area2.nextLockedArea.progressionChallenge.dungeonId, 'emberglass-procession');
    areaRepository.save(player.id, new AreaProgression().withHighestUnlockedArea(4).withCurrentArea(4));
    assert.equal(service.browse(player.id).nextLockedArea, null);
    assert.throws(() => service.travel(player.id, 5), (error) => error.code === 'area_unavailable');
  } finally {
    repository.close();
  }
});
