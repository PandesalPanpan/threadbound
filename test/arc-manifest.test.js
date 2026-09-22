import test from 'node:test';
import assert from 'node:assert/strict';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { SQLiteCodexRepository } from '../src/infrastructure/SQLiteCodexRepository.js';
import { SQLiteArcManifestRepository } from '../src/infrastructure/SQLiteArcManifestRepository.js';
import { ArcManifestService } from '../src/application/ArcManifestService.js';
import { ALLOWED_ENEMY_ABILITIES, ALLOWED_QUEST_OBJECTIVES, ArcManifestValidator } from '../src/application/ArcManifestValidator.js';
import { ArcAchievementProjector } from '../src/application/ArcAchievementProjector.js';
import { DungeonRun } from '../src/domain/DungeonRun.js';

function validManifest() {
  return {
    manifestVersion: 1,
    arc: {
      id: 'ashen-thread-test',
      title: 'The Ashen Thread Test',
      premise: 'A test rupture used to prove portable Arc Manifest publication.',
      progression: { metric: 'dungeon_clears', target: 25 },
    },
    lore: [{ id: 'test-cinder-seam', title: 'Test Cinder Seam', summary: 'A test seam.', body: 'A test lore body.', tags: ['test'] }],
    enemies: [{ id: 'test-ashling', name: 'Test Ashling', baseHp: 8, retaliation: 1, abilities: ['basic_retaliation'], visualAssetId: 'mob.fire-elemental.v1' }],
    bosses: [{ id: 'test-loomkeeper', name: 'Test Loomkeeper', baseHp: 18, retaliation: 2, abilities: ['basic_retaliation'], visualAssetId: 'boss.lava-titan.v1' }],
    dungeons: [{ id: 'test-cinder-vault', name: 'Test Cinder Vault', recommendedPlayers: 2, encounters: ['test-ashling'], bossId: 'test-loomkeeper', rewardPoolId: 'test-cinder-relics' }],
    itemPools: [{ id: 'test-cinder-relics', items: [{ id: 'test-ember-needle', namePattern: 'Test Ember Needle of {suffix}', rarity: 'rare', attackBonus: 3, effects: ['boss_bane'], visualAssetId: 'item.fire-dagger.v1' }] }],
    storyQuests: [{
      id: 'test-cinder-request',
      title: 'Test Cinder Request',
      description: 'A generated story-quest definition that remains constrained data.',
      areaNumber: 1,
      objectives: [{ id: 'hunt-cinders', type: 'hunt', count: 2 }],
    }],
    achievements: [{ id: 'test-cinder-cleared', title: 'Test Through the Cinders', description: 'Complete the test vault.', event: 'dungeon_completed', targetId: 'test-cinder-vault', threshold: 1 }],
    historicalConsequences: [{ id: 'test-ashen-begins', trigger: 'arc_started', title: 'Test Ashen Thread begins', body: 'The test arc entered world history.' }],
  };
}

function setup() {
  let playerId = 0;
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => `manifest-player-${++playerId}` });
  const codexRepository = new SQLiteCodexRepository({ database: gameRepository.db });
  const manifestRepository = new SQLiteArcManifestRepository({ database: gameRepository.db });
  let manifestId = 0;
  const service = new ArcManifestService({ gameRepository, codexRepository, manifestRepository, idFactory: () => `manifest-${++manifestId}`, rng: () => 0 });
  return { gameRepository, codexRepository, manifestRepository, service };
}

test('validator rejects canonical collisions, unsupported mechanics, broken references, and bad achievement targets', () => {
  const validator = new ArcManifestValidator();
  const manifest = validManifest();
  manifest.arc.id = 'arc-1';
  manifest.itemPools[0].items[0].effects = ['instant_kill'];
  manifest.dungeons[0].bossId = 'missing-boss';
  manifest.achievements[0].targetId = 'missing-dungeon';

  const result = validator.validate(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'canonical_id_collision'));
  assert.ok(result.errors.some((error) => error.code === 'unsupported_item_effect'));
  assert.ok(result.errors.some((error) => error.code === 'unknown_boss_reference'));
  assert.ok(result.errors.some((error) => error.code === 'unknown_achievement_target'));
});

