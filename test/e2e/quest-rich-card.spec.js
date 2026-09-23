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

async function openQuest(page) {
  await page.getByTestId('stream-message').fill('quest');
  await page.getByTestId('stream-send').click();
  const card = page.getByTestId('stream-command-card');
  await expect(card).toHaveAttribute('data-rich-card-kind', 'quest');
  await expect(card).toHaveAttribute('data-quest-rich-card', 'true');
  return card;
}

async function command(page, value) {
  await expect(page.getByTestId('stream-busy')).toHaveCount(0);
  await page.getByTestId('stream-message').fill(value);
  await page.getByTestId('stream-send').click();
}

test('Quest rich card tracks available, active, claimable, and completed state inside the Adventure Stream', async ({ page, context }) => {
  await login(page);
  let card = await openQuest(page);
  const boardResponse = await context.request.get('/api/quests');
  expect(boardResponse.ok()).toBe(true);
  const board = await boardResponse.json();
  const quest = board.quests.find((candidate) => candidate.id === 'welcome-to-bellbloom');
  expect(quest).toMatchObject({ title: 'Welcome to Bellbloom', state: 'available' });
  const questId = quest.id;
  const objective = quest.objectives[0];
  expect(objective).toMatchObject({ type: 'speak', targetId: 'mae-bramble' });
  await expect(card.getByTestId(`quest-row-${questId}`)).toContainText(quest.title);
  await expect(card.getByTestId(`quest-state-${questId}`)).toHaveText('available');
  await expect(card.getByTestId(`quest-objective-${questId}-${objective.id}`)).toContainText('Mae Bramble');
  await expect(card.getByTestId(`quest-objective-${questId}-${objective.id}`)).toContainText('0/1');
  await expect(card.getByTestId(`quest-action-${questId}`)).toHaveText('Accept');

  const metrics = await page.evaluate(() => {
    const cardElement = document.querySelector('[data-testid="stream-command-card"]');
    const action = cardElement?.querySelector('[data-testid^="quest-action-"]');
    const dismiss = cardElement?.querySelector('[data-rich-card-dismiss="true"]');
    const nav = document.querySelector('.threadbound-topnav');
    return {
      width: cardElement?.scrollWidth || 0,
      cardTop: cardElement?.getBoundingClientRect().top || 0,
      navBottom: nav?.getBoundingClientRect().bottom || 0,
      actionHeight: action?.getBoundingClientRect().height || 0,
      dismissHeight: dismiss?.getBoundingClientRect().height || 0,
      dismissWidth: dismiss?.getBoundingClientRect().width || 0,
    };
  });
  expect(metrics.width).toBeLessThanOrEqual(390);
  expect(metrics.cardTop).toBeGreaterThanOrEqual(metrics.navBottom);
  expect(metrics.actionHeight).toBeGreaterThanOrEqual(44);
  expect(metrics.dismissHeight).toBeGreaterThanOrEqual(44);
  expect(metrics.dismissWidth).toBeGreaterThanOrEqual(44);

  mkdirSync(REVIEW_DIR, { recursive: true });
  await page.screenshot({ path: `${REVIEW_DIR}/quest-rich-card-mobile.png`, fullPage: true });

  const log = page.getByTestId('adventure-stream-log');
  await card.getByTestId(`quest-action-${questId}`).click();
  await expect(card.getByTestId(`quest-state-${questId}`)).toHaveText('active');
  await expect(card.getByTestId(`quest-action-${questId}`)).toHaveText('In progress');
  await expect(log).toContainText(`accepted Quest: ${quest.title}`);

  await page.getByTestId('stream-message').fill('town');
  await page.getByTestId('stream-send').click();
  const townCard = page.getByTestId('stream-command-card');
  await expect(townCard).toHaveAttribute('data-town-rich-card', 'true');
  await townCard.getByTestId('town-talk-mae-bramble').click();
  await expect(log).toContainText('spoke with Mae Bramble in Bellbloom');
  let npcStream = await context.request.get('/api/stream');
  let maeEntry = (await npcStream.json()).entries.filter((entry) => entry.eventType === 'NpcInteracted' && entry.metadata?.npcId === 'mae-bramble').at(-1);
  expect(maeEntry?.metadata?.dialogue).toContain('Your road report is still open.');

  card = await openQuest(page);
  await expect(card.getByTestId(`quest-state-${questId}`)).toHaveText('claimable');
  await expect(card.getByTestId(`quest-objective-${questId}-${objective.id}`)).toContainText('1/1');
  await expect(card.getByTestId(`quest-action-${questId}`)).toHaveText('Claim');

  await card.getByTestId(`quest-action-${questId}`).click();
  await expect(card.getByTestId(`quest-state-${questId}`)).toHaveText('completed');
  await expect(card.getByTestId(`quest-action-${questId}`)).toHaveText('Completed');
  await expect(card.getByTestId(`quest-action-${questId}`)).toBeDisabled();
  await expect(log).toContainText(`completed Quest: ${quest.title}`);
  const claimStream = await context.request.get('/api/stream');
  const claimEntry = (await claimStream.json()).entries.find((entry) => entry.eventType === 'QuestClaimed' && entry.metadata?.questId === questId);
  expect(claimEntry?.metadata?.goldAwarded).toBeGreaterThan(0);
  expect(claimEntry?.metadata?.experienceAwarded).toBeGreaterThan(0);
  await expect(log).toContainText(`+${claimEntry.metadata.goldAwarded} Gold · +${claimEntry.metadata.experienceAwarded} XP`);

  const refreshedBoardResponse = await context.request.get('/api/quests');
  expect(refreshedBoardResponse.ok()).toBe(true);
  const refreshedBoard = await refreshedBoardResponse.json();
  expect(refreshedBoard.quests.filter((candidate) => candidate.state === 'available')).toHaveLength(3);
  expect(refreshedBoard.quests.some((candidate) => candidate.id === questId && candidate.state === 'completed')).toBe(true);

  await command(page, 'town');
  const returningTownCard = page.getByTestId('stream-command-card');
  await returningTownCard.getByTestId('town-talk-mae-bramble').click();
  npcStream = await context.request.get('/api/stream');
  maeEntry = (await npcStream.json()).entries.filter((entry) => entry.eventType === 'NpcInteracted' && entry.metadata?.npcId === 'mae-bramble').at(-1);
  expect(maeEntry?.metadata?.dialogue).toContain('The guild has your report.');

  await command(page, 'shop');
  const shopCard = page.getByTestId('stream-command-card');
  await expect(shopCard).toHaveAttribute('data-rich-card-kind', 'shop');
  await expect(shopCard.getByRole('img', { name: 'Bronze Sword' })).toBeVisible();
  await shopCard.getByTestId('stream-shop-bronze-sword').click();
  await expect(page.getByTestId('adventure-stream-log')).toContainText('Bronze Sword');

  const afterPurchase = await context.request.get('/api/dashboard');
  expect(afterPurchase.ok()).toBe(true);
  const purchasedDashboard = await afterPurchase.json();
  const purchasedSword = purchasedDashboard.inventory.find((item) => item.name === 'Bronze Sword');
  expect(purchasedSword?.visualAssetId).toBe('item.bronze-wardblade.v1');
  await command(page, 'inventory');
  const inventoryCard = page.getByTestId('stream-command-card');
  await expect(inventoryCard).toHaveAttribute('data-rich-card-kind', 'inventory');
  const swordRow = inventoryCard.getByTestId('inventory-rich-item').filter({ hasText: 'Bronze Sword' });
  await expect(swordRow).toHaveCount(1);
  await expect(swordRow.locator('.thread-generated-item-sprite')).toHaveAttribute('data-visual-asset-id', 'item.bronze-wardblade.v1');

  const duplicateClaim = await context.request.post(`/api/quests/${questId}/claim`);
  expect(duplicateClaim.status()).toBe(409);
  expect(await duplicateClaim.json()).toMatchObject({ error: 'quest_already_claimed' });
});
