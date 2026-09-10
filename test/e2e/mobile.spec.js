import { test, expect } from '@playwright/test';

test.use({
  viewport: { width:390, height:844 },
  hasTouch: true,
  isMobile: true,
});

async function loginWithThreaded(page) {
  await page.goto('/');
  await page.getByRole('link', { name:'Connect with Threaded' }).click();
  await expect(page.getByRole('heading', { name:'Fake Threaded' })).toBeVisible();
  await page.getByRole('button', { name:'Authorize Threadbound' }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
}

async function dashboard(context) {
  const response = await context.request.get('/api/dashboard');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function expectNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth:document.documentElement.scrollWidth,
    clientWidth:document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function expectTouchTarget(locator, minimum = 40) {
  await expect(locator).toBeVisible();
  await expect.poll(async () => {
    const box = await locator.boundingBox();
    return box ? Math.min(box.width, box.height) : 0;
  }, { timeout:7000 }).toBeGreaterThanOrEqual(minimum);
}

test('mobile play gives the conversation most of the screen and keeps only compact contextual controls', async ({ page, context }) => {
  await loginWithThreaded(page);

  const log = page.getByTestId('adventure-stream-log');
  const local = page.getByTestId('stream-thread-local');
  await expect(log).toBeVisible();
  await expect(local).toBeVisible({ timeout:7000 });
  expect(await local.evaluate((node) => node.parentElement?.dataset.testid)).toBe('thread-action-dock');
  await expect(page.locator('.stream-hint')).toBeHidden();
  await expect(page.getByTestId('thread-game-header')).toBeVisible();
  await expect(page.getByTestId('thread-game-location')).toHaveText('Choose a dungeon to begin');

  const logBox = await log.boundingBox();
  expect(logBox?.height || 0).toBeGreaterThan(560);
  expect((logBox?.height || 0) / 844).toBeGreaterThan(0.65);

  await expect(page.getByTestId('mobile-game-nav')).toBeHidden();
  for (const selector of ['#character','#party','#dungeon','#inventory','#achievements','#world','#honey']) {
    await expect(page.locator(selector)).toBeHidden();
  }
  await expect(page.getByTestId('stream-message')).toHaveAttribute('placeholder', 'Message party or /command…');

  // Utility navigation is available through slash commands without occupying the dock.
  await expect(local.getByTestId('stream-meta-actions')).toBeHidden();
  await expectNoHorizontalOverflow(page);

  const start = local.getByTestId('stream-start-dungeon');
  await expectTouchTarget(start, 32);
  await start.click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.phase, { timeout:7000 }).toBe('combat');

  const stateBefore = await dashboard(context);
  expect(stateBefore.activeRun?.enemy?.name).toBe('Frayed Wisp');
  expect(stateBefore.activeRun.streamlinedLoop).toBe(true);
  expect(stateBefore.activeRun.runEventSchedule).toBeNull();
  expect(stateBefore.activeRun.runUpgradeOfferIds).toEqual([]);

  const attack = local.getByTestId('stream-attack');
  const guard = local.getByTestId('stream-guard');
  await expectTouchTarget(attack, 32);
  await expectTouchTarget(guard, 32);
  await expectTouchTarget(local.getByTestId('stream-item'), 32);
  await expect(local.getByTestId('combat-skill-panel')).toBeVisible({ timeout:7000 });
  await expect(page.getByTestId('thread-game-location')).toContainText(/Frayed Hollow · Fight 1/i);
  await expect(page.getByTestId('thread-game-player-hp')).toHaveText(/\d+ \/ \d+ HP/);
  await expect(page.getByTestId('stream-build-summary')).toBeHidden();
  await expect(page.getByTestId('stream-action-forecast')).toBeHidden();
  await expectNoHorizontalOverflow(page);

  // The game does not progress while the player simply reads or chats.
  const versionBeforeIdle = stateBefore.activeRun.version;
  await page.waitForTimeout(1000);
  expect((await dashboard(context)).activeRun.version).toBe(versionBeforeIdle);

  await attack.click();
  await expect.poll(async () => (await dashboard(context)).activeRun.version, { timeout:7000 }).toBeGreaterThan(versionBeforeIdle);
  const result = page.getByTestId('stream-system-entry').filter({ hasText:/attacked Frayed Wisp/i }).last();
  await expect(result).toBeVisible({ timeout:7000 });

  // Relevant reaction enters the small action budget; irrelevant Guard stays absent.
  const interrupt = local.getByTestId('stream-interrupt');
  await expectTouchTarget(interrupt, 32);
  await expect(guard).toBeHidden();
  await expectNoHorizontalOverflow(page);

  await page.getByTestId('stream-message').fill('/status');
  await page.getByTestId('stream-send').click();
  const reply = page.getByTestId('stream-command-card');
  await expect(reply).toContainText('Current adventure');
  expect(await reply.evaluate((node) => node.parentElement?.dataset.testid)).toBe('adventure-stream-log');

  await page.getByTestId('stream-message').fill('/item');
  await page.getByTestId('stream-send').click();
  await expect(reply).toContainText('Relic pouch');
  expect(await reply.evaluate((node) => node.parentElement?.dataset.testid)).toBe('adventure-stream-log');
  await expectNoHorizontalOverflow(page);
});
