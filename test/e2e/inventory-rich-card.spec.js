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

async function buyTrainingCache(context, key) {
  const response = await context.request.post('/api/honey/purchases/training-cache', {
    headers: { 'Idempotency-Key': key },
  });
  expect(response.ok()).toBe(true);
  return response.json();
}

async function openInventory(page) {
  const input = page.getByTestId('stream-message');
  await input.fill('inventory');
  await page.getByTestId('stream-send').click();
  const card = page.getByTestId('stream-command-card');
  await expect(card).toHaveAttribute('data-rich-card-kind', 'inventory');
  await expect(card.getByTestId('inventory-rich-card')).toBeVisible();
  return card;
}

test('Inventory rich card exposes canonical slots, stats, sprites and actions inside chat', async ({ page, context }) => {
  await login(page);

  // Deterministically seed one item plus enough Gold for its first Upgrade using only
  // authoritative server transactions. The UI itself never authors prices or rewards.
  const first = await buyTrainingCache(context, 'inventory-card-seed-a');
  const second = await buyTrainingCache(context, 'inventory-card-seed-b');
  const keeper = await buyTrainingCache(context, 'inventory-card-seed-c');
  for (const grant of [first, second]) {
    const response = await context.request.post(`/api/items/${encodeURIComponent(grant.item.id)}/salvage`);
    expect(response.ok()).toBe(true);
  }

  const before = await dashboard(context);
  expect(before.inventory).toHaveLength(1);
  expect(before.inventory[0].id).toBe(keeper.item.id);
  expect(before.character.gold).toBeGreaterThanOrEqual(8);

  const card = await openInventory(page);
  await expect(card).toContainText('Inventory');
  await expect(card).toContainText(`${before.character.gold} Gold`);
  await expect(card).not.toContainText('Relic pouch');
  await expect(card).not.toContainText('Thread Dust');

  for (const slot of ['weapon', 'helmet', 'armor', 'boots', 'accessory']) {
    await expect(card.getByTestId(`inventory-slot-${slot}`)).toBeVisible();
  }
  for (const stat of ['attack', 'defense', 'max-hp', 'speed', 'crit']) {
    await expect(card.getByTestId(`inventory-rich-stat-${stat}`)).toBeVisible();
  }

  const item = card.getByTestId('inventory-rich-item');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('Weapon · COMMON');
  await expect(item).toContainText('+1 Attack');
  const sprite = item.locator('[data-sprite-atlas="equipment-v1"], [data-visual-asset-id]').first();
  await expect(sprite).toBeVisible();

  const equip = card.getByTestId(`inventory-rich-equip-${keeper.item.id}`);
  const upgrade = card.getByTestId(`inventory-rich-upgrade-${keeper.item.id}`);
  const sell = card.getByTestId(`inventory-rich-sell-${keeper.item.id}`);
  await expect(equip).toBeEnabled();
  await expect(upgrade).toBeEnabled();
  await expect(sell).toBeEnabled();

  await sell.click();
  await expect(sell).toHaveText('Confirm Sell');
  expect((await dashboard(context)).inventory).toHaveLength(1);

  const entriesBeforeEquip = await page.getByTestId('stream-system-entry').count();
  await equip.click();
  await expect.poll(async () => (await dashboard(context)).character.equipment.weapon?.id).toBe(keeper.item.id);
  await expect.poll(async () => page.getByTestId('stream-system-entry').count()).toBeGreaterThan(entriesBeforeEquip);
  await expect(card.getByTestId(`inventory-rich-equip-${keeper.item.id}`)).toHaveText('Equipped');
  await expect(card.getByTestId(`inventory-rich-sell-${keeper.item.id}`)).toBeDisabled();

  const goldBeforeUpgrade = (await dashboard(context)).character.gold;
  const entriesBeforeUpgrade = await page.getByTestId('stream-system-entry').count();
  await card.getByTestId(`inventory-rich-upgrade-${keeper.item.id}`).click();
  await expect.poll(async () => (await dashboard(context)).inventory[0].effect?.upgradeLevel || 0).toBe(1);
  expect((await dashboard(context)).character.gold).toBeLessThan(goldBeforeUpgrade);
  await expect.poll(async () => page.getByTestId('stream-system-entry').count()).toBeGreaterThan(entriesBeforeUpgrade);

  const width = await card.evaluate((element) => element.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  const actions = card.locator('.inventory-rich-actions button');
  for (let index = 0; index < await actions.count(); index += 1) {
    const box = await actions.nth(index).boundingBox();
    expect(box?.height || 0).toBeGreaterThanOrEqual(44);
  }

  mkdirSync(REVIEW_DIR, { recursive: true });
  await page.screenshot({ path: `${REVIEW_DIR}/inventory-rich-card-mobile.png`, fullPage: true });
});
