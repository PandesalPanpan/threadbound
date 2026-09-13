import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ArcManifestService } from '../src/application/ArcManifestService.js';
import { ArcManifestVNextValidator } from '../src/application/ArcManifestVNextValidator.js';
import { SQLiteArcManifestRepository } from '../src/infrastructure/SQLiteArcManifestRepository.js';
import { SQLiteCodexRepository } from '../src/infrastructure/SQLiteCodexRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

async function brightbellManifest() {
  return JSON.parse(await readFile(new URL('../content/arcs/brightbell-bloom.arc-manifest.json', import.meta.url), 'utf8'));
}

function setup() {
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:' });
  const codexRepository = new SQLiteCodexRepository({ database: gameRepository.db });
  const manifestRepository = new SQLiteArcManifestRepository({ database: gameRepository.db });
  const service = new ArcManifestService({
    gameRepository,
    codexRepository,
    manifestRepository,
    bundledManifests: [],
    idFactory: () => 'brightbell-draft',
    rng: () => 0,
  });
  return { manifestRepository, service };
}

test('Brightbell Bloom is a full original vNext Arc package with the planned world breadth', async () => {
  const manifest = await brightbellManifest();
  const itemCount = manifest.itemPools.reduce((sum, pool) => sum + pool.items.length, 0);
  const itemSlots = new Set(manifest.itemPools.flatMap((pool) => pool.items.map((item) => item.slot)));
  const allVisualized = [
    ...manifest.enemies,
    ...manifest.bosses,
    ...manifest.itemPools.flatMap((pool) => pool.items),
  ].every((entry) => typeof entry.visualAssetId === 'string' && entry.visualAssetId.length > 0);

  assert.equal(manifest.arc.id, 'brightbell-bloom');
  assert.equal(manifest.areas.length, 3);
  assert.equal(manifest.towns.length, 2);
  assert.equal(manifest.npcs.length, 10);
  assert.equal(manifest.enemies.length, 12);
  assert.equal(manifest.bosses.length, 3);
  assert.equal(itemCount, 21);
  assert.equal(manifest.quests.length, 12);
  assert.equal(manifest.shops.length, 2);
  assert.equal(manifest.achievements.length, 6);
  assert.equal(manifest.lore.length, 5);
  assert.deepEqual([...itemSlots].sort(), ['accessory', 'armor', 'boots', 'helmet', 'weapon']);
  assert.equal(allVisualized, true);
  assert.equal(JSON.stringify(manifest).toLowerCase().includes('honey'), false);
  assert.equal(new ArcManifestVNextValidator().validate(manifest).valid, true);
});

test('Brightbell Bloom passes the complete authoritative Arc pipeline and remains an explicit draft for M10-05', async () => {
  const manifest = await brightbellManifest();
  const { manifestRepository, service } = setup();
  const validation = service.validate(manifest);

  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.errors.length, 0);

  const saved = service.saveDraft(manifest, { source: 'm10-05-authored' });
  assert.equal(saved.status, 'draft');
  assert.equal(saved.arcId, 'brightbell-bloom');
  assert.equal(saved.manifest.areas.length, 3);
  assert.equal(manifestRepository.listPublished().length, 0, 'M10-05 authors the Arc; explicit publication/revisit verification remains M10-06.');
});

test('Brightbell progression challenges form the ordered three-Area path and keep both-human gates', async () => {
  const manifest = await brightbellManifest();
  assert.deepEqual(manifest.progressionChallenges.map((challenge) => ({
    areaId: challenge.areaId,
    unlocksAreaId: challenge.unlocksAreaId,
    requiresBothHumans: challenge.requiresBothHumans,
  })), [
    { areaId: 'bellbloom-meadows', unlocksAreaId: 'emberglass-orchard', requiresBothHumans: true },
    { areaId: 'emberglass-orchard', unlocksAreaId: 'kitewind-heights', requiresBothHumans: true },
    { areaId: 'kitewind-heights', unlocksAreaId: null, requiresBothHumans: true },
  ]);
});
