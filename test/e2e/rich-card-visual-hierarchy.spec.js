import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const REVIEW_DIR = 'ux-review';
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function login(page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Connect with Threaded' }).click();
  await expect(page.getByRole('heading', { name: 'Fake Threaded' })).toBeVisible();
  await page.getByRole('button', { name: 'Authorize Threadbound' }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
}

async function openCommand(page, command, kind) {
  await page.getByTestId('stream-message').fill(command);
  await page.getByTestId('stream-send').click();
  const card = page.getByTestId('stream-command-card');
  await expect(card).toHaveAttribute('data-rich-card-kind', kind);
  await expect(card.locator('[data-rich-card-header-icon="true"]')).toBeVisible();
  return card;
}

test('rich cards use project-owned semantic art with a compact mobile hierarchy', async ({ page }) => {
  await login(page);

  const profile = await openCommand(page, 'profile', 'profile');
  await expect(profile.getByRole('img', { name: 'profile icon', exact: true })).toBeVisible();
  await expect(profile.getByRole('img', { name: 'Gold', exact: true })).toBeVisible();
  await expect(profile.getByRole('img', { name: 'Attack', exact: true })).toBeVisible();

  const inventory = await openCommand(page, 'inventory', 'inventory');
  await expect(inventory.getByRole('img', { name: 'inventory icon', exact: true })).toBeVisible();
  await expect(inventory.getByRole('img', { name: 'Defense', exact: true })).toBeVisible();
  await expect(inventory.getByRole('img', { name: 'Health potions', exact: true })).toBeVisible();

  const shop = await openCommand(page, 'shop', 'shop');
  await expect(shop.getByRole('img', { name: 'shop icon', exact: true })).toBeVisible();
  await expect(shop.locator('.thread-shop-offer .thread-generated-item-sprite').first()).toBeVisible();

  const bank = await openCommand(page, 'bank', 'bank');
  await expect(bank.getByRole('img', { name: 'bank icon', exact: true })).toBeVisible();
  await expect(bank.getByRole('img', { name: 'Carried Gold', exact: true })).toBeVisible();
  await expect(bank.getByRole('img', { name: 'Banked Gold', exact: true })).toBeVisible();

  const metrics = await bank.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const icons = [...element.querySelectorAll('[data-visual-asset-id^="icon."]')]
      .map((node) => node.getBoundingClientRect())
      .filter((iconRect) => iconRect.width > 0 && iconRect.height > 0);
    return {
      right: rect.right,
      viewport: document.documentElement.clientWidth,
      iconCount: icons.length,
      smallestIcon: Math.min(...icons.map((iconRect) => Math.min(iconRect.width, iconRect.height))),
    };
  });
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewport + 1);
  expect(metrics.iconCount).toBeGreaterThanOrEqual(3);
  expect(metrics.smallestIcon).toBeGreaterThanOrEqual(24);

  mkdirSync(REVIEW_DIR, { recursive: true });
  await page.screenshot({ path: `${REVIEW_DIR}/m2-07-rich-card-visual-hierarchy-mobile.png`, fullPage: true });
});
