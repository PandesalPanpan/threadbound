import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('Arc Workshop previews and validates a vNext world package clearly', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('local-login-b').click();
  await page.goto('/arc-workshop');
  await expect(page).toHaveURL(/\/arc-workshop$/);
  await expect(page.getByRole('heading', { name: 'Arc Workshop' })).toBeVisible();

  const worldContextResponse = await page.request.get('/api/arc-workshop/context');
  expect(worldContextResponse.ok()).toBe(true);
  const worldContext = await worldContextResponse.json();
  expect(worldContext.visualAssetCatalog.collections.characters.some((asset) => asset.id === 'character.road-sellsword.v1' && asset.role === 'Wandering Blade')).toBe(true);
  expect(worldContext.visualAssetCatalog.collections.mobs.some((asset) => asset.label === 'Field Mouse' && asset.family === 'rodent')).toBe(true);
  expect(worldContext.visualAssetCatalog.collections.bosses.some((asset) => asset.label === 'Watcher Prime' && asset.boardCategory === 'elite')).toBe(true);
  expect(worldContext.visualAssetCatalog.collections.mobs.every((asset) => !Object.hasOwn(asset, 'src') && !Object.hasOwn(asset, 'provenance'))).toBe(true);
  expect(worldContext.generationRules.some((rule) => /family and board category/i.test(rule))).toBe(true);

  const catalogResponse = await page.request.get('/api/arc-workshop/visual-assets');
  expect(catalogResponse.ok()).toBe(true);
  const catalog = await catalogResponse.json();
  expect(catalog.assets.find((asset) => asset.id === 'mob.field-mouse.v1')).toMatchObject({ family: 'rodent', boardCategory: 'common-mob' });

  await page.getByTestId('manifest-file').setInputFiles('examples/arc-manifest-vnext.example.json');

  const preview = page.getByTestId('manifest-preview');
  await expect(page.getByTestId('manifest-version')).toHaveText('v2 · world package');
  await expect(preview).toContainText('Sunpetal Crossing');
  await expect(preview).toContainText('World package');

  const world = page.getByTestId('vnext-world-preview');
  await expect(world).toContainText('1Areas');
  await expect(world).toContainText('1Towns');
  await expect(world).toContainText('1NPCs');
  await expect(world).toContainText('1Quests');
  await expect(world).toContainText('1Shops');
  await expect(world).toContainText('2Recipes');
  await expect(world).toContainText('1Progression challenges');
  await expect(world).toContainText('Sunpetal Road');
  await expect(world).toContainText('Petalrest');
  await expect(world).toContainText('Mina');
  await expect(world).toContainText('Meet the Smith');
  await expect(world).toContainText('Petalrest Outfitters');
  await expect(world).toContainText('Helm Forging');
  await expect(world).toContainText('Petal Stew');
  await expect(world).toContainText('sunpetal-gate');
  await expect(world).toContainText('revalidated server-side');

  await page.getByTestId('validate-manifest').click();
  const validation = page.getByTestId('validation-result');
  await expect(validation).toContainText('Manifest is valid');
  await expect(validation).toContainText('v2 · world package');
  await expect(validation).toContainText('0 errors');
  await expect(page.getByTestId('save-manifest')).toBeEnabled();

  const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(bodyWidth).toBeLessThanOrEqual(390);
  await mkdir('ux-review', { recursive: true });
  await page.screenshot({ path: 'ux-review/arc-workshop-vnext-mobile.png', fullPage: true });

  await world.locator('details').locator('summary').click();
  await expect(world).toContainText('Shop stocks (1)');
  await expect(world).toContainText('Crafting recipes (1)');
  await expect(world).toContainText('Cooking recipes (1)');
  await expect(world).toContainText('Dungeons (1)');
  await expect(world).toContainText('Enemies (1)');
  await expect(world).toContainText('Bosses (1)');
  await expect(world).toContainText('Item pools (1)');
  await expect(world).toContainText('Equipment templates (2)');
  await expect(world).toContainText('Lore (0)');
  await expect(world).toContainText('Achievements (0)');
  await expect(world).toContainText('Historical consequences (0)');
  await page.screenshot({ path: 'ux-review/arc-workshop-vnext-expanded-mobile.png', fullPage: true });

  await page.getByTestId('save-manifest').click();
  const savedStatus = page.getByTestId('workshop-status');
  await expect(savedStatus).toContainText(/Saved Sunpetal Crossing revision \d+ as a draft/);
  const revisionMatch = (await savedStatus.textContent())?.match(/revision (\d+)/);
  expect(revisionMatch).not.toBeNull();
  const revision = revisionMatch[1];
  const list = page.getByTestId('manifest-list');
  await expect(list).toContainText('Sunpetal Crossing');
  await expect(list).toContainText('draft');
  await expect(list).toContainText('v2 · world package');
  const savedDraft = list.locator('.manifest-row')
    .filter({ hasText: 'Sunpetal Crossing' })
    .filter({ hasText: `revision ${revision}` })
    .first();

  await savedDraft.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByTestId('workshop-status')).toContainText(`Published Sunpetal Crossing revision ${revision}`);

  await page.getByTestId('nav-game').click();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  const areaResponse = await page.request.get('/api/areas');
  expect(areaResponse.ok()).toBe(true);
  const areaPayload = await areaResponse.json();
  const authoredTown = areaPayload.area.towns.find((town) => town.id === 'petalrest');
  expect(authoredTown?.npcs[0]).toMatchObject({ visualAssetId: 'character.road-sellsword.v1' });

  await page.getByTestId('stream-message').fill('town');
  await page.getByTestId('stream-send').click();
  await expect(page.getByTestId('town-npc-sprite-mina-smith')).toHaveAttribute('data-visual-asset-id', 'character.road-sellsword.v1');
  await page.screenshot({ path: 'ux-review/figma-character-library-town-mobile.png', fullPage: true });
  await page.getByTestId('town-npc-mina-smith').screenshot({ path: 'ux-review/figma-character-library-town-npc-mobile.png' });

  const startResponse = await page.request.post('/api/dungeons/sunpetal-trial/start-simple');
  expect(startResponse.status()).toBe(201);
  await page.reload();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  await expect(page.getByTestId('simple-dungeon-enemy-sprite')).toHaveAttribute('data-visual-asset-id', 'mob.field-mouse.v1');
  await page.screenshot({ path: 'ux-review/figma-character-library-battle-mobile.png', fullPage: true });

  await page.goto('/codex');
  await expect(page.getByTestId('codex-status')).not.toHaveText('Loading…');
  await page.getByTestId('codex-search').fill('Bellfield Mouse');
  const mouse = page.locator('[data-testid="codex-entry"][data-entry-id="petal-wisp"]');
  await expect(mouse).toBeVisible();
  await mouse.click();
  await expect(page.getByTestId('codex-detail-art')).toHaveAttribute('data-visual-asset-id', 'mob.field-mouse.v1');
  await page.screenshot({ path: 'ux-review/figma-character-library-codex-mobile.png', fullPage: true });
});

