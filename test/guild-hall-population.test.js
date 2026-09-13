import test from 'node:test';
import assert from 'node:assert/strict';
import { FOUNDATION_GUILD_HALL_ROSTERS, guildHallPopulationForTown } from '../src/content/FoundationGuildHallCatalog.js';
import { GuildHallService } from '../src/application/GuildHallService.js';
import { TownService } from '../src/application/TownService.js';
import { AreaService } from '../src/application/AreaService.js';
import { SimulatedAdventurerSimulationService } from '../src/application/SimulatedAdventurerSimulationService.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { SQLiteAreaRepository } from '../src/infrastructure/SQLiteAreaRepository.js';
import { SQLiteSimulatedAdventurerRepository } from '../src/infrastructure/SQLiteSimulatedAdventurerRepository.js';

test('foundation Guild Hall roster is neutral, bounded, and includes an intentionally strong rival', () => {
  const roster = guildHallPopulationForTown('area-1-town');
  assert.equal(roster, FOUNDATION_GUILD_HALL_ROSTERS['area-1-town']);
  assert.equal(roster.length, 3);
  assert.deepEqual(guildHallPopulationForTown('missing-town'), []);

  const strong = roster.filter((entry) => entry.strongRival);
  assert.equal(strong.length, 1);
  assert.equal(strong[0].adventurer.id, 'guild-rook');
  assert.equal(strong[0].adventurer.level, 15);
  assert.equal(strong[0].adventurer.highestUnlockedAreaNumber, 5);
  assert.ok(strong[0].adventurer.stats.attack > 10);
  assert.ok(strong[0].adventurer.equipment.weapon);
  assert.equal(Object.hasOwn(strong[0].adventurer, 'honey'), false);
  assert.ok(roster.every((entry) => ['casual', 'steady', 'dedicated'].includes(entry.adventurer.activityProfile.id)));
});

test('GuildHallService seeds missing adventurers once and preserves later simulated progression', () => {
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:' });
  const repository = new SQLiteSimulatedAdventurerRepository({ database: gameRepository.db });
  const service = new GuildHallService({
    repository,
    nowFactory: () => new Date('2026-09-13T00:00:00.000Z'),
  });
  const simulation = new SimulatedAdventurerSimulationService({ repository });

  try {
    const first = service.browse('area-1-town');
    assert.equal(first.name, 'Guild Hall');
    assert.deepEqual(first.adventurers.map((adventurer) => adventurer.id), ['guild-lio', 'guild-mira', 'guild-rook']);
    assert.equal(first.adventurers.find((adventurer) => adventurer.id === 'guild-rook').strongRival, true);
    assert.equal(repository.get('guild-rook').lastSimulatedAt, '2026-09-13T00:00:00.000Z');

    const before = repository.get('guild-rook').adventurer.experience;
    const progressed = simulation.simulate({ adventurerId: 'guild-rook', now: '2026-09-13T04:00:00.000Z' });
    assert.equal(progressed.appliedActions, 2);
    assert.ok(progressed.adventurer.experience > before);

    const second = service.browse('area-1-town');
    const rook = second.adventurers.find((adventurer) => adventurer.id === 'guild-rook');
    assert.equal(rook.experience, progressed.adventurer.experience);
    assert.equal(repository.get('guild-rook').lastSimulatedAt, '2026-09-13T04:00:00.000Z');
    assert.equal(repository.listTicks('guild-rook').length, 2);
  } finally {
    gameRepository.close();
  }
});

test('Town and Area projections expose the same current-Area Guild Hall roster without creating a separate screen', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'guild-hall-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'guild-hall-human', displayName: 'Human Adventurer' });
  const areaRepository = new SQLiteAreaRepository({ database: repository.db });
  const townService = new TownService({ repository, eventBus: { publish() {} }, areaRepository });
  const areaService = new AreaService({ repository, eventBus: { publish() {} }, areaRepository, townService });

  try {
    const town = townService.get(player.id, 'area-1-town');
    assert.ok(town.services.includes('guild_hall'));
    assert.equal(town.guildHall.name, 'Guild Hall');
    assert.equal(town.guildHall.adventurers.length, 3);
    assert.ok(town.guildHall.adventurers.some((adventurer) => adventurer.strongRival));

    const area = areaService.browse(player.id);
    assert.equal(area.towns.length, 1);
    assert.deepEqual(
      area.towns[0].guildHall.adventurers.map((adventurer) => adventurer.id),
      town.guildHall.adventurers.map((adventurer) => adventurer.id),
    );
  } finally {
    repository.close();
  }
});
