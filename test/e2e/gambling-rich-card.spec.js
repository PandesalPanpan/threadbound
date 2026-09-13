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

test('Gold-only gambling activities render as one mobile Adventure Stream card', async ({ page, context }) => {
  await login(page);

  const browse = await context.request.get('/api/gambling');
  expect(browse.ok()).toBe(true);
  const gambling = await browse.json();
  expect(gambling.blackjack.currency).toBe('Gold');

  const overCap = await context.request.post('/api/gambling/coinflip', {
    headers: { 'Idempotency-Key': 'playwright-gambling-cap-0001' },
    data: { wager: 101, choice: 'heads' },
  });
  expect(overCap.status()).toBe(422);
  const overCapPayload = await overCap.json();
  expect(overCapPayload.error).toBe('invalid_coinflip_wager');
  expect(overCapPayload.message).toContain('between 1 and 100 Gold');

  await page.getByTestId('stream-message').fill('gambling');
  await page.getByTestId('stream-send').click();

  const card = page.getByTestId('stream-command-card');
  await expect(card).toHaveAttribute('data-rich-card-kind', 'gambling');
  await expect(card).toHaveAttribute('data-gambling-rich-card', 'true');
  await expect(card.getByTestId('gambling-carried-gold')).toContainText('Carried Gold');
  await expect(card.getByTestId('gambling-blackjack')).toContainText('Blackjack');
  await expect(card.getByTestId('gambling-coinflip')).toContainText('Coinflip');
  await expect(card.getByTestId('gambling-slots')).toContainText('Slots');
  await expect(card).toContainText('Banked Gold and Honey are never wagered');
  await expect(card.getByTestId('blackjack-deal')).toBeVisible();
  await expect(card.getByTestId('coinflip-heads')).toBeVisible();
  await expect(card.getByTestId('coinflip-tails')).toBeVisible();
  await expect(card.getByTestId('slots-spin')).toBeVisible();

  const metrics = await page.evaluate(() => {
    const cardElement = document.querySelector('[data-testid="stream-command-card"]');
    const buttons = [...(cardElement?.querySelectorAll('.thread-gambling-button') || [])];
    const fields = [...(cardElement?.querySelectorAll('.thread-gambling-field input') || [])];
    const cardRect = cardElement?.getBoundingClientRect();
    const navRect = document.querySelector('.threadbound-topnav')?.getBoundingClientRect();
    return {
      width: cardElement?.scrollWidth || 0,
      right: cardRect?.right || 0,
      viewportWidth: window.innerWidth,
      cardTop: cardRect?.top || 0,
      navBottom: navRect?.bottom || 0,
      shortestButton: Math.min(...buttons.map((button) => button.getBoundingClientRect().height)),
      shortestField: Math.min(...fields.map((field) => field.getBoundingClientRect().height)),
    };
  });
  expect(metrics.width).toBeLessThanOrEqual(390);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.cardTop).toBeGreaterThanOrEqual(metrics.navBottom);
  expect(metrics.shortestButton).toBeGreaterThanOrEqual(44);
  expect(metrics.shortestField).toBeGreaterThanOrEqual(44);

  mkdirSync(REVIEW_DIR, { recursive: true });
  await page.screenshot({ path: `${REVIEW_DIR}/gambling-mobile.png`, fullPage: true });
});
