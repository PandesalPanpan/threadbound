import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const REVIEW_DIR = 'ux-review';

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

test.describe('mobile gambling chat flow', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

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
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-rich-card-kind', 'blackjack');
    mkdirSync(REVIEW_DIR, { recursive: true });
    const activeSurface = card.getByTestId('blackjack-surface');
    if (await activeSurface.isVisible()) {
      await expect(card.locator('[data-testid^="blackjack-player-card-"]')).toHaveCount(2);
      await expect(card.locator('[data-testid^="blackjack-dealer-card-"]')).toHaveCount(2);
      await expect(page.getByTestId('blackjack-action-hit')).toBeVisible();
      await expect(page.getByTestId('blackjack-action-stand')).toBeVisible();
      await expect(page.getByTestId('blackjack-action-double')).toBeDisabled();
      // Keep this capture viewport-sized so it can be compared directly with the 390x844 Figma frame.
      await page.screenshot({ path: `${REVIEW_DIR}/gambling-blackjack-active-mobile.png` });
    } else {
      await expect(card.getByTestId('blackjack-result-surface')).toBeVisible();
      await expect(page.getByTestId('blackjack-action-play')).toBeVisible();
      await expect(page.getByTestId('blackjack-action-change-bet')).toBeVisible();
      await expect(page.getByTestId('blackjack-action-leave')).toBeVisible();
      await page.screenshot({ path: `${REVIEW_DIR}/gambling-blackjack-result-mobile.png` });
    }

    const roundAfterDeal = await context.request.get('/api/gambling');
    expect(roundAfterDeal.ok()).toBe(true);
    const activeRound = (await roundAfterDeal.json()).blackjack.round;
    if (activeRound?.status === 'active') {
      await typeCommand(page, 'stand');
      await expect(page.getByTestId('blackjack-result-surface')).toBeVisible();
      await expect(page.getByTestId('blackjack-action-play')).toBeVisible();
      await expect(page.getByTestId('blackjack-action-change-bet')).toBeVisible();
      await expect(page.getByTestId('blackjack-action-leave')).toBeVisible();
      await page.screenshot({ path: `${REVIEW_DIR}/gambling-blackjack-result-mobile.png` });
    } else {
      await expect(page.getByTestId('blackjack-result-surface')).toBeVisible();
    }

    const chronology = await page.evaluate(() => {
      const entries = [...document.querySelectorAll('[data-testid="adventure-stream-log"] .stream-entry')];
      const findAfter = (testId, pattern, after = -1) => entries.findIndex((entry, index) => (
        index > after
        && entry.getAttribute('data-testid') === testId
        && pattern.test(entry.textContent || '')
      ));
      const blackjackHelpCommand = findAfter('stream-chat-entry', /^.*blackjack.*$/i);
      const blackjackHelpReceipt = findAfter('stream-system-entry', /Blackjack ·/i, blackjackHelpCommand);
      const deal = findAfter('stream-chat-entry', /blackjack 1/i, blackjackHelpReceipt);
      const dealResult = findAfter('stream-system-entry', /Blackjack/i, deal);
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
        width: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        tallestRecentEntry: Math.max(0, ...recent.map((entry) => entry.getBoundingClientRect().height)),
        hasGamblingCard: Boolean(document.querySelector('[data-gambling-rich-card="true"]:not([hidden])')),
      };
    });
    expect(metrics.width).toBeLessThanOrEqual(metrics.viewportWidth);
    expect(metrics.tallestRecentEntry).toBeLessThan(150);
    expect(metrics.hasGamblingCard).toBe(false);

    await page.screenshot({ path: `${REVIEW_DIR}/gambling-mobile.png`, fullPage: true });
  });
});

test.describe('desktop gambling chat flow', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

  test('gambling remains one compact chat shell on desktop', async ({ page }) => {
    await login(page);
    await typeCommand(page, 'gambling');

    const command = page.getByTestId('stream-chat-entry').filter({ hasText: 'gambling' }).last();
    const receipt = page.getByTestId('stream-system-entry').filter({ hasText: 'Games ·' }).last();
    await expect(command).toBeVisible();
    await expect(receipt).toContainText('blackjack <wager>');
    await expect(page.getByTestId('stream-command-card')).toBeHidden();
    await expect(page.getByTestId('stream-composer')).toBeVisible();

    const metrics = await page.evaluate(() => {
      const stream = document.querySelector('[data-testid="adventure-stream"]');
      const composer = document.querySelector('[data-testid="stream-composer"]');
      const log = document.querySelector('[data-testid="adventure-stream-log"]');
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        documentHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
        streamWidth: stream?.getBoundingClientRect().width || 0,
        composerBottom: composer?.getBoundingClientRect().bottom || 0,
        logHeight: log?.getBoundingClientRect().height || 0,
        hasGamblingCard: Boolean(document.querySelector('[data-gambling-rich-card="true"]:not([hidden])')),
      };
    });
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);
    expect(metrics.streamWidth).toBeGreaterThan(500);
    expect(metrics.composerBottom).toBeGreaterThan(0);
    expect(metrics.logHeight).toBeGreaterThan(300);
    expect(metrics.hasGamblingCard).toBe(false);
    // M10F-09 owns the final viewport-tail correction; this guards this change from
    // introducing an additional multi-screen gambling surface in the meantime.
    expect(metrics.documentHeight).toBeLessThan(metrics.viewportHeight * 3);

    mkdirSync(REVIEW_DIR, { recursive: true });
    await page.screenshot({ path: `${REVIEW_DIR}/gambling-desktop.png`, fullPage: true });
  });
});
