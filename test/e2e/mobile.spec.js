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

test('mobile combat is tap-first, message-driven, and never auto-attacks', async ({ page }) => {
  await loginWithThreaded(page);

  await expect(page.getByTestId('mobile-game-nav')).toBeVisible();
  await expect(page.getByTestId('stream-suggestions')).toBeVisible();
  await expect(page.getByTestId('stream-meta-actions')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('stream-message')).toHaveAttribute('placeholder', 'Message your party…');
  await expect(page.locator('.stream-hint')).toContainText('result of every action');
  await expectTouchTarget(page.getByTestId('stream-meta-actions').getByRole('button', { name: 'Status' }), 44);
  await expectTouchTarget(page.getByTestId('stream-meta-actions').getByRole('button', { name: 'Gear' }), 44);
  await expectNoHorizontalOverflow(page);

  for (const label of ['Play', 'Gear', 'Party', 'World', 'Codex']) {
    await expectTouchTarget(page.getByTestId('mobile-game-nav').getByText(label).locator('..'));
  }

  const start = page.getByTestId('stream-start-dungeon');
  await expectTouchTarget(start, 44);
  await start.click();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');

  await expect(page.getByTestId('enemy-card')).toBeVisible();
  await expect(page.getByTestId('enemy-card').locator('img[src="/sprites/kenney/frayed-wisp.png"]')).toBeVisible();
  await expect(page.getByTestId('stream-combat-dock')).toBeHidden();
  const attack = page.getByTestId('stream-attack');
  const guard = page.getByTestId('stream-guard');
  await expectTouchTarget(attack, 44);
  await expectTouchTarget(guard, 44);

  await expect(page.getByTestId('combat-actions')).toBeHidden();
  await expect(page.getByTestId('auto-attack-status')).toBeHidden();
  await expect(page.getByTestId('attack')).toBeHidden();
  await expect(page.getByTestId('guard')).toBeHidden();
  await expect(page.getByTestId('combat-coach')).toContainText('Nothing attacks automatically');
  await expectNoHorizontalOverflow(page);

  const enemyBeforeIdle = await page.getByTestId('enemy-card').textContent();
  await page.waitForTimeout(2300);
  await expect(page.getByTestId('enemy-card')).toHaveText(enemyBeforeIdle);

  await attack.click();
  const result = page.getByTestId('stream-system-entry').filter({ hasText: /attacked Frayed Wisp/i }).last();
  await expect(result).toBeVisible();
  await expect(result).toContainText(/Frayed Wisp \d+\/12/);
  await expect.poll(async () => page.getByTestId('enemy-card').textContent(), { timeout: 5000 }).not.toBe(enemyBeforeIdle);

  await page.getByTestId('stream-message').fill('/status');
  await page.getByTestId('stream-send').click();
  await expect(page.getByTestId('stream-command-card')).toContainText('Current adventure');
  await expect(page.getByTestId('stream-command-card')).toContainText('HP');
  await expect(page.getByTestId('run-state')).toContainText('Phase: combat');
});