test('story quests compose exactly the domain-owned objective vocabulary and reject executable-looking fields', () => {
  assert.deepEqual(ALLOWED_QUEST_OBJECTIVES, ['kill', 'hunt', 'adventure', 'collect', 'boss', 'visit', 'speak']);
  const validator = new ArcManifestValidator();
  const manifest = validManifest();
  manifest.storyQuests = [{
    id: 'test-guild-story',
    title: 'Test Guild Story',
    description: 'Exercises every data-only objective shape available to generated story quests.',
    areaNumber: 1,
    objectives: [
      { id: 'defeat-ashling', type: 'kill', targetId: 'test-ashling', targetLabel: 'Test Ashling', count: 2 },
      { id: 'complete-hunts', type: 'hunt', count: 2 },
      { id: 'complete-adventure', type: 'adventure', count: 1 },
      { id: 'collect-needle', type: 'collect', targetId: 'test-ember-needle', targetLabel: 'Test Ember Needle', count: 1 },
      { id: 'defeat-vault-boss', type: 'boss', targetId: 'test-cinder-vault', targetLabel: 'Test Loomkeeper', count: 1 },
      { id: 'visit-shopkeeper', type: 'visit', targetId: 'area-1-shopkeeper', targetLabel: 'Shopkeeper', count: 1 },
      { id: 'speak-shopkeeper', type: 'speak', targetId: 'area-1-shopkeeper', targetLabel: 'Shopkeeper', count: 1 },
    ],
  }];
  assert.equal(validator.validate(manifest).valid, true);

  const executable = structuredClone(manifest);
  executable.storyQuests[0].objectives[0].script = 'player.gold += 999999';
  let result = validator.validate(executable);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'unsupported_quest_objective_field' && /script/i.test(error.message)));

  const unknownType = structuredClone(manifest);
  unknownType.storyQuests[0].objectives[0] = { id: 'custom-rule', type: 'summon', count: 1 };
  result = validator.validate(unknownType);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'invalid_quest_objective' && /unsupported quest objective type/i.test(error.message)));
});

test('story quest definitions require stable composition without changing legacy manifest requirements', () => {
  const validator = new ArcManifestValidator();
  const legacyCompatible = validManifest();
  delete legacyCompatible.storyQuests;
  assert.equal(validator.validate(legacyCompatible).valid, true);

  const invalid = validManifest();
  invalid.storyQuests[0].id = 'bad_story_id';
  invalid.storyQuests[0].objectives = [
    { id: 'same-objective', type: 'hunt', count: 1 },
    { id: 'same-objective', type: 'adventure', count: 1 },
  ];
  const result = validator.validate(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'invalid_quest_id'));
  assert.ok(result.errors.some((error) => error.code === 'duplicate_quest_objective_id'));
});

test('valid manifests save as draft, publish explicitly, and supersede old revisions', () => {
  const { gameRepository, manifestRepository, service } = setup();
  const first = service.saveDraft(validManifest(), { source: 'chatgpt-upload' });
  assert.equal(first.status, 'draft');
  assert.equal(first.revision, 1);
  assert.equal(first.manifest.storyQuests[0].objectives[0].type, 'hunt');
  assert.equal(manifestRepository.listPublished().length, 0);

  const published = service.publish(first.id);
  assert.equal(published.status, 'published');
  assert.equal(published.manifest.storyQuests[0].id, 'test-cinder-request');
  assert.equal(manifestRepository.listPublished().length, 1);

  const secondManifest = validManifest();
  secondManifest.arc.premise = 'A revised premise.';
  const second = service.saveDraft(secondManifest, { source: 'manual-edit' });
  assert.equal(second.revision, 2);
  service.publish(second.id);

  const rows = manifestRepository.list();
  assert.equal(rows.find((row) => row.id === first.id).status, 'superseded');
  assert.equal(rows.find((row) => row.id === second.id).status, 'published');
  gameRepository.close();
});

