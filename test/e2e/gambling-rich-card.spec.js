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

async function typeCommand(page, command) {
  await page.getByTestId('stream-message').fill(command);
  await page.getByTestId('stream-send').click();
}

test('gambling uses EPIC-RPG-style player command then compact Threadbound receipt', async ({ page, context }) => {
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

  // A fresh test player has no Gold. Earn it through the authoritative gameplay
  // loop instead of bypassing economy rules just to exercise the side activity.
  const hunt = await context.request.post('/api/hunt');
  expect(hunt.ok()).toBe(true);
  const afterHunt = await context.request.get('/api/dashboard');
  expect(afterHunt.ok()).toBe(true);
  expect((await afterHunt.json()).character.gold).toBeGreaterThan(0);

  const log = page.getByTestId('adventure-stream-log');
  const card = page.getByTestId('stream-command-card');

  await typeCommand(page, 'blackjack');
  const blackjackCommand = page.getByTestId('stream-chat-entry').filter({ hasText: 'blackjack' }).last();
  const blackjackHelp = page.getByTestId('stream-system-entry').filter({ hasText: 'Blackjack ·' }).last();
  await expect(blackjackCommand).toBeVisible();
  await expect(blackjackHelp).toContainText('type blackjack <wager> to deal');
  await expect(card).toBeHidden();

  await typeCommand(page, 'blackjack 1');
  const dealCommand = page.getByTestId('stream-chat-entry').filter({ hasText: 'blackjack 1' }).last();
  const dealReceipt = page.getByTestId('stream-system-entry').filter({ hasText: 'Blackjack' }).last();
  await expect(dealCommand).toBeVisible();
  await expect(dealReceipt).toContainText('You');
  await expect(dealReceipt).toContainText('Dealer');
  await expect(card).toBeHidden();

  const chronology = await page.evaluate(() => {
    const entries = [...document.querySelectorAll('[data-testid="adventure-stream-log"] .stream-entry')];
    const texts = entries.map((entry) => entry.textContent || '');
    const blackjackHelpCommand = texts.findLastIndex((text) => /\bblackjack\b/i.test(text) && !/THREADBOUND/i.test(text) && !/blackjack 1/i.test(text));
    const blackjackHelpReceipt = texts.findIndex((text, index) => index > blackjackHelpCommand && /THREADBOUND/i.test(text) && /Blackjack ·/i.test(text));
    const deal = texts.findIndex((text, index) => index > blackjackHelpReceipt && /blackjack 1/i.test(text) && !/THREADBOUND/i.test(text));
    const dealResult = texts.findIndex((text, index) => index > deal && /THREADBOUND/i.test(text) && /Blackjack/i.test(text));
    return { blackjackHelpCommand, blackjackHelpReceipt, deal, dealResult };
  });
  expect(chronology.blackjackHelpCommand).toBeGreaterThanOrEqual(0);
  expect(chronology.blackjackHelpReceipt).toBeGreaterThan(chronology.blackjackHelpCommand);
  expect(chronology.deal).toBeGreaterThan(chronology.blackjackHelpReceipt);
  expect(chronology.dealResult).toBeGreaterThan(chronology.deal);

  await typeCommand(page, 'gambling');
  await expect(page.getByTestId('stream-chat-entry').filter({ hasText: 'gambling' }).last()).toBeVisible();
  const gamesReceipt = page.getByTestId('stream-system-entry').filter({ hasText: 'Games ·' }).last();
  await expect(gamesReceipt).toContainText('blackjack <wager>');
  await expect(gamesReceipt).toContainText('coinflip <wager> heads|tails');
  await expect(gamesReceipt).toContainText('slots <wager>');
  await expect(card).toBeHidden();

  // Help commands prove the other side activities keep the same command/receipt
  // rhythm without depending on the random outcome of the preceding Blackjack bet.
  await typeCommand(page, 'coinflip');
  await expect(page.getByTestId('stream-chat-entry').filter({ hasText: 'coinflip' }).last()).toBeVisible();
  await expect(page.getByTestId('stream-system-entry').filter({ hasText: 'Coinflip ·' }).last()).toContainText('heads');

  await typeCommand(page, 'slots');
  await expect(page.getByTestId('stream-chat-entry').filter({ hasText: 'slots' }).last()).toBeVisible();
  await expect(page.getByTestId('stream-system-entry').filter({ hasText: 'Slots ·' }).last()).toContainText('type slots <wager>');

  const metrics = await page.evaluate(() => {
    const logElement = document.querySelector('[data-testid="adventure-stream-log"]');
    const recent = [...(logElement?.querySelectorAll('.stream-entry') || [])].slice(-8);
    return {
      width: logElement?.scrollWidth || 0,
      viewportWidth: window.innerWidth,
      tallestRecentEntry: Math.max(0, ...recent.map((entry) => entry.getBoundingClientRect().height)),
      hasGamblingCard: Boolean(document.querySelector('[data-gambling-rich-card="true"]:not([hidden])')),
    };
  });
  expect(metrics.width).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.tallestRecentEntry).toBeLessThan(150);
  expect(metrics.hasGamblingCard).toBe(false);

  mkdirSync(REVIEW_DIR, { recursive: true });
  await page.screenshot({ path: `${REVIEW_DIR}/gambling-mobile.png`, fullPage: true });
});