test('Brightbell Bloom full Arc stays readable and saves only as a validated draft on mobile', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('local-login-a').click();
  await page.goto('/arc-workshop');

  await page.getByTestId('manifest-file').setInputFiles('content/arcs/brightbell-bloom.arc-manifest.json');

  const preview = page.getByTestId('manifest-preview');
  const world = page.getByTestId('vnext-world-preview');
  await expect(page.getByTestId('manifest-version')).toHaveText('v2 · world package');
  await expect(preview).toContainText('The Brightbell Bloom');
  await expect(world).toContainText('3Areas');
  await expect(world).toContainText('2Towns');
  await expect(world).toContainText('10NPCs');
  await expect(world).toContainText('12Quests');
  await expect(world).toContainText('2Shops');
  await expect(world).toContainText('6Recipes');
  await expect(world).toContainText('3Progression challenges');
  await expect(world).toContainText('Bellbloom Meadows');
  await expect(world).toContainText('Emberglass Orchard');
  await expect(world).toContainText('Kitewind Heights');
  await expect(world).toContainText('Bellbloom');
  await expect(world).toContainText('Kitewatch');
  await expect(world).toContainText('Mae Bramble');
  await expect(world).toContainText('Restore the Duet');

  await page.getByTestId('validate-manifest').click();
  const validation = page.getByTestId('validation-result');
  await expect(validation).toContainText('Manifest is valid');
  await expect(validation).toContainText('0 errors');
  await expect(page.getByTestId('save-manifest')).toBeEnabled();

  const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(bodyWidth).toBeLessThanOrEqual(390);
  await mkdir('ux-review', { recursive: true });
  await page.screenshot({ path: 'ux-review/brightbell-bloom-workshop-mobile.png', fullPage: true });

  await world.locator('details').locator('summary').click();
  await expect(world).toContainText('Shop stocks (2)');
  await expect(world).toContainText('Crafting recipes (3)');
  await expect(world).toContainText('Cooking recipes (3)');
  await expect(world).toContainText('Dungeons (3)');
  await expect(world).toContainText('Enemies (12)');
  await expect(world).toContainText('Bosses (3)');
  await expect(world).toContainText('Item pools (3)');
  await expect(world).toContainText('Equipment templates (21)');
  await expect(world).toContainText('Lore (5)');
  await expect(world).toContainText('Achievements (6)');
  await expect(world).toContainText('Historical consequences (2)');

  await page.getByTestId('save-manifest').click();
  await expect(page.getByTestId('workshop-status')).toContainText(/Saved The Brightbell Bloom revision \d+ as a draft/);
  const list = page.getByTestId('manifest-list');
  await expect(list).toContainText('The Brightbell Bloom');
  await expect(list).toContainText('draft');
  await expect(list).toContainText('v2 · world package');
});
