import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

async function runCommand(page, command) {
  const input = page.getByTestId('stream-message');
  await input.fill(command);
  await input.press('Enter');
  const card = page.getByTestId('stream-command-card');
  await expect(card).toBeVisible();
  return card;
}

test('mobile stream command panels share one reusable rich-card contract', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('local-login-a').click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');

  const status = await runCommand(page, 'status');
  await expect(status).toHaveClass(/rich-chat-card/);
  await expect(status).toHaveAttribute('data-rich-card-kind', 'status');
  await expect(status).toHaveAttribute('role', 'region');
  await expect(status).toHaveAttribute('aria-label', /Current adventure panel/i);
  await expect(status.locator('.rich-chat-card-header')).toHaveCount(1);
  await expect(status.locator('[data-rich-card-dismiss="true"]')).toHaveCount(1);

  const shop = await runCommand(page, 'shop');
  await expect(shop).toHaveAttribute('data-rich-card-kind', 'shop');
  await expect(shop.locator('.rich-chat-card-header')).toHaveCount(1);
  const actions = shop.locator('[data-rich-card-action="true"]');
  await expect(actions).not.toHaveCount(0);
  const firstActionBox = await actions.first().boundingBox();
  expect(firstActionBox?.height || 0).toBeGreaterThanOrEqual(44);

  const historical = page.getByTestId('rich-card-history-snapshot');
  await expect(historical).toHaveCount(1);
  await expect(historical.first()).toHaveAttribute('data-rich-card-kind', 'status');
  await expect(historical.first()).toContainText('Current adventure viewed');
  await expect(historical.first().locator('button, input, select, textarea, [data-rich-card-action="true"]')).toHaveCount(0);

  const inventory = await runCommand(page, 'inventory');
  await expect(inventory).toHaveAttribute('data-rich-card-kind', 'inventory');
  await expect(inventory.locator('.rich-chat-card-header')).toHaveCount(1);
  await expect(historical).toHaveCount(2);
  await expect(historical.nth(1)).toHaveAttribute('data-rich-card-kind', 'shop');
  await expect(historical.nth(1)).toContainText(/viewed/i);
  await expect(historical.nth(1).locator('button, input, select, textarea, [data-rich-card-action="true"]')).toHaveCount(0);

  const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(bodyWidth).toBeLessThanOrEqual(390);

  await mkdir('ux-review', { recursive: true });
  await page.screenshot({ path: 'ux-review/rich-chat-card-mobile.png', fullPage: true });

  await inventory.locator('[data-rich-card-dismiss="true"]').click();
  await expect(inventory).toBeHidden();
  await expect(historical).toHaveCount(2);
});
