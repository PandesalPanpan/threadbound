import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VISUAL_ASSETS, visualAsset } from '../public/visual-asset-catalog.js';
import { CANONICAL_VISUAL_ASSET_IDS, compactVisualAssetCatalog } from '../src/content/VisualAssetCatalog.js';
import { FIGMA_CHARACTER_LIBRARY } from '../src/content/FigmaCharacterLibrary.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('visual asset catalog has unique typed semantic IDs and resolvable hashed files', async () => {
  assert.equal(VISUAL_ASSETS.length, 524);
  assert.equal(new Set(VISUAL_ASSETS.map((asset) => asset.id)).size, VISUAL_ASSETS.length);
  for (const asset of VISUAL_ASSETS) {
    assert.match(asset.id, /^(mob|boss|item|icon|character)\.[a-z0-9-]+\.v\d+$/);
    assert.match(asset.src, /^\/assets\/runtime\/[a-z0-9-]+\.[a-f0-9]{12}\.webp$/);
    assert.ok(['project-owned-ai-generated', 'project-owned-figma-export'].includes(asset.provenance.license));
    await access(path.join(ROOT, 'public', asset.src));
  }
});

test('Figma character library imports exactly 100 source masters with deterministic semantic aliases', async () => {
  const sourceDirectory = path.join(ROOT, 'public', 'assets', 'generated', 'figma-character-library', 'v1');
  const sourceFiles = (await readdir(sourceDirectory)).filter((name) => name.endsWith('.svg'));
  assert.equal(FIGMA_CHARACTER_LIBRARY.length, 100);
  assert.equal(sourceFiles.length, 100);
  assert.equal(new Set(FIGMA_CHARACTER_LIBRARY.map((source) => source.sourceNodeId)).size, 100);
  assert.ok(FIGMA_CHARACTER_LIBRARY.every((source) => !source.sourceName.startsWith('Reserved Slot')));

  const imported = VISUAL_ASSETS.filter((asset) => asset.provenance?.sourceCollection === 'figma-character-library-v1');
  assert.equal(imported.length, 152);
  assert.equal(new Set(imported.map((asset) => asset.sourceMaster.file)).size, 100);
  assert.equal(new Set(imported.map((asset) => asset.src)).size, 100);
  assert.equal(imported.filter((asset) => asset.kind === 'character').length, 42);
  assert.equal(imported.filter((asset) => asset.kind === 'mob').length, 100);
  assert.equal(imported.filter((asset) => asset.kind === 'boss').length, 10);
  for (const source of FIGMA_CHARACTER_LIBRARY) {
    assert.ok(sourceFiles.includes(source.sourceFilename), source.sourceFilename);
    const svg = await readFile(path.join(sourceDirectory, source.sourceFilename), 'utf8');
    assert.match(svg, /<svg[^>]*width="112"[^>]*height="112"/);
    assert.doesNotMatch(svg, /Reserved Slot/);
  }
});

test('catalog lookup enforces kind and canonical mappings resolve', () => {
  assert.equal(visualAsset('mob.fire-elemental.v1', 'mob')?.label, 'Fire Elemental');
  assert.equal(visualAsset('mob.fire-elemental.v1', 'boss'), null);
  assert.equal(visualAsset('character.road-sellsword.v1')?.src, visualAsset('mob.road-sellsword.v1')?.src);
  assert.equal(visualAsset('mob.black-banner-captain.v1')?.src, visualAsset('boss.black-banner-captain.v1')?.src);
  for (const [entityId, assetId] of Object.entries(CANONICAL_VISUAL_ASSET_IDS)) {
    assert.ok(visualAsset(assetId), `${entityId} mapping must resolve`);
  }
});

test('compact authoring catalog omits runtime and provenance details', () => {
  const result = compactVisualAssetCatalog({ kinds: ['mob'], tags: ['shadow'], limit: 5 });
  assert.equal(result.length, 5);
  assert.ok(result.every((asset) => asset.kind === 'mob' && !Object.hasOwn(asset, 'src')));
  assert.ok(result.every((asset) => !Object.hasOwn(asset, 'provenance')));
  assert.ok(result[0].tags.includes('shadow'));
  const newMob = compactVisualAssetCatalog({ kinds: ['mob'], tags: ['common-mob'], limit: 1 })[0];
  assert.equal(newMob.boardCategory, 'common-mob');
});

test('multi-part icons and equipment retain complete authored cells', () => {
  const formerlyClipped = [
    'icon.curse.v1', 'icon.freeze.v1', 'icon.gauntlet.v1', 'icon.health-potion.v1',
    'icon.health.v1', 'icon.magic-necklace.v1', 'icon.magic-ring.v1', 'icon.mana-potion.v1',
    'icon.mana.v1', 'icon.poison.v1', 'icon.sleep.v1', 'icon.stun.v1',
    'item.arcane-robe.v1', 'item.demon-pendant.v1',
  ];
  for (const id of formerlyClipped) {
    const asset = visualAsset(id);
    assert.ok(asset.height >= 80, `${id} should retain its full-height artwork`);
    assert.ok(asset.width >= 55, `${id} should not collapse to one detached component`);
  }
});
