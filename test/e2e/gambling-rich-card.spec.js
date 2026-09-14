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

test('gambling stays minimal and inline in the Adventure Stream', async ({ page, context }) => {
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

  const card = page.getByTestId('stream-command-card');
  const log = page.getByTestId('adventure-stream-log');
  await expect.poll(async () => card.evaluate((element, logElement) => element.parentElement === logElement, await log.elementHandle())).toBe(true);

  await page.getByTestId('stream-message').fill('blackjack');
  await page.getByTestId('stream-send').click();

  await expect(page.getByTestId('stream-chat-entry').filter({ hasText: 'blackjack' }).last()).toBeVisible();
  await expect(card).toHaveAttribute('data-rich-card-kind', 'gambling');
  await expect(card).toHaveAttribute('data-gambling-rich-card', 'true');
  await expect(card).toHaveAttribute('data-gambling-view', 'blackjack');
  await expect(card.getByTestId('gambling-carried-gold')).toContainText('Gold');
  await expect(card.getByTestId('gambling-blackjack')).toContainText('Blackjack');
  await expect(card.getByTestId('blackjack-deal')).toBeVisible();
  await expect(card.getByTestId('gambling-coinflip')).toHaveCount(0);
  await expect(card.getByTestId('gambling-slots')).toHaveCount(0);
  await expect(card).not.toContainText('PRIVATE THREAD REPLY');

  const blackjackMetrics = await page.evaluate(() => {
    const cardElement = document.querySelector('[data-testid="stream-command-card"]');
    const logElement = document.querySelector('[data-testid="adventure-stream-log"]');
    const button = cardElement?.querySelector('.thread-gambling-button');
    const field = cardElement?.querySelector('.thread-gambling-input');
    const rect = cardElement?.getBoundingClientRect();
    return {
      inline: cardElement?.parentElement === logElement,
      width: cardElement?.scrollWidth || 0,
      height: rect?.height || 0,
      right: rect?.right || 0,
      viewportWidth: window.innerWidth,
      buttonHeight: button?.getBoundingClientRect().height || 0,
      fieldHeight: field?.getBoundingClientRect().height || 0,
    };
  });
  expect(blackjackMetrics.inline).toBe(true);
  expect(blackjackMetrics.width).toBeLessThanOrEqual(390);
  expect(blackjackMetrics.right).toBeLessThanOrEqual(blackjackMetrics.viewportWidth);
  expect(blackjackMetrics.height).toBeLessThan(330);
  expect(blackjackMetrics.buttonHeight).toBeGreaterThanOrEqual(44);
  expect(blackjackMetrics.fieldHeight).toBeGreaterThanOrEqual(44);

  await page.getByTestId('stream-message').fill('gambling');
  await page.getByTestId('stream-send').click();
  await expect(page.getByTestId('stream-chat-entry').filter({ hasText: 'gambling' }).last()).toBeVisible();
  await expect(card).toHaveAttribute('data-gambling-view', 'menu');
  await expect(card.getByTestId('gambling-open-blackjack')).toBeVisible();
  await expect(card.getByTestId('gambling-open-coinflip')).toBeVisible();
  await expect(card.getByTestId('gambling-open-slots')).toBeVisible();
  await expect(card.getByTestId('gambling-blackjack')).toHaveCount(0);
  await expect(card.getByTestId('gambling-coinflip')).toHaveCount(0);
  await expect(card.getByTestId('gambling-slots')).toHaveCount(0);

  mkdirSync(REVIEW_DIR, { recursive: true });
  await page.screenshot({ path: `${REVIEW_DIR}/gambling-mobile.png`, fullPage: true });
});
