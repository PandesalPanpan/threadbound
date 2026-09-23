import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VISUAL_ASSETS, visualAsset } from '../public/visual-asset-catalog.js';
import { isModernCharacterAsset, modernCharacterAssets, resolveThreadboundCharacterVisual } from '../public/character-asset-policy.js';
import { CANONICAL_VISUAL_ASSET_IDS, compactVisualAssetCatalog } from '../src/content/VisualAssetCatalog.js';
import { FIGMA_CHARACTER_LIBRARY } from '../src/content/FigmaCharacterLibrary.js';
import { FIGMA_EQUIPMENT_LIBRARY, FIGMA_ITEM_LIBRARY } from '../src/content/FigmaItemLibrary.js';
import { itemSpriteFrame } from '../public/sprite-catalog.js';
import { resolveShellAsset } from '../frontend/src/shell/presentation.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('visual asset catalog has unique typed semantic IDs and resolvable hashed files', async () => {
  assert.equal(VISUAL_ASSETS.length, 764);
  assert.equal(new Set(VISUAL_ASSETS.map((asset) => asset.id)).size, VISUAL_ASSETS.length);
  for (const asset of VISUAL_ASSETS) {
    assert.match(asset.id, /^(mob|boss|item|icon|character)\.[a-z0-9-]+\.v\d+$/);
    assert.match(asset.src, /^\/assets\/runtime\/[a-z0-9-]+\.[a-f0-9]{12}\.webp$/);
    assert.ok(['project-owned-ai-generated', 'project-owned-figma-export'].includes(asset.provenance.license));
    await access(path.join(ROOT, 'public', asset.src));
  }
});

