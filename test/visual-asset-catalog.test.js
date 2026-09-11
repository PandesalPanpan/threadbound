import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VISUAL_ASSETS, visualAsset } from '../public/visual-asset-catalog.js';
import { CANONICAL_VISUAL_ASSET_IDS, compactVisualAssetCatalog } from '../src/content/VisualAssetCatalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('visual asset catalog has unique typed semantic IDs and resolvable hashed files', async () => {
  assert.equal(VISUAL_ASSETS.length, 366);
  assert.equal(new Set(VISUAL_ASSETS.map((asset) => asset.id)).size, VISUAL_ASSETS.length);
  for (const asset of VISUAL_ASSETS) {
    assert.match(asset.id, /^(mob|boss|item|icon|character)\.[a-z0-9-]+\.v\d+$/);
    assert.match(asset.src, /^\/assets\/runtime\/[a-z0-9-]+\.[a-f0-9]{12}\.webp$/);
    assert.equal(asset.provenance.license, 'project-owned-ai-generated');
    await access(path.join(ROOT, 'public', asset.src));
  }
});

test('catalog lookup enforces kind and canonical mappings resolve', () => {
  assert.equal(visualAsset('mob.fire-elemental.v1', 'mob')?.label, 'Fire Elemental');
  assert.equal(visualAsset('mob.fire-elemental.v1', 'boss'), null);
  for (const [entityId, assetId] of Object.entries(CANONICAL_VISUAL_ASSET_IDS)) {
    assert.ok(visualAsset(assetId), `${entityId} mapping must resolve`);
  }
});

test('compact authoring catalog omits runtime and provenance details', () => {
  const result = compactVisualAssetCatalog({ kinds: ['mob'], tags: ['shadow'], limit: 5 });
  assert.equal(result.length, 5);
  assert.ok(result.every((asset) => asset.kind === 'mob' && !Object.hasOwn(asset, 'src')));
  assert.ok(result[0].tags.includes('shadow'));
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