test('publishing revalidates the persisted draft and leaves invalid content unpublished', () => {
  const { gameRepository, manifestRepository, service } = setup();
  const draft = service.saveDraft(validManifest(), { source: 'revalidation-test' });
  const invalid = structuredClone(draft.manifest);
  invalid.dungeons[0].bossId = 'missing-boss';
  manifestRepository.db.prepare('UPDATE arc_manifests SET manifest_json = ? WHERE id = ?').run(JSON.stringify(invalid), draft.id);

  assert.throws(() => service.publish(draft.id), (error) => {
    assert.equal(error.code, 'arc_manifest_invalid');
    assert.equal(error.validation.valid, false);
    assert.ok(error.validation.errors.some((entry) => entry.code === 'unknown_boss_reference'));
    return true;
  });
  assert.equal(manifestRepository.get(draft.id).status, 'draft');
  assert.equal(manifestRepository.listPublished().length, 0);
  gameRepository.close();
});

test('validator accepts optional typed visual assets and rejects unknown or cross-kind references', () => {
  const validator = new ArcManifestValidator();
  assert.equal(validator.validate(validManifest()).valid, true);
  const invalid = validManifest();
  invalid.enemies[0].visualAssetId = 'boss.lava-titan.v1';
  invalid.bosses[0].visualAssetId = 'boss.does-not-exist.v1';
  const result = validator.validate(invalid);
  assert.equal(result.valid, false);
  assert.equal(result.errors.filter((error) => error.code === 'unknown_visual_asset').length, 2);
});

test('imported Figma humanoid and elite aliases validate at their authored combat kinds', () => {
  const validator = new ArcManifestValidator();
  const manifest = validManifest();
  manifest.enemies[0].visualAssetId = 'mob.ridge-wolf.v1';
  manifest.bosses[0].visualAssetId = 'boss.watcher-prime.v1';
  assert.equal(validator.validate(manifest).valid, true);

  const wrongEnemyKind = structuredClone(manifest);
  wrongEnemyKind.enemies[0].visualAssetId = 'boss.watcher-prime.v1';
  assert.equal(validator.validate(wrongEnemyKind).valid, false);

  const wrongBossKind = structuredClone(manifest);
  wrongBossKind.bosses[0].visualAssetId = 'mob.ridge-wolf.v1';
  assert.equal(validator.validate(wrongBossKind).valid, false);
});

test('publishing projects lore/history and exposes runtime dungeon plus manifest reward', () => {
  const { gameRepository, codexRepository, service } = setup();
  const record = service.publish(service.saveDraft(validManifest()).id);

  assert.equal(record.manifest.arc.id, 'ashen-thread-test');
  const runtime = service.resolveDungeon('test-cinder-vault');
  assert.equal(runtime.arcId, 'ashen-thread-test');
  assert.equal(runtime.encounters[0].hp, 8);
  assert.equal(runtime.encounters[0].visualAssetId, 'mob.root-ant.v1');
  assert.equal(runtime.boss.hp, 18);
  assert.equal(runtime.boss.visualAssetId, 'boss.veil-executioner.v1');

  const run = DungeonRun.start({
    id: 'manifest-visual-run',
    ownerType: 'player',
    ownerId: 'player-1',
    startedByPlayerId: 'player-1',
    participants: [{ playerId: 'player-1', maxHealth: 40 }],
    dungeonId: runtime.id,
    dungeonDefinition: runtime,
  });
  assert.equal(run.toJSON().enemy.visualAssetId, 'mob.root-ant.v1');

  const reward = service.generateReward('test-cinder-vault');
  assert.equal(reward.definitionId, 'test-ember-needle');
  assert.equal(reward.effectCode, 'boss_bane');
  assert.equal(reward.attackBonus, 3);
  assert.equal(reward.visualAssetId, 'item.fire-dagger.v1');
  assert.match(reward.name, /Test Ember Needle/);

  const arcLore = codexRepository.getContentEntry('generated-arc:ashen-thread-test');
  assert.equal(arcLore.status, 'published');
  assert.equal(arcLore.version, 1);
  const history = codexRepository.listWorldHistory();
  assert.ok(history.some((entry) => entry.eventType === 'arc_published'));
  assert.ok(history.some((entry) => entry.eventType === 'arc_started' && entry.title === 'Test Ashen Thread begins'));
  gameRepository.close();
});

