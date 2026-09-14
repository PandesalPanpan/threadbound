import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArcManifestService } from '../src/application/ArcManifestService.js';
import { AreaService } from '../src/application/AreaService.js';
import { GLASSWAKE_ARC_MANIFEST } from '../src/content/BundledArcManifests.js';
import { AreaProgression } from '../src/domain/AreaProgression.js';
import { SQLiteArcManifestRepository } from '../src/infrastructure/SQLiteArcManifestRepository.js';
import { SQLiteAreaRepository } from '../src/infrastructure/SQLiteAreaRepository.js';
import { SQLiteCodexRepository } from '../src/infrastructure/SQLiteCodexRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

async function brightbellManifest() {
  return JSON.parse(await readFile(new URL('../content/arcs/brightbell-bloom.arc-manifest.json', import.meta.url), 'utf8'));
}

function releaseServices(gameRepository, idFactory) {
  const codexRepository = new SQLiteCodexRepository({ database: gameRepository.db });
  const manifestRepository = new SQLiteArcManifestRepository({ database: gameRepository.db });
  const arcManifestService = new ArcManifestService({
    gameRepository,
    codexRepository,
    manifestRepository,
    bundledManifests: [GLASSWAKE_ARC_MANIFEST],
    idFactory,
    rng: () => 0,
  });
  return { arcManifestService, codexRepository, manifestRepository };
}

test('publishing Brightbell is additive across a persisted release and old Areas remain freely revisit-able', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'threadbound-m10-06-'));
  const filename = join(directory, 'threadbound.sqlite');
  try {
    let oldManifestId = 0;
    let gameRepository = new SQLiteGameRepository({ filename, idFactory: () => 'm10-06-player' });
    const oldRelease = releaseServices(gameRepository, () => `old-release-manifest-${++oldManifestId}`);

    // Simulate the already-shipped world before the new Arc exists.
    assert.ok(oldRelease.arcManifestService.resolveDungeon('mirrorfen-descent'));
    const player = gameRepository.getOrCreatePlayer({ threadedUserId: 'm10-06-user', displayName: 'Revisit Adventurer' });
    const oldAreaRepository = new SQLiteAreaRepository({ database: gameRepository.db });
    oldAreaRepository.save(player.id, new AreaProgression({ currentAreaNumber: 3, highestUnlockedAreaNumber: 3 }));

    const glasswakeBefore = oldRelease.manifestRepository.listPublished().find((record) => record.arcId === 'glasswake');
    assert.ok(glasswakeBefore);
    assert.equal(oldRelease.manifestRepository.listPublished().length, 1);
    gameRepository.close();

    // Simulate the next release opening the same durable database and explicitly publishing Brightbell.
    let newManifestId = 0;
    gameRepository = new SQLiteGameRepository({ filename });
    const newRelease = releaseServices(gameRepository, () => `new-release-manifest-${++newManifestId}`);
    assert.ok(newRelease.arcManifestService.resolveDungeon('mirrorfen-descent'), 'startup must retain the bundled legacy Arc without duplicating it');

    const brightbell = await brightbellManifest();
    const draft = newRelease.arcManifestService.saveDraft(brightbell, { source: 'm10-06-publication-regression' });
    const publishedBrightbell = newRelease.arcManifestService.publish(draft.id);
    assert.equal(publishedBrightbell.status, 'published');
    assert.equal(publishedBrightbell.arcId, 'brightbell-bloom');

    const published = newRelease.manifestRepository.listPublished();
    assert.deepEqual(published.map((record) => record.arcId).sort(), ['brightbell-bloom', 'glasswake']);

    const glasswakeAfter = published.find((record) => record.arcId === 'glasswake');
    assert.equal(glasswakeAfter.id, glasswakeBefore.id);
    assert.equal(glasswakeAfter.revision, glasswakeBefore.revision);
    assert.equal(glasswakeAfter.source, glasswakeBefore.source);
    assert.equal(glasswakeAfter.status, 'published');
    assert.deepEqual(glasswakeAfter.manifest, glasswakeBefore.manifest);
    assert.ok(newRelease.arcManifestService.resolveDungeon('mirrorfen-descent'), 'old Arc gameplay must remain resolvable after new publication');
    assert.equal(newRelease.codexRepository.getContentEntry('generated-arc:glasswake')?.status, 'published');
    assert.equal(newRelease.codexRepository.getContentEntry('generated-arc:brightbell-bloom')?.status, 'published');

    const events = [];
    const areaRepository = new SQLiteAreaRepository({ database: gameRepository.db });
    const areaService = new AreaService({
      repository: gameRepository,
      areaRepository,
      eventBus: { publish: (event) => events.push(event) },
    });

    assert.equal(areaService.browse(player.id).highestUnlockedAreaNumber, 3);
    for (const areaNumber of [1, 2, 3]) {
      const view = areaService.travel(player.id, areaNumber);
      assert.equal(view.currentAreaNumber, areaNumber);
      assert.equal(view.highestUnlockedAreaNumber, 3, 'revisiting old Areas must never lower the unlock frontier');
      assert.deepEqual(view.areas.map((area) => area.number), [1, 2, 3]);
    }
    assert.deepEqual(events.map((event) => event.toArea.number), [1, 2, 3]);

    gameRepository.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
