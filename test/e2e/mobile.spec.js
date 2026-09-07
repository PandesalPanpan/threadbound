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
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeGreaterThanOrEqual(minimum);
  expect(box.height).toBeGreaterThanOrEqual(minimum);
}

test('mobile player shell is touch-friendly and combat-first', async ({ page }) => {
  await loginWithThreaded(page);

  await expect(page.getByTestId('mobile-game-nav')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  for (const label of ['Play', 'Gear', 'Party', 'World', 'Codex']) {
    await expectTouchTarget(page.getByTestId('mobile-game-nav').getByText(label).locator('..'));
  }

  const start = page.getByTestId('start-dungeon');
  await expect(start).toBeVisible();
  await expectTouchTarget(start, 48);
  await start.click();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');

  await expect(page.getByTestId('enemy-card')).toBeVisible();
  await expect(page.getByTestId('combat-actions')).toBeVisible();
  await expectTouchTarget(page.getByTestId('attack'), 48);
  await expectTouchTarget(page.getByTestId('guard'), 48);
  await expectNoHorizontalOverflow(page);

  await page.getByTestId('attack').click();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  await expect(page.getByTestId('run-state')).toContainText('Phase: combat');
});
