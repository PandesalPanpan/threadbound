import test from 'node:test';
import assert from 'node:assert/strict';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { SQLiteCodexRepository } from '../src/infrastructure/SQLiteCodexRepository.js';
import { SQLiteArcManifestRepository } from '../src/infrastructure/SQLiteArcManifestRepository.js';
import { ArcManifestService } from '../src/application/ArcManifestService.js';
import { GLASSWAKE_ARC_MANIFEST } from '../src/content/BundledArcManifests.js';
import { AdventureRun } from '../src/domain/AdventureRun.js';
import { nextEnemyIntent } from '../src/domain/CombatIntentPolicy.js';

function setup(rolls = [0]) {
  let playerId = 0;
  let manifestId = 0;
  let rollIndex = 0;
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => `breadth-player-${++playerId}` });
  const codexRepository = new SQLiteCodexRepository({ database: gameRepository.db });
  const manifestRepository = new SQLiteArcManifestRepository({ database: gameRepository.db });
  const service = new ArcManifestService({
    gameRepository,
    codexRepository,
    manifestRepository,
    idFactory: () => `breadth-manifest-${++manifestId}`,
    rng: () => rolls[Math.min(rollIndex++, rolls.length - 1)],
  });
  return { gameRepository, codexRepository, manifestRepository, service };
}

test('bundled Glasswake manifest publishes through the same repository and hydrates runtime mechanics', () => {
  const { gameRepository, codexRepository, manifestRepository, service } = setup([0]);
  const dungeon = service.runtimeDungeons().find((candidate) => candidate.id === 'mirrorfen-descent');
  assert.ok(dungeon);
  assert.equal(dungeon.arcId, 'glasswake');
  assert.equal(dungeon.encounterVariants.length, 2);
  assert.equal(dungeon.runEventSchedule.events.length, 2);
  assert.equal(dungeon.encounters[0].intentCadence, 1);
  assert.ok(dungeon.encounters.some((enemy) => enemy.abilities.includes('ally_hunter')));
  assert.ok(dungeon.boss.abilities.includes('ally_hunter'));

  const published = manifestRepository.listPublished().find((record) => record.arcId === 'glasswake');
  assert.equal(published?.source, 'bundled');
  assert.equal(published?.status, 'published');
  assert.equal(service.validate(GLASSWAKE_ARC_MANIFEST).valid, true);
  assert.equal(codexRepository.getContentEntry('generated-arc:glasswake')?.status, 'published');
  gameRepository.close();
});

test('seeded encounter rolls produce all Glasswake sequences without changing the manifest', () => {
  const { gameRepository, service } = setup([0.0, 0.4, 0.9]);
  const first = service.resolveDungeon('mirrorfen-descent');
  const second = service.resolveDungeon('mirrorfen-descent');
  const third = service.resolveDungeon('mirrorfen-descent');

  assert.deepEqual([first.encounterVariantIndex, second.encounterVariantIndex, third.encounterVariantIndex], [0, 1, 2]);
  const sequences = [first, second, third].map((dungeon) => dungeon.encounters.map((enemy) => enemy.id).join(','));
  assert.equal(new Set(sequences).size, 3);
  assert.equal(first.sourceManifestRevision, second.sourceManifestRevision);
  gameRepository.close();
});

test('ally hunter marks the most vulnerable Weaver and creates a protect-the-party decision', () => {
  const intent = nextEnemyIntent({
    enemy: { id: 'glass-skulker', hp: 11, maxHp: 11, retaliation: 2, abilities: ['ally_hunter'], isBoss: false, battlePhase: 0 },
    intentCount: 0,
    participants: [
      { playerId: 'healthy', hp: 36, maxHp: 40 },
      { playerId: 'wounded', hp: 9, maxHp: 40 },
    ],
    now: '2026-09-08T00:00:00.000Z',
  });

  assert.equal(intent.kind, 'targeted-damage');
  assert.equal(intent.reaction, 'guard');
  assert.equal(intent.targetPlayerId, 'wounded');
  assert.match(intent.hint, /marked ally/i);
});

test('replayability validation rejects unsafe cadence, broken variants, and unknown event references', () => {
  const { gameRepository, service } = setup();
  const manifest = structuredClone(GLASSWAKE_ARC_MANIFEST);
  manifest.enemies[0].intentCadence = 0;
  manifest.dungeons[0].encounterVariants[0][0] = 'missing-enemy';
  manifest.dungeons[0].runEventSchedule.eventIds[0] = 'missing-event';

  const result = service.validate(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'invalid_intent_cadence'));
  assert.ok(result.errors.some((error) => error.code === 'unknown_enemy_reference'));
  assert.ok(result.errors.some((error) => error.code === 'unknown_run_event_reference'));
  gameRepository.close();
});

test('manifest-owned run event is snapshotted into AdventureRun and resumes the selected encounter', () => {
  const { gameRepository, service } = setup([0]);
  const dungeon = service.resolveDungeon('mirrorfen-descent');
  const run = AdventureRun.start({
    id: 'glasswake-event-run',
    ownerType: 'player',
    ownerId: 'weaver-a',
    startedByPlayerId: 'weaver-a',
    participants: [{ playerId: 'weaver-a', maxHealth: 40 }],
    dungeonId: dungeon.id,
    dungeonDefinition: dungeon,
  });

  run.attack({ playerId: 'weaver-a', attackPower: 50 });
  assert.equal(run.toJSON().encounterIndex, 1);
  const second = run.attack({ playerId: 'weaver-a', attackPower: 50 });
  assert.equal(second.state.phase, 'event');
  assert.ok(['shattered-crossing', 'borrowed-reflection'].includes(second.state.runEvent.id));
  const choice = second.state.runEvent.choices[0];
  const resumed = run.chooseRunEvent(choice.id);
  assert.equal(resumed.state.phase, 'combat');
  assert.equal(resumed.state.encounterIndex, 2);
  assert.equal(resumed.state.runEventHistory.length, 1);
  gameRepository.close();
});
