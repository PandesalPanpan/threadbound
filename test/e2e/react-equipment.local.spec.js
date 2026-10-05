import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const REVIEW_DIR = 'ux-review';
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function dashboard(context) {
  const response = await context.request.get('/api/dashboard');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function login(page) {
  await page.goto('/');
  await page.getByTestId('local-login-k').click();
  await page.context().request.post('/api/party/leave');
  await page.goto('/game');
  await expect(page.getByTestId('stream-message')).toBeVisible();
}

async function command(page, value) {
  await expect(page.getByTestId('stream-busy')).toHaveCount(0);
  await page.getByTestId('stream-message').fill(value);
  await page.getByTestId('stream-send').click();
}

async function statusCard(page) {
  await command(page, 'status');
  const card = page.getByTestId('stream-player-status').last();
  await expect(card).toBeVisible();
  return card;
}

async function readVisibleStats(card) {
  return card.locator('.shell-stat-grid--five .shell-stat').evaluateAll((rows) => Object.fromEntries(rows.map((row) => [
    row.querySelector('span')?.textContent?.trim(),
    row.querySelector('strong')?.textContent?.trim(),
  ])));
}

test('Hunts earn Gold for official-art armor that equips into Defense and Max HP', async ({ page, context }) => {
  test.setTimeout(120_000);
  await login(page);

  for (let satchel = 0; satchel < 6; satchel += 1) {
    const purchase = await context.request.post('/api/shop/purchases/satchel');
    expect(purchase.ok()).toBe(true);
  }
  let state = await dashboard(context);
  let earnedGold = false;
  for (let attempt = 0; !earnedGold && attempt < 10; attempt += 1) {
    await command(page, 'hunt');
    const hunt = page.getByTestId('stream-hunt-rich-card').last();
    await expect(hunt.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete', { timeout: 30_000 });
    state = await dashboard(context);
    const huntStream = await context.request.get('/api/stream');
    expect(huntStream.ok()).toBe(true);
    const latestHunt = [...(await huntStream.json()).entries].reverse().find((entry) => entry.eventType === 'HuntResolved');
    earnedGold = Number(latestHunt?.metadata?.gold || 0) > 0;
    const potions = Number(state.character.potions.find((candidate) => candidate.id === 'minor-health-potion')?.quantity || 0);
    if (state.character.currentHealth < state.character.maxHealth && potions > 0) {
      const recovery = await context.request.post('/api/recovery/potion');
      expect(recovery.ok()).toBe(true);
      state = await dashboard(context);
    }
  }
  expect(earnedGold).toBe(true);
  expect(state.character.gold).toBeGreaterThanOrEqual(8);
  const hunts = await context.request.get('/api/stream');
  expect(hunts.ok()).toBe(true);
  expect((await hunts.json()).entries.filter((entry) => entry.eventType === 'HuntResolved').length).toBeGreaterThan(0);

  const beforeCard = await statusCard(page);
  const beforeStats = await readVisibleStats(beforeCard);
  const beforeDashboard = await dashboard(context);

  await command(page, 'shop');
  const shop = page.getByTestId('stream-shop-rich-card').last();
  const armorOffer = shop.locator('[data-testid="stream-shop-item"][data-item-id="bronzeweave-coat"]');
  await expect(armorOffer).toBeVisible();
  await expect(armorOffer.locator('img[data-visual-asset-id]')).toHaveAttribute('data-visual-asset-id', 'item.bronzeweave-coat.v1');
  await armorOffer.getByRole('button', { name: 'Inspect Bronzeweave Coat' }).click();
  await expect(armorOffer.getByRole('tooltip')).toContainText('+1 Defense · +4 Max HP');
  await armorOffer.getByRole('button', { name: 'Buy' }).click();

  await expect.poll(async () => (await dashboard(context)).inventory.some((item) => item.source === 'shop:bronzeweave-coat')).toBe(true);
  const purchasedState = await dashboard(context);
  const armor = purchasedState.inventory.find((item) => item.source === 'shop:bronzeweave-coat');
  expect(armor).toMatchObject({ name: 'Bronzeweave Coat', slot: 'armor', defenseBonus: 1, maxHpBonus: 4, visualAssetId: 'item.bronzeweave-coat.v1' });
  expect(purchasedState.character.gold).toBe(beforeDashboard.character.gold - 8);

  await command(page, 'inventory');
  let inventory = page.getByTestId('stream-inventory-rich-card').last();
  const armorTile = inventory.locator(`[data-testid="stream-inventory-item"][data-item-id="${armor.id}"]`);
  await expect(armorTile.locator('img[data-visual-asset-id]')).toHaveAttribute('data-visual-asset-id', 'item.bronzeweave-coat.v1');
  await armorTile.getByRole('button', { name: 'Inspect Bronzeweave Coat' }).click();
  await armorTile.getByRole('button', { name: 'Equip' }).click();
  await expect.poll(async () => (await dashboard(context)).character.equipment.armor?.id).toBe(armor.id);

  await command(page, 'inventory');
  inventory = page.getByTestId('stream-inventory-rich-card').last();
  await expect(inventory.getByTestId('equipment-slot-armor')).toContainText('Bronzeweave Coat');
  await expect(inventory.getByTestId('equipment-slot-armor')).toContainText('+1 Defense · +4 Max HP');
  await expect(inventory.getByTestId('equipment-slot-armor').locator('img')).toHaveAttribute('data-visual-asset-id', 'item.bronzeweave-coat.v1');

  const afterCard = await statusCard(page);
  const afterStats = await readVisibleStats(afterCard);
  expect(Number(afterStats.Attack)).toBe(Number(beforeStats.Attack));
  expect(Number(afterStats.Defense)).toBe(Number(beforeStats.Defense) + 1);
  expect(Number(afterStats['Max HP'])).toBe(Number(beforeStats['Max HP']) + 4);
  await expect(afterCard.getByTestId('equipment-slot-armor')).toContainText('Bronzeweave Coat');

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  mkdirSync(REVIEW_DIR, { recursive: true });
  await afterCard.screenshot({ path: `${REVIEW_DIR}/react-equipment-status-mobile.png` });

  await page.setViewportSize({ width: 1440, height: 960 });
  const desktopStatus = await statusCard(page);
  const desktopLayout = await desktopStatus.evaluate((card) => ({
    width: card.getBoundingClientRect().width,
    overflow: card.scrollWidth - card.clientWidth,
  }));
  expect(desktopLayout.width).toBeLessThanOrEqual(760);
  expect(desktopLayout.overflow).toBeLessThanOrEqual(1);
  await expect(desktopStatus.getByTestId('equipment-slot-armor')).toContainText('+1 Defense · +4 Max HP');
  await desktopStatus.screenshot({ path: `${REVIEW_DIR}/react-equipment-status-desktop.png` });
});
