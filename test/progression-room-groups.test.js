import test from 'node:test';
import assert from 'node:assert/strict';
import { ArcManifestService } from '../src/application/ArcManifestService.js';
import { EventBus } from '../src/application/EventBus.js';
import { PartyService } from '../src/application/PartyService.js';
import { SimpleDungeonService } from '../src/application/SimpleDungeonService.js';
import { AdventureRun } from '../src/domain/AdventureRun.js';
import { AREA_CONTENT } from '../src/content/AreaContentCatalog.js';
import { instantiateSimpleStage, prepareSimpleDungeon } from '../src/domain/SimpleDungeonPolicy.js';
import { SQLiteArcManifestRepository } from '../src/infrastructure/SQLiteArcManifestRepository.js';
import { SQLiteCodexRepository } from '../src/infrastructure/SQLiteCodexRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

test('canonical progression challenges preserve authored rosters and start grouped production rooms', () => {
  let playerNumber = 0;
  const repository = new SQLiteGameRepository({
    filename: ':memory:',
    idFactory: () => `grouped-room-player-${++playerNumber}`,
  });
  try {
    const codexRepository = new SQLiteCodexRepository({ database: repository.db });
    const manifestRepository = new SQLiteArcManifestRepository({ database: repository.db });
    const arcManifestService = new ArcManifestService({
      gameRepository: repository,
      codexRepository,
      manifestRepository,
      rng: () => 0,
    });
    const events = new EventBus();
    const parties = new PartyService({ repository, eventBus: events });
    const dungeons = new SimpleDungeonService({ repository, eventBus: events, arcManifestService });

    for (const area of AREA_CONTENT.slice(0, 3)) {
      const challenge = area.progressionChallenge;
      const authoredDefinition = arcManifestService.resolveDungeon(challenge.dungeonId);
      const definition = dungeons.definition(challenge.dungeonId);
      const authoredEnemies = authoredDefinition.encounterStages.flat();

      assert.deepEqual(definition.simpleStages.map((stage) => stage.length), area.simpleRoomEnemyCounts);
      assert.deepEqual(definition.simpleStages.flat().map((enemy) => enemy.id), authoredEnemies.map((enemy) => enemy.id));
      assert.deepEqual(
        definition.simpleStages.flat().map((enemy) => enemy.visualAssetId),
        authoredEnemies.map((enemy) => enemy.visualAssetId),
      );
      assert.ok(definition.simpleStages.flat().every((enemy) => enemy.skillCode === area.dungeonSkillCodes[enemy.id]));
      assert.equal(definition.boss.id, authoredDefinition.boss.id);
      assert.equal(definition.boss.visualAssetId, authoredDefinition.boss.visualAssetId);
      assert.equal(definition.bossAdds.length, 1);
      const prepared = prepareSimpleDungeon(definition);
      const bossRoster = instantiateSimpleStage({
        definition: prepared,
        stage: [prepared.boss, ...prepared.bossAdds],
        roomIndex: prepared.simpleStages.length,
        participantCount: 2,
        boss: true,
      });
      assert.equal(bossRoster.length, 2);
      assert.equal(bossRoster[0].id, definition.boss.id);
      assert.equal(bossRoster[0].isBoss, true);
      assert.equal(bossRoster[1].id, definition.bossAdds[0].id);
      assert.equal(bossRoster[1].isBoss, false);
      assert.ok(bossRoster.every((enemy) => enemy.visualAssetId && enemy.skillCode));
      assert.equal(definition.rewardPoolId, authoredDefinition.rewardPoolId);
      assert.equal(definition.requiredHumanPlayers, 2);
      assert.equal(definition.unlocksAreaNumber, area.number + 1);
    }

    const leader = repository.getOrCreatePlayer({ threadedUserId: 'grouped-room-leader', displayName: 'Leader' });
    const partner = repository.getOrCreatePlayer({ threadedUserId: 'grouped-room-partner', displayName: 'Partner' });
    const party = parties.createParty(leader.id);
    parties.joinParty(partner.id, party.joinCode);
    parties.setReady(partner.id, true);

    const challenge = AREA_CONTENT[0].progressionChallenge;
    const definition = dungeons.definition(challenge.dungeonId);
    const expectedFirstRoom = definition.simpleStages[0];
    const run = dungeons.startDungeon(leader.id, challenge.dungeonId);
    assert.ok(run.enemies.length > 1 && run.enemies.length <= 3);
    assert.deepEqual(run.enemies.map((enemy) => enemy.id), expectedFirstRoom.map((enemy) => enemy.id));
    assert.ok(run.enemies.every((enemy) => enemy.visualAssetId && enemy.skillCode));

    const combat = new AdventureRun(run);
    assert.equal(combat.toJSON().simpleStageCount, definition.simpleStages.length);
    while (combat.toJSON().phase !== 'boss') {
      if (combat.toJSON().phase === 'between_encounter') combat.continueEncounter({ playerId: leader.id });
      if (combat.toJSON().phase === 'boss') break;
      const state = combat.toJSON();
      const cleared = combat.resolveSimpleEncounter({
        playerActions: Object.fromEntries(state.participants.map(({ playerId }) => [playerId, { attackPower: 1000 }])),
        now: '2026-09-23T00:00:00.000Z',
      });
      assert.equal(cleared.state.phase, 'between_encounter');
    }
    const bossState = combat.toJSON();
    assert.deepEqual(bossState.enemies.map((enemy) => [enemy.id, enemy.isBoss]), [
      [definition.boss.id, true],
      [definition.bossAdds[0].id, false],
    ]);
    const bossReplay = combat.resolveSimpleEncounter({
      playerActions: Object.fromEntries(bossState.participants.map(({ playerId }) => [playerId, { attackPower: 1000, skillCode: 'ember-burst' }])),
      signatureSkills: true,
      now: '2026-09-23T00:00:01.000Z',
    });
    assert.ok(bossReplay.actions.some((action) => action.targetCombatantId?.includes(`:${definition.bossAdds[0].id}:`)));
  } finally {
    repository.close();
  }
});
