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

test('Duel auto-resolves from Leaderboard, records a stream receipt, and exposes Battle Details', async ({ page }) => {
  await login(page);

  await page.getByTestId('stream-message').fill('leaderboard');
  await page.getByTestId('stream-send').click();
  const card = page.getByTestId('stream-command-card');
  await expect(card.getByTestId('leaderboard-duel-guild-lio')).toBeVisible();
  await card.getByTestId('leaderboard-duel-guild-lio').click();

  const result = card.getByTestId('duel-result');
  await expect(result).toBeVisible();
  await expect(result).toContainText(/Victory|Defeat|Draw/);
  await expect(card.getByTestId('leaderboard-row-guild-lio')).toContainText(/Duels/);

  const streamLog = page.getByTestId('adventure-stream-log');
  await expect(streamLog).toContainText(/dueled Lio/i);
  await expect(streamLog).toContainText(/Record 1-0-0|Record 0-1-0|Record 0-0-1/);

  const detailsButton = result.getByTestId('battle-details-trigger');
  await expect(detailsButton).toBeVisible();
  await detailsButton.click();
  const dialog = page.getByTestId('battle-details-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('battle-details-turns').locator('.battle-details-turn').first()).toBeVisible();
  await dialog.getByTestId('battle-details-close').click();
  await expect(dialog).not.toBeVisible();

  const metrics = await page.evaluate(() => {
    const cardElement = document.querySelector('[data-testid="stream-command-card"]');
    const duelResult = document.querySelector('[data-testid="duel-result"]');
    return {
      cardWidth: cardElement?.scrollWidth || 0,
      viewportWidth: window.innerWidth,
      resultRight: duelResult?.getBoundingClientRect().right || 0,
    };
  });
  expect(metrics.cardWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.resultRight).toBeLessThanOrEqual(metrics.viewportWidth);

  mkdirSync(REVIEW_DIR, { recursive: true });
  await page.screenshot({ path: `${REVIEW_DIR}/duel-mobile.png`, fullPage: true });
});
