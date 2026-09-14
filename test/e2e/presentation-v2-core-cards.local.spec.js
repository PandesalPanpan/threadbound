import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const REVIEW_DIR = 'test-results/presentation-v2';

async function login(page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Connect with Threaded' }).click();
  await expect(page.getByRole('heading', { name: 'Fake Threaded' })).toBeVisible();
  await page.getByRole('button', { name: 'Authorize Threadbound' }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
}

async function command(page, text) {
  await page.getByTestId('stream-message').fill(text);
  await page.getByTestId('stream-send').click();
}

test('390px core loop keeps actions, receipts, expanded details, and reusable states inside the stream', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  await command(page, 'inventory');
  const emptyInventory = page.getByTestId('stream-command-card');
  await expect(emptyInventory.getByTestId('inventory-rich-empty')).toContainText('No equipment yet');

  await page.getByTestId('stream-hunt').click();
  const hunt = page.getByTestId('stream-hunt-visual').last();
  await expect(hunt).toBeVisible();
  await expect(hunt).toContainText(/HUNT (CLEARED|FAILED)/);
  await expect.poll(async () => hunt.locator('.stream-hunt-chip').count()).toBeGreaterThanOrEqual(3);

  const seed = await context.request.post('/api/honey/purchases/training-cache', {
    headers: { 'Idempotency-Key': 'presentation-v2-core-card' },
  });
  expect(seed.ok()).toBe(true);
  await command(page, 'inventory');
  const inventory = page.getByTestId('stream-command-card');
  await expect(inventory.getByTestId('inventory-rich-card')).toBeVisible();
  await expect(inventory.locator('[data-testid^="inventory-rich-upgrade-comparison-"]')).toContainText('After upgrade');
  await expect(inventory.locator('.inventory-rich-list')).toHaveCSS('overflow-y', 'auto');
  expect(await inventory.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBeTruthy();
  mkdirSync(REVIEW_DIR, { recursive: true });
  await inventory.screenshot({ path: `${REVIEW_DIR}/inventory-card-390.png` });

  await command(page, 'shop');
  const shop = page.getByTestId('stream-command-card');
  await expect(shop.getByTestId('shop-offer-detail').first()).toContainText('Owned');
  await expect(shop).not.toContainText(/\bDust\b/);
  await shop.screenshot({ path: `${REVIEW_DIR}/shop-card-390.png` });

  await command(page, 'bank');
  const bank = page.getByTestId('stream-command-card');
  await bank.getByTestId('bank-quick-deposit-all').click();
  await expect(bank.getByTestId('bank-amount')).toHaveValue(/\d+/);
  await expect(bank).toContainText('stays protected');
  await bank.screenshot({ path: `${REVIEW_DIR}/bank-card-390.png` });

  await command(page, 'recovery');
  const recovery = page.getByTestId('stream-command-card');
  await expect(recovery).toHaveAttribute('data-rich-card-kind', 'recovery');
  await expect(recovery).toContainText(/Natural healing|Fully healed/);
  await expect(recovery.getByTestId('simple-recovery-use-potion')).toBeVisible();
  await expect(recovery.getByTestId('simple-recovery-open-shop')).toBeVisible();

  await page.screenshot({ path: `${REVIEW_DIR}/core-cards-390x844.png` });
});

test('1440px core cards remain centered, bounded, and action-complete', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await login(page);
  expect((await context.request.post('/api/honey/purchases/training-cache', {
    headers: { 'Idempotency-Key': 'presentation-v2-core-card-desktop' },
  })).ok()).toBe(true);

  await command(page, 'inventory');
  const card = page.getByTestId('stream-command-card');
  await expect(card.locator('.inventory-rich-actions button')).toHaveCount(3);
  const metrics = await card.evaluate((node) => ({ width: node.getBoundingClientRect().width, overflow: node.scrollWidth - node.clientWidth }));
  expect(metrics.width).toBeLessThanOrEqual(760);
  expect(metrics.overflow).toBeLessThanOrEqual(1);

  mkdirSync(REVIEW_DIR, { recursive: true });
  await card.screenshot({ path: `${REVIEW_DIR}/inventory-card-1440.png` });
  await page.screenshot({ path: `${REVIEW_DIR}/core-cards-1440x960.png` });
});
