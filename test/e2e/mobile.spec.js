import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

async function loginWithThreaded(page) {
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

async function expectNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function expectTouchTarget(locator, minimum = 44) {
  await expect(locator).toBeVisible();
  await expect.poll(async () => {
    const box = await locator.boundingBox();
    return box ? Math.min(box.width, box.height) : 0;
  }, { timeout: 5000 }).toBeGreaterThanOrEqual(minimum);
}

test('mobile play is one scaled thread with a simple contextual action budget and no competing game panels', async ({ page, context }) => {
  await loginWithThreaded(page);

  const log = page.getByTestId('adventure-stream-log');
  const local = page.getByTestId('stream-thread-local');
  await expect(log).toBeVisible();
  await expect(local).toBeVisible({ timeout: 5000 });
  await expect(local).toContainText('YOUR VIEW · PRIVATE CONTROLS');
  expect(await local.evaluate((node) => node.parentElement?.dataset.testid)).toBe('adventure-stream-log');

  await expect(page.getByTestId('mobile-game-nav')).toBeHidden();
  for (const selector of ['#character', '#party', '#dungeon', '#inventory', '#achievements', '#world', '#honey']) {
    await expect(page.locator(selector)).toBeHidden();
  }

  await expect(page.getByTestId('stream-message')).toHaveAttribute('placeholder', 'Message your party…');
  await expect(page.locator('.stream-hint')).toContainText('bottom card is private to you');
  await expectTouchTarget(local.getByRole('button', { name: 'Status' }), 44);
  await expectTouchTarget(local.getByRole('button', { name: 'Gear' }), 44);
  await expectNoHorizontalOverflow(page);

  const start = page.getByTestId('stream-start-dungeon');
  await expectTouchTarget(start, 44);
  expect(await start.evaluate((node) => Boolean(node.closest('[data-testid="adventure-stream-log"]')))).toBe(true);
  await start.click();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');

  const stateBefore = await dashboard(context);
  expect(stateBefore.activeRun?.enemy?.name).toBe('Frayed Wisp');
  const attack = page.getByTestId('stream-attack');
  const guard = page.getByTestId('stream-guard');
  await expectTouchTarget(attack, 44);
  await expect(guard).toBeHidden();
  expect(await attack.evaluate((node) => Boolean(node.closest('[data-testid="adventure-stream-log"]')))).toBe(true);
  await expect(page.getByTestId('combat-skill-panel')).toBeVisible({ timeout: 5000 });
  expect(await page.getByTestId('combat-skill-panel').evaluate((node) => Boolean(node.closest('[data-testid="adventure-stream-log"]')))).toBe(true);
  await expect(page.locator('.interaction-technique-hint')).toContainText('Techniques charge with Focus');
  await expect(page.getByTestId('stream-decision-snapshot')).toContainText(/YOU/i);
  await expect(page.getByTestId('stream-decision-snapshot')).toContainText(/Frayed Wisp/i);
  await expectNoHorizontalOverflow(page);

  const versionBeforeIdle = stateBefore.activeRun.version;
  await page.waitForTimeout(2300);
  expect((await dashboard(context)).activeRun.version).toBe(versionBeforeIdle);

  await attack.click();
  const result = page.getByTestId('stream-system-entry').filter({ hasText: /attacked Frayed Wisp/i }).last();
  await expect(result).toBeVisible();
  await expect(result).toContainText(/Frayed Wisp \d+\/12/);

  // The first Wisp attack creates an interruptible recovery telegraph. Only then should
  // the relevant reaction enter the mobile action budget; irrelevant Guard remains hidden.
  const interrupt = page.getByTestId('stream-interrupt');
  await expectTouchTarget(interrupt, 44);
  await expect(guard).toBeHidden();
  await expectNoHorizontalOverflow(page);

  await page.getByTestId('stream-message').fill('/status');
  await page.getByTestId('stream-send').click();
  const reply = page.getByTestId('stream-command-card');
  await expect(reply).toContainText('Current adventure');
  await expect(reply).toContainText('HP');
  expect(await reply.evaluate((node) => node.parentElement?.dataset.testid)).toBe('adventure-stream-log');

  await local.getByRole('button', { name: 'Gear' }).click();
  await expect(reply).toContainText('Relic pouch');
  expect(await reply.evaluate((node) => node.parentElement?.dataset.testid)).toBe('adventure-stream-log');
  await expectNoHorizontalOverflow(page);
});
