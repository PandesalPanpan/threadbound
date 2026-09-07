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

test('mobile player shell is touch-friendly and chat-first during combat', async ({ page }) => {
  await loginWithThreaded(page);

  await expect(page.getByTestId('mobile-game-nav')).toBeVisible();
  await expect(page.getByTestId('stream-suggestions')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  for (const label of ['Play', 'Gear', 'Party', 'World', 'Codex']) {
    await expectTouchTarget(page.getByTestId('mobile-game-nav').getByText(label).locator('..'));
  }

  const start = page.getByTestId('stream-start-dungeon');
  await expectTouchTarget(start, 44);
  await start.click();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');

  await expect(page.getByTestId('enemy-card')).toBeVisible();
  await expect(page.getByTestId('stream-combat-dock')).toBeVisible();
  await expect(page.getByTestId('stream-combat-actions')).toBeVisible();
  await expect(page.getByTestId('stream-combat-status')).toContainText('Auto Strike ON');
  await expect(page.getByTestId('stream-combat-dock').locator('img[src="/sprites/frayed-wisp.svg"]')).toBeVisible();
  await expectTouchTarget(page.locator('[data-testid="stream-guard"]:visible').first(), 44);
  await expectTouchTarget(page.locator('[data-testid="stream-attack"]:visible').first(), 44);

  // The expedition card remains the authoritative state projection, but its duplicate
  // action controls stay out of the way so the thread is the interaction surface.
  await expect(page.getByTestId('combat-actions')).toBeHidden();
  await expect(page.getByTestId('auto-attack-status')).toBeHidden();
  await expect(page.getByTestId('attack')).toBeHidden();
  await expect(page.getByTestId('guard')).toBeHidden();
  await expectNoHorizontalOverflow(page);

  await page.getByTestId('stream-message').fill('/status');
  await page.getByTestId('stream-send').click();
  await expect(page.getByTestId('stream-command-card')).toContainText('Current adventure');
  await expect(page.getByTestId('stream-command-card')).toContainText('HP');

  const enemyBefore = await page.getByTestId('enemy-card').textContent();
  await expect.poll(async () => page.getByTestId('enemy-card').textContent(), { timeout: 5000 }).not.toBe(enemyBefore);
  await expect(page.getByTestId('combat-feedback')).toBeVisible();
  await expect(page.getByTestId('run-state')).toContainText('Phase: combat');
});