test('dynamic dungeon snapshot remains playable after manifest definitions change', () => {
  const { gameRepository, service } = setup();
  service.publish(service.saveDraft(validManifest()).id);
  const dungeon = service.resolveDungeon('test-cinder-vault');
  const run = DungeonRun.start({
    id: 'run-manifest-1',
    ownerType: 'player',
    ownerId: 'player-1',
    startedByPlayerId: 'player-1',
    participants: [{ playerId: 'player-1', maxHealth: 40 }],
    dungeonId: dungeon.id,
    dungeonDefinition: dungeon,
  });

  const revised = validManifest();
  revised.enemies[0].baseHp = 40;
  service.publish(service.saveDraft(revised).id);

  assert.equal(service.resolveDungeon('test-cinder-vault').encounters[0].hp, 40);
  assert.equal(run.toJSON().dungeonDefinition.encounters[0].hp, 8);
  assert.equal(run.toJSON().enemy.maxHp, 8);
  gameRepository.close();
});

test('world context exports supported mechanics and current published arc metadata', () => {
  const { gameRepository, service } = setup();
  service.publish(service.saveDraft(validManifest()).id);
  const context = service.worldContext();
  assert.equal(context.manifestVersion, 1);
  assert.ok(context.allowedMechanics.itemEffects.some((effect) => effect.code === 'boss_bane'));
  assert.deepEqual(context.allowedMechanics.enemyAbilities, [...ALLOWED_ENEMY_ABILITIES]);
  assert.deepEqual(context.allowedMechanics.questObjectives, [...ALLOWED_QUEST_OBJECTIVES]);
  assert.equal(context.publishedGeneratedArcs[0].arcId, 'ashen-thread-test');
  assert.equal(context.visualAssetCatalog.selectionMode, 'exact-allowlisted-id');
  assert.ok(context.visualAssetCatalog.shortlist.every((asset) => !Object.hasOwn(asset, 'src')));
  assert.ok(context.visualAssetCatalog.collections.characters.some((asset) => asset.id === 'character.road-sellsword.v1'));
  assert.ok(context.visualAssetCatalog.collections.mobs.some((asset) => asset.id === 'mob.marsh-blob.v1'));
  assert.ok(context.visualAssetCatalog.collections.bosses.some((asset) => asset.id === 'boss.iron-husk.v1'));
  assert.ok(context.visualAssetCatalog.collections.characters.every((asset) => !Object.hasOwn(asset, 'src') && !Object.hasOwn(asset, 'provenance')));
  assert.ok(context.generationRules.some((rule) => /story quest objectives/i.test(rule)));
  assert.ok(context.generationRules.some((rule) => /NPCs.*character/i.test(rule)));
  assert.ok(context.generationRules.some((rule) => /Return JSON only/i.test(rule)));
  gameRepository.close();
});

test('published scoped achievements progress from matching domain events and ignore other dungeons', () => {
  const { gameRepository, manifestRepository, service } = setup();
  service.publish(service.saveDraft(validManifest()).id);
  const player = gameRepository.getOrCreatePlayer({ threadedUserId: 'manifest-achiever', displayName: 'Manifest Achiever' });
  const projector = new ArcAchievementProjector({ gameRepository, manifestRepository, arcManifestService: service });

  projector.handle({ type: 'DungeonCompleted', playerId: player.id, runId: 'other-run', dungeonId: 'other-dungeon' });
  assert.equal(manifestRepository.getAchievementProgress(player.id, 'test-cinder-cleared'), 0);
  assert.equal(gameRepository.listAchievements(player.id).some((entry) => entry.id === 'test-cinder-cleared'), false);

  const matching = { type: 'DungeonCompleted', playerId: player.id, runId: 'cinder-run', dungeonId: 'test-cinder-vault' };
  projector.handle(matching);
  projector.handle(matching);
  assert.equal(manifestRepository.getAchievementProgress(player.id, 'test-cinder-cleared'), 1);
  assert.equal(gameRepository.listAchievements(player.id).find((entry) => entry.id === 'test-cinder-cleared').name, 'Test Through the Cinders');
  gameRepository.close();
});
