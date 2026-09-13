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

test('Quest rich card tracks available, active, claimable, and completed state inside the Adventure Stream', async ({ page, context }) => {
  await login(page);
  let card = await openQuest(page);
  const questId = 'guild-field-check';
  await expect(card.getByTestId(`quest-row-${questId}`)).toContainText('Guild Field Check');
  await expect(card.getByTestId(`quest-state-${questId}`)).toHaveText('available');
  await expect(card.getByTestId(`quest-objective-${questId}-complete-hunt`)).toContainText('Hunt');
  await expect(card.getByTestId(`quest-objective-${questId}-complete-hunt`)).toContainText('0/1');
  await expect(card.getByTestId(`quest-action-${questId}`)).toHaveText('Accept');

  const metrics = await page.evaluate(() => {
    const cardElement = document.querySelector('[data-testid="stream-command-card"]');
    const action = cardElement?.querySelector('[data-testid="quest-action-guild-field-check"]');
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
  await expect(log).toContainText('accepted Quest: Guild Field Check');

  const hunt = await context.request.post('/api/hunt');
  expect(hunt.ok()).toBe(true);
  card = await openQuest(page);
  await expect(card.getByTestId(`quest-state-${questId}`)).toHaveText('claimable');
  await expect(card.getByTestId(`quest-objective-${questId}-complete-hunt`)).toContainText('1/1');
  await expect(card.getByTestId(`quest-action-${questId}`)).toHaveText('Claim');

  await card.getByTestId(`quest-action-${questId}`).click();
  await expect(card.getByTestId(`quest-state-${questId}`)).toHaveText('completed');
  await expect(card.getByTestId(`quest-action-${questId}`)).toHaveText('Completed');
  await expect(card.getByTestId(`quest-action-${questId}`)).toBeDisabled();
  await expect(log).toContainText('completed Quest: Guild Field Check');

  const duplicateClaim = await context.request.post(`/api/quests/${questId}/claim`);
  expect(duplicateClaim.status()).toBe(409);
  expect(await duplicateClaim.json()).toMatchObject({ error: 'quest_already_claimed' });
});