test('Figma item library imports 240 official sources and preserves legacy IDs', async () => {
  const sourceDirectory = path.join(ROOT, 'public', 'assets', 'generated', 'figma-item-library', 'v1');
  const sourceFiles = (await readdir(sourceDirectory)).filter((name) => name.endsWith('.svg'));
  const imported = VISUAL_ASSETS.filter((asset) => asset.provenance?.sourceCollection === 'figma-item-library-v1');
  assert.equal(FIGMA_ITEM_LIBRARY.length, 240);
  assert.equal(FIGMA_EQUIPMENT_LIBRARY.length, 156);
  assert.equal(sourceFiles.length, FIGMA_ITEM_LIBRARY.length);
  assert.equal(new Set(FIGMA_ITEM_LIBRARY.map((source) => source.sourceNodeId)).size, FIGMA_ITEM_LIBRARY.length);
  assert.equal(new Set(FIGMA_ITEM_LIBRARY.map((source) => source.sourceFilename)).size, FIGMA_ITEM_LIBRARY.length);
  assert.equal(imported.length, FIGMA_ITEM_LIBRARY.length);
  for (const source of FIGMA_ITEM_LIBRARY) {
    assert.ok(sourceFiles.includes(source.sourceFilename), source.sourceFilename);
    const svg = await readFile(path.join(sourceDirectory, source.sourceFilename), 'utf8');
    assert.match(svg, /<svg[^>]*viewBox=/);
    assert.doesNotMatch(svg, /<image\b|<foreignObject\b/);
    const asset = visualAsset(source.visualAssetId, 'item');
    assert.equal(asset?.label, source.label);
    assert.equal(asset?.provenance?.sourceNodeId, source.sourceNodeId);
    assert.equal(asset?.provenance?.sourceFigmaFileKey, 'xfAbc94dv0LxhxhC9q9BhK');
    assert.equal(asset?.sourceMaster?.file, `public/assets/generated/figma-item-library/v1/${source.sourceFilename}`);
  }

  assert.equal(visualAsset('item.wood-sword.v1')?.provenance?.license, 'project-owned-ai-generated');
  assert.equal(visualAsset('item.gold-coin.v1')?.provenance?.license, 'project-owned-ai-generated');
  assert.equal(visualAsset('item.gold-coin.v2')?.provenance?.sourceCollection, 'figma-item-library-v1');
  assert.equal(visualAsset('item.quest-scroll.v1')?.provenance?.license, 'project-owned-ai-generated');
  assert.equal(visualAsset('item.quest-scroll.v2')?.provenance?.sourceCollection, 'figma-item-library-v1');
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

test('legacy Needle and dagger item names resolve to an official semantic item asset', () => {
  const inferred = itemSpriteFrame({ id: 'legacy-needle', name: 'Old Needle' });
  assert.equal(inferred.type, 'visual-asset');
  assert.equal(inferred.visualAssetId, 'item.violet-needle.v1');
  assert.equal(itemSpriteFrame({ visualAssetId: 'item.iron-sword.v1', name: 'Iron Sword' }).visualAssetId, 'item.ashbite-sword.v1');
  assert.equal(itemSpriteFrame({ visualAssetId: 'item.steel-sword.v1', name: 'Steel Sword' }).visualAssetId, 'item.threadsteel-longsword.v1');
  assert.equal(itemSpriteFrame({ visualAssetId: 'item.iron-dagger.v1', name: 'Iron Dagger' }).visualAssetId, 'item.bonewhite-dagger.v1');
  assert.equal(itemSpriteFrame({ visualAssetId: 'item.bronze-wardblade.v1', name: 'Bronze Sword' }).visualAssetId, 'item.bronze-wardblade.v1');
  assert.equal(itemSpriteFrame({ title: 'A Lost Needle', name: 'Old Needle' }).visualAssetId, 'item.violet-needle.v1');
  assert.equal(resolveShellAsset({ visualAssetId: 'item.iron-sword.v1' }, VISUAL_ASSETS, ['item'])?.id, 'item.ashbite-sword.v1');
  assert.equal(resolveShellAsset({ title: 'Old Needle' }, VISUAL_ASSETS, ['item'])?.id, 'item.violet-needle.v1');
});

test('legacy item aliases retain their object family across React and sprite renderers', () => {
  const cases = [
    ['item.iron-helmet.v1', 'item.bonecrest-helm.v1'],
    ['item.silver-medallion.v1', 'item.goldleaf-charm.v1'],
    ['item.mana-potion.v1', 'item.mana-vial.v1'],
    ['item.quest-scroll.v1', 'item.quest-scroll.v2'],
    ['item.gold-coin.v1', 'item.gold-coin.v2'],
    ['item.iron-treasure-chest.v1', 'item.ancient-relic.v1'],
    ['unknown-legacy-object', 'item.ancient-relic.v1'],
  ];
  for (const [legacyId, expectedId] of cases) {
    const entity = { visualAssetId: legacyId, id: legacyId };
    assert.equal(itemSpriteFrame(entity).visualAssetId, expectedId, `sprite resolver: ${legacyId}`);
    assert.equal(resolveShellAsset(entity, VISUAL_ASSETS, ['item'])?.id, expectedId, `React resolver: ${legacyId}`);
    assert.equal(visualAsset(expectedId, 'item')?.provenance?.sourceCollection, 'figma-item-library-v1');
  }
});

test('name-only items prefer an exact official Figma label over broad family fallbacks', () => {
  const cases = [
    ['Threadsteel Longsword', 'item.threadsteel-longsword.v1'],
    ['Bronze Wardblade', 'item.bronze-wardblade.v1'],
    ['Ironroot Cuirass', 'item.ironroot-cuirass.v1'],
  ];
  for (const [name, expectedId] of cases) {
    assert.equal(itemSpriteFrame({ name }).visualAssetId, expectedId, `sprite resolver: ${name}`);
    assert.equal(resolveShellAsset({ name }, VISUAL_ASSETS, ['item'])?.id, expectedId, `React resolver: ${name}`);
    assert.equal(visualAsset(expectedId, 'item')?.provenance?.sourceCollection, 'figma-item-library-v1');
  }
});

test('current living-character policy excludes first-generation Figma art and resolves legacy identities into the library', () => {
  assert.equal(modernCharacterAssets('character').length, 42);
  assert.equal(modernCharacterAssets('mob').length, 100);
  assert.equal(modernCharacterAssets('boss').length, 10);
  assert.equal(isModernCharacterAsset(visualAsset('character.rune-bard-figma.v1'), 'character'), false);
  assert.equal(isModernCharacterAsset(visualAsset('mob.rot-toad-figma.v1'), 'mob'), false);
  assert.equal(resolveThreadboundCharacterVisual({ id: 'thread-wolf', visualAssetId: 'mob.gray-wolf.v1' }, 'mob')?.id, 'mob.ridge-wolf.v1');
  assert.equal(resolveThreadboundCharacterVisual({ id: 'first-needle', visualAssetId: 'boss.void-knight.v1' }, 'boss')?.id, 'boss.black-banner-captain.v1');
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
