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

async function dashboard(context) {
  const response = await context.request.get('/api/dashboard');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function earnGold(context, minimum) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const state = await dashboard(context);
    if (state.character.gold >= minimum) return state;
    const hunt = await context.request.post('/api/hunt');
    expect(hunt.ok()).toBe(true);
  }
  const state = await dashboard(context);
  expect(state.character.gold).toBeGreaterThanOrEqual(minimum);
  return state;
}

async function openShop(page) {
  await page.getByTestId('stream-message').fill('shop');
  await page.getByTestId('stream-send').click();
  const card = page.getByTestId('stream-command-card');
  await expect(card).toHaveAttribute('data-rich-card-kind', 'shop');
  await expect(card).toHaveAttribute('data-shop-rich-card', 'true');
  return card;
}

test('Shop rich card presents equipment and potions with sprites, affordability, Buy and Sell entry points', async ({ page, context }) => {
  await login(page);

  let card = await openShop(page);
  await expect(card).toContainText('Mara');
  await expect(card).not.toContainText(/\bDust\b/);
  await expect(card.getByTestId('shop-offer')).toHaveCount(3);
  await expect(card.getByTestId('stream-shop-bronze-sword')).toContainText('18 Gold');
  await expect(card.getByTestId('stream-shop-single')).toContainText('5 Gold');
  await expect(card.getByTestId('stream-shop-satchel')).toContainText('12 Gold');
  await expect(card.getByTestId('stream-shop-bronze-sword')).toBeDisabled();
  await expect(card.getByRole('img', { name: 'Bronze Sword' })).toBeVisible();
  await expect(card.getByRole('img', { name: 'Health Potion' })).toBeVisible();
  await expect(card.getByTestId('stream-shop-sell-equipment')).toBeVisible();

  await earnGold(context, 18);
  card = await openShop(page);
  const before = await dashboard(context);
  await expect(card.getByTestId('stream-shop-bronze-sword')).toBeEnabled();
  const streamEntries = await page.getByTestId('stream-system-entry').count();
  await card.getByTestId('stream-shop-bronze-sword').click();

  await expect.poll(async () => (await dashboard(context)).inventory.length).toBe(before.inventory.length + 1);
  const after = await dashboard(context);
  const purchased = after.inventory.find((item) => item.source === 'shop:bronze-sword');
  expect(purchased).toBeTruthy();
  expect(purchased.name).toBe('Bronze Sword');
  expect(purchased.slot).toBe('weapon');
  expect(after.character.gold).toBe(before.character.gold - 18);
  await expect.poll(async () => page.getByTestId('stream-system-entry').count()).toBeGreaterThan(streamEntries);

  card = await openShop(page);
  await card.getByTestId('stream-shop-sell-equipment').click();
  await expect(card).toHaveAttribute('data-rich-card-kind', 'inventory');
  await expect(card.getByTestId('inventory-rich-card')).toBeVisible();
  await expect(card.locator(`[data-item-id="${purchased.id}"]`)).toContainText('Bronze Sword');

  await openShop(page);
  const width = await page.getByTestId('stream-command-card').evaluate((element) => element.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  const actions = page.getByTestId('stream-command-card').locator('button[data-rich-card-action="true"]');
  for (let index = 0; index < await actions.count(); index += 1) {
    const box = await actions.nth(index).boundingBox();
    expect(box?.height || 0).toBeGreaterThanOrEqual(44);
  }

  mkdirSync(REVIEW_DIR, { recursive: true });
  await page.screenshot({ path: `${REVIEW_DIR}/shop-rich-card-mobile.png`, fullPage: true });
});
