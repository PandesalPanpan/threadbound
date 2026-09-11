import { copyFileSync, mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const REVIEW_DIR = 'ux-review';

function preserveSpriteAtlases() {
  mkdirSync(REVIEW_DIR, { recursive: true });
  for (const name of [
    'threadbound-male-characters-v1.svg',
    'threadbound-female-characters-v1.svg',
    'threadbound-enemies-v1.svg',
  ]) copyFileSync(`public/assets/generated/${name}`, `${REVIEW_DIR}/${name}`);
}

async function expectVisibleAtlasFrame(sprite) {
  const metrics = await sprite.evaluate(async (element) => {
    const atlasLayouts = {
      'male-weavers-v1': { columns: 8, rows: 1 },
      'female-weavers-v1': { columns: 8, rows: 1 },
      'enemies-v1': { columns: 8, rows: 2 },
    };
    const atlasId = element.dataset.spriteAtlas;
    const layout = atlasLayouts[atlasId];
    const frameIndex = Number(element.dataset.spriteFrame);
    const style = getComputedStyle(element);
    const imageMatch = style.backgroundImage.match(/^url\(["']?(.*?)["']?\)$/);
    const rect = element.getBoundingClientRect();
    if (!layout || !Number.isInteger(frameIndex) || !imageMatch) {
      return { visible: false, uniqueColors: 0, channelRange: 0, width: rect.width, height: rect.height };
    }

    const response = await fetch(imageMatch[1]);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const image = await new Promise((resolve, reject) => {
      const candidate = new Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () => reject(new Error(`Could not decode sprite atlas ${atlasId}`));
      candidate.src = objectUrl;
    });
    const frameWidth = image.naturalWidth / layout.columns;
    const frameHeight = image.naturalHeight / layout.rows;
    const column = frameIndex % layout.columns;
    const row = Math.floor(frameIndex / layout.columns);
    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 48;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(
      image,
      column * frameWidth,
      row * frameHeight,
      frameWidth,
      frameHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    URL.revokeObjectURL(objectUrl);

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    let minChannel = 255;
    let maxChannel = 0;
    let opaquePixels = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (pixels[offset + 3] < 24) continue;
      opaquePixels += 1;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      colors.add(`${r >> 4}:${g >> 4}:${b >> 4}`);
      minChannel = Math.min(minChannel, r, g, b);
      maxChannel = Math.max(maxChannel, r, g, b);
    }

    return {
      visible: rect.width >= 20 && rect.height >= 20 && style.backgroundImage !== 'none',
      uniqueColors: colors.size,
      channelRange: maxChannel - minChannel,
      opaqueRatio: opaquePixels / (canvas.width * canvas.height),
      width: rect.width,
      height: rect.height,
    };
  });

  expect(metrics.visible).toBe(true);
  expect(metrics.opaqueRatio).toBeGreaterThan(0.02);
  expect(metrics.uniqueColors).toBeGreaterThan(8);
  expect(metrics.channelRange).toBeGreaterThan(20);
}

async function login(page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Connect with Threaded' }).click();
  await expect(page.getByRole('heading', { name: 'Fake Threaded' })).toBeVisible();
  await page.getByRole('button', { name: 'Authorize Threadbound' }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
}

async function dashboard(context) {
  const response = await context.request.get('/api/dashboard');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function screenshot(page, name) {
  mkdirSync(REVIEW_DIR, { recursive: true });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${REVIEW_DIR}/${name}.png`, fullPage: true });
}

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('new player loop is a Figma-minimal Hunt -> gear -> hard attack-only dungeon chat', async ({ page, context }) => {
  preserveSpriteAtlases();
  await login(page);

  const hunt = page.locator('.simple-loop-action[data-testid="stream-hunt"]');
  const dungeon = page.locator('.simple-loop-action[data-testid="stream-start-dungeon"]');
  await expect(hunt).toBeVisible({ timeout: 5000 });
  await expect(dungeon).toBeVisible();
  await expect(page.locator('.simple-loop-action')).toHaveCount(2);
  await expect(page.getByTestId('stream-guard')).toHaveCount(0);
  await expect(page.getByTestId('stream-interrupt')).toHaveCount(0);
  await expect(page.getByTestId('combat-skill-panel')).toHaveCount(0);
  await expect(page.getByTestId('stream-message')).toHaveAttribute('placeholder', 'Message party or type hunt…');
  await expect(page.locator('#character')).toBeHidden();
  await expect(page.locator('#dungeon')).toBeHidden();
  await expect(page.locator('.stream-heading')).toBeHidden();
  await expect(page.getByText(/PRIVATE THREAD REPLY/i)).toHaveCount(0);

  const initial = await dashboard(context);
  expect(initial.character.attackPower).toBe(6);
  expect(initial.simpleLoop.dungeonReadiness[0].recommendedAttack).toBe(9);
  await expect(dungeon).toContainText('6/9');

  await hunt.click();
  const huntReceipt = page.getByTestId('stream-system-entry').filter({ hasText: /found and killed/i }).last();
  await expect(huntReceipt).toBeVisible({ timeout: 5000 });
  await expect(huntReceipt).toContainText('Thread Dust');
  await expect(huntReceipt).toContainText(/remaining HP is \d+\/40/);
  await expect(huntReceipt.locator('.stream-app-badge')).toHaveText('APP');
  const huntSprite = huntReceipt.getByTestId('stream-hunt-sprite');
  await expect(huntSprite).toBeVisible({ timeout: 5000 });
  await expect(huntSprite).toHaveAttribute('data-sprite-atlas', 'enemies-v1');
  await expectVisibleAtlasFrame(huntSprite);
  const afterHunt = await dashboard(context);
  expect(afterHunt.character.threadDust).toBeGreaterThan(0);
  await screenshot(page, 'simple-loop-hunt');

  await dungeon.click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.simpleCombat || false, { timeout: 5000 }).toBe(true);
  const run = await dashboard(context);
  expect(run.activeRun.enemy.maxHp).toBe(24);
  expect(run.runUpgrades).toEqual([]);
  expect(run.combatSkills).toEqual([]);
  expect(run.actionPreviews).toBeNull();
  expect(run.activeRun.enemyIntent).toBeNull();

  const attack = page.locator('.simple-loop-action[data-testid="stream-attack"]');
  await expect(attack).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.simple-loop-action')).toHaveCount(1);
  await expect(page.getByTestId('stream-hunt')).toHaveCount(0);
  await expect(page.getByTestId('stream-message')).toHaveAttribute('placeholder', 'Message party or /attack…');

  const hpBefore = run.activeRun.enemy.hp;
  await attack.click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.enemy?.hp ?? -1, { timeout: 5000 }).not.toBe(hpBefore);
  const afterAttack = await dashboard(context);
  expect(afterAttack.activeRun.enemyIntent).toBeNull();
  expect(afterAttack.activeRun.viewer.focus).toBe(0);
  expect(afterAttack.activeRun.selectedUpgrades).toEqual([]);

  const generatedWeaver = page.getByTestId('stream-generated-weaver-sprite').last();
  const generatedEnemy = page.getByTestId('stream-generated-enemy-sprite').last();
  await expect(generatedWeaver).toBeVisible({ timeout: 5000 });
  await expect(generatedWeaver).toHaveAttribute('data-sprite-atlas', 'male-weavers-v1');
  await expectVisibleAtlasFrame(generatedWeaver);
  await expect(generatedEnemy).toBeVisible();
  await expect(generatedEnemy).toHaveAttribute('data-sprite-atlas', 'enemies-v1');
  await expectVisibleAtlasFrame(generatedEnemy);

  await page.getByTestId('stream-message').fill('/guard');
  await page.getByTestId('stream-send').click();
  await expect(page.getByTestId('stream-error')).toContainText('uses /attack only');
  await screenshot(page, 'simple-loop-dungeon');
});

test('Gear and wiki Codex stay one tap away without adding extra play-surface controls', async ({ page }) => {
  await login(page);

  const bottomNav = page.getByTestId('mobile-game-nav');
  await expect(bottomNav).toBeVisible();
  await bottomNav.getByText('Gear', { exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-game-view', 'gear');
  await expect(page.locator('#inventory')).toBeVisible();

  await bottomNav.getByText('Codex', { exact: true }).click();
  await expect(page).toHaveURL(/\/codex(?:#|$)/);
  await expect(page.getByTestId('codex-search')).toBeVisible();
  await expect(page.getByTestId('codex-detail')).toBeVisible();
  await expect(page.locator('.wiki-breadcrumbs')).toBeVisible();
  await expect(page.locator('.wiki-infobox')).toBeVisible();
  await screenshot(page, 'simple-loop-codex');
});
