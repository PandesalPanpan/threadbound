import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/application/EventBus.js';
import { PartyService } from '../src/application/PartyService.js';
import { AREA_ONE_PROGRESSION_DUNGEON_ID, SimpleDungeonService } from '../src/application/SimpleDungeonService.js';
import { areaContentForDungeon, AREA_CONTENT } from '../src/content/AreaContentCatalog.js';
import { AreaProgression } from '../src/domain/AreaProgression.js';
import { requireProgressionAdventureParty } from '../src/domain/ProgressionAdventurePolicy.js';
import { SQLiteAreaRepository } from '../src/infrastructure/SQLiteAreaRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function fixture({ arcManifestService = null } = {}) {
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
  const areaRepository = new SQLiteAreaRepository({ database: repository.db });
  const dungeons = new SimpleDungeonService({
    repository,
    eventBus: events,
    areaRepository,
    arcManifestService,
    idFactory: () => `progression-run-${++nextRun}`,
  });
  const createPlayer = (suffix) => repository.getOrCreatePlayer({
    threadedUserId: `human:${suffix}`,
    displayName: `Human ${suffix}`,
  });
  return { repository, events, published, parties, dungeons, areaRepository, createPlayer };
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

test('legacy Area-1 progression compatibility alias is source-Area gated', () => {
  const { repository, parties, dungeons, areaRepository, createPlayer } = fixture();
  const leader = createPlayer('legacy-area-leader');
  const partner = createPlayer('legacy-area-partner');
  const party = parties.createParty(leader.id);
  parties.joinParty(partner.id, party.joinCode);
  parties.setReady(partner.id, true);
  const areaTwo = new AreaProgression({ currentAreaNumber: 2, highestUnlockedAreaNumber: 2 });
  areaRepository.save(leader.id, areaTwo);
  areaRepository.save(partner.id, areaTwo);

  try {
    const readiness = dungeons.readiness(leader.id, AREA_ONE_PROGRESSION_DUNGEON_ID);
    assert.equal(readiness.progressionAreaNumber, 1);
    assert.equal(readiness.progressionAreaMet, false);
    assert.deepEqual(readiness.progressionAreaMismatches.map((member) => member.playerId).sort(), [leader.id, partner.id].sort());
    assert.throws(() => dungeons.startDungeon(leader.id, AREA_ONE_PROGRESSION_DUNGEON_ID), (error) => {
      assert.equal(error.code, 'progression_challenge_area_mismatch');
      assert.deepEqual(error.mismatchedPlayerIds.sort(), [leader.id, partner.id].sort());
      return true;
    });
  } finally {
    repository.close();
  }
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

test('canonical Brightbell challenges preserve mapped skills, exact human gate, and shared source-Area readiness', () => {
  const arcManifestService = {
    resolveDungeon(dungeonId) {
      const area = areaContentForDungeon(dungeonId);
      if (!area) return null;
      const enemyRows = Object.entries(area.dungeonSkillCodes);
      const stageRows = enemyRows.slice(0, -1);
      const bossRow = enemyRows.at(-1);
      const enemy = ([id]) => ({ id, definitionId: id, name: id, hp: 18, retaliation: 3, visualAssetId: 'mob.green-slime.v1' });
      return {
        id: dungeonId,
        name: area.progressionChallenge?.name || 'Mirrorfen Descent',
        recommendedPlayers: 2,
        encounters: stageRows.map(enemy),
        simpleStages: stageRows.map((row) => [enemy(row)]),
        boss: { ...enemy(bossRow), isBoss: true },
      };
    },
  };
  const { repository, parties, dungeons, areaRepository, createPlayer } = fixture({ arcManifestService });
  const leader = createPlayer('canonical-leader');
  const partner = createPlayer('canonical-partner');

  try {
    for (const area of AREA_CONTENT.slice(0, 3)) {
      const challenge = area.progressionChallenge;
      const definition = dungeons.definition(challenge.dungeonId);
      assert.equal(definition.progressionAdventure, true);
      assert.equal(definition.progressionChallengeId, challenge.id);
      assert.equal(definition.progressionAreaNumber, area.number);
      assert.equal(definition.unlocksAreaNumber, area.number + 1);
      assert.equal(definition.requiredHumanPlayers, 2);
      assert.deepEqual(definition.simpleStages.map((stage) => stage.length), area.simpleRoomEnemyCounts);
      assert.ok(definition.encounters.every((enemy) => enemy.skillCode === area.dungeonSkillCodes[enemy.id]));
      assert.ok(definition.simpleStages.flat().every((enemy) => enemy.skillCode === area.dungeonSkillCodes[enemy.id]));
      assert.equal(definition.boss.skillCode, area.dungeonSkillCodes[definition.boss.id]);
    }

    const firstChallengeId = AREA_CONTENT[0].progressionChallenge.dungeonId;
    const solo = dungeons.readiness(leader.id, firstChallengeId);
    assert.equal(solo.progressionAdventure, true);
    assert.equal(solo.requiredHumanPlayers, 2);
    assert.equal(solo.progressionAreaMet, true);
    assert.throws(() => dungeons.startDungeon(leader.id, firstChallengeId), assertCode('progression_party_required'));

    const party = parties.createParty(leader.id);
    parties.joinParty(partner.id, party.joinCode);
    parties.setReady(partner.id, true);
    const run = dungeons.startDungeon(leader.id, firstChallengeId);
    assert.ok(run.enemies.length > 1 && run.enemies.length <= 3);
    assert.ok(run.dungeonDefinition.simpleStages.flat().every((enemy) => Boolean(enemy.skillCode)));
    assert.ok(run.dungeonDefinition.boss.skillCode);
  } finally {
    repository.close();
  }

  const splitParty = fixture({ arcManifestService });
  const leaderAtAreaTwo = splitParty.createPlayer('area-two-leader');
  const partnerAtAreaOne = splitParty.createPlayer('area-one-partner');
  const partyAtAreaTwo = splitParty.parties.createParty(leaderAtAreaTwo.id);
  splitParty.parties.joinParty(partnerAtAreaOne.id, partyAtAreaTwo.joinCode);
  splitParty.parties.setReady(partnerAtAreaOne.id, true);
  splitParty.areaRepository.save(leaderAtAreaTwo.id, new AreaProgression({ currentAreaNumber: 2, highestUnlockedAreaNumber: 2 }));
  const secondChallengeId = AREA_CONTENT[1].progressionChallenge.dungeonId;
  try {
    const splitPartyReadiness = splitParty.dungeons.readiness(leaderAtAreaTwo.id, secondChallengeId);
    assert.equal(splitPartyReadiness.progressionAreaMet, false);
    assert.deepEqual(splitPartyReadiness.progressionAreaMismatches, [{
      playerId: partnerAtAreaOne.id,
      currentAreaNumber: 1,
      requiredAreaNumber: 2,
    }]);
    assert.throws(() => splitParty.dungeons.startDungeon(leaderAtAreaTwo.id, secondChallengeId), (error) => {
      assert.equal(error.code, 'progression_challenge_area_mismatch');
      assert.deepEqual(error.mismatchedPlayerIds, [partnerAtAreaOne.id]);
      return true;
    });
  } finally {
    splitParty.repository.close();
  }
});
