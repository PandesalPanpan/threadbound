import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/application/EventBus.js';
import { PartyService } from '../src/application/PartyService.js';
import { AREA_ONE_PROGRESSION_DUNGEON_ID, SimpleDungeonService } from '../src/application/SimpleDungeonService.js';
import { requireProgressionAdventureParty } from '../src/domain/ProgressionAdventurePolicy.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function fixture() {
  let nextPlayer = 0;
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => `progression-player-${++nextPlayer}` });
  const events = new EventBus();
  const published = [];
  events.subscribe((event) => published.push(event));
  let nextParty = 0;
  const parties = new PartyService({
    repository,
    eventBus: events,
    idFactory: () => `progression-party-${++nextParty}`,
    joinCodeFactory: () => `PAIR${nextParty + 1}`,
  });
  let nextRun = 0;
  const dungeons = new SimpleDungeonService({
    repository,
    eventBus: events,
    idFactory: () => `progression-run-${++nextRun}`,
  });
  const createPlayer = (suffix) => repository.getOrCreatePlayer({
    threadedUserId: `human:${suffix}`,
    displayName: `Human ${suffix}`,
  });
  return { repository, events, published, parties, dungeons, createPlayer };
}

function assertCode(code) {
  return (error) => {
    assert.equal(error.code, code);
    return true;
  };
}

test('progression Adventure defaults to an exact two-human ready-party requirement', () => {
  assert.throws(() => requireProgressionAdventureParty({
    definition: { progressionAdventure: true },
    party: null,
    startedByPlayerId: 'p1',
    players: [],
  }), assertCode('progression_party_required'));
});

test('Area-1 progression challenge no longer projects Frayed Hollow as the default first impression', () => {
  const { dungeons, createPlayer } = fixture();
  const player = createPlayer('preview');
  const definition = dungeons.definition(AREA_ONE_PROGRESSION_DUNGEON_ID);
  const readiness = dungeons.readiness(player.id, AREA_ONE_PROGRESSION_DUNGEON_ID);

  assert.equal(definition.id, AREA_ONE_PROGRESSION_DUNGEON_ID);
  assert.equal(definition.name, 'Sunpetal Guild Trial');
  assert.equal(readiness.dungeonName, 'Sunpetal Guild Trial');
  assert.equal(definition.progressionAdventure, true);
  assert.equal(definition.unlocksAreaNumber, 2);
  assert.ok(definition.encounters.length > 0);
  assert.ok(definition.encounters.every((enemy) => !/frayed|hollow/i.test(`${enemy.id} ${enemy.name}`)));
  assert.doesNotMatch(`${definition.boss.id} ${definition.boss.name}`, /frayed|hollow|needle/i);
});

test('progression Adventure cannot start solo or before both party members are ready', () => {
  const { parties, dungeons, createPlayer } = fixture();
  const leader = createPlayer('leader');
  const partner = createPlayer('partner');

  const soloReadiness = dungeons.readiness(leader.id, AREA_ONE_PROGRESSION_DUNGEON_ID);
  assert.equal(soloReadiness.progressionAdventure, true);
  assert.equal(soloReadiness.requiredHumanPlayers, 2);
  assert.equal(soloReadiness.partyRequirementMet, false);
  assert.equal(soloReadiness.ready, false);
  assert.throws(() => dungeons.startDungeon(leader.id, AREA_ONE_PROGRESSION_DUNGEON_ID), assertCode('progression_party_required'));

  const party = parties.createParty(leader.id);
  parties.joinParty(partner.id, party.joinCode);
  assert.throws(() => dungeons.startDungeon(leader.id, AREA_ONE_PROGRESSION_DUNGEON_ID), assertCode('progression_party_not_ready'));
});

test('ready pair can start progression boss and the authoritative run snapshots both humans', () => {
  const { parties, dungeons, createPlayer, published } = fixture();
  const leader = createPlayer('leader');
  const partner = createPlayer('partner');
  const party = parties.createParty(leader.id);
  parties.joinParty(partner.id, party.joinCode);
  parties.setReady(partner.id, true);

  const readiness = dungeons.readiness(leader.id, AREA_ONE_PROGRESSION_DUNGEON_ID);
  assert.equal(readiness.partyRequirementMet, true);
  assert.equal(readiness.requiredHumanPlayers, 2);
  assert.equal(readiness.ready, false, 'fresh characters can satisfy the mandatory party gate while remaining below the advisory Attack recommendation');

  const run = dungeons.startDungeon(leader.id, AREA_ONE_PROGRESSION_DUNGEON_ID);
  assert.equal(run.ownerType, 'party');
  assert.equal(run.ownerId, party.id);
  assert.equal(run.dungeonId, AREA_ONE_PROGRESSION_DUNGEON_ID);
  assert.equal(run.dungeonDefinition.name, 'Sunpetal Guild Trial');
  assert.equal(run.simpleCombat, true);
  assert.deepEqual(run.participants.map((participant) => participant.playerId).sort(), [leader.id, partner.id].sort());

  const started = published.find((event) => event.type === 'DungeonStarted' && event.runId === run.id);
  assert.ok(started);
  assert.equal(started.progressionAdventure, true);
  assert.equal(started.requiredHumanPlayers, 2);
  assert.deepEqual([...started.participantIds].sort(), [leader.id, partner.id].sort());
});

test('progression Adventure rejects extra party members instead of treating any party as sufficient', () => {
  const { parties, dungeons, createPlayer } = fixture();
  const leader = createPlayer('leader');
  const partner = createPlayer('partner');
  const third = createPlayer('third');
  const party = parties.createParty(leader.id);
  parties.joinParty(partner.id, party.joinCode);
  parties.joinParty(third.id, party.joinCode);
  parties.setReady(partner.id, true);
  parties.setReady(third.id, true);

  assert.throws(() => dungeons.startDungeon(leader.id, AREA_ONE_PROGRESSION_DUNGEON_ID), assertCode('progression_party_size'));
});
