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

test('Leaderboard card ranks human and simulated adventurers inside the mobile Adventure Stream', async ({ page, context }) => {
  await login(page);

  const response = await context.request.get('/api/areas');
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  const guildHall = payload.area.towns[0].guildHall;
  expect(guildHall.leaderboard.length).toBeGreaterThanOrEqual(4);
  expect(guildHall.leaderboard.map((entry) => entry.placement)).toEqual(
    guildHall.leaderboard.map((_, index) => index + 1),
  );
  expect(guildHall.leaderboard.some((entry) => entry.isSimulated === false)).toBe(true);
  expect(guildHall.leaderboard.find((entry) => entry.id === 'guild-rook')).toMatchObject({
    placement: 1,
    name: 'Rook',
    level: 15,
    highestUnlockedAreaNumber: 5,
    strongRival: true,
  });

  await page.getByTestId('stream-message').fill('leaderboard');
  await page.getByTestId('stream-send').click();

  const card = page.getByTestId('stream-command-card');
  await expect(card).toHaveAttribute('data-rich-card-kind', 'leaderboard');
  await expect(card).toHaveAttribute('data-leaderboard-rich-card', 'true');
  await expect(card.getByTestId('leaderboard-list').locator('.thread-leaderboard-row')).toHaveCount(guildHall.leaderboard.length);
  await expect(card.getByTestId('leaderboard-row-guild-rook')).toContainText('Rook');
  await expect(card.getByTestId('leaderboard-row-guild-rook')).toContainText('Lv 15');
  await expect(card.getByTestId('leaderboard-row-guild-rook')).toContainText('Area 5');
  await expect(card.getByTestId('leaderboard-row-guild-rook')).toContainText('Veteran rival');
  await expect(card.getByTestId('leaderboard-row-guild-rook')).toContainText(/ATK/);
  await expect(card.getByTestId('leaderboard-row-guild-rook')).toContainText(/Gear/);
  await expect(card.getByTestId('leaderboard-row-guild-rook')).toContainText(/Duels/);
  await expect(card.getByTestId('leaderboard-place-guild-rook')).toHaveText('#1');
  await expect(card.getByRole('button', { name: /Duel/i })).toHaveCount(0);

  const metrics = await page.evaluate(() => {
    const cardElement = document.querySelector('[data-testid="stream-command-card"]');
    const nav = document.querySelector('.threadbound-topnav');
    const rows = [...(cardElement?.querySelectorAll('.thread-leaderboard-row') || [])];
    const cardRect = cardElement?.getBoundingClientRect();
    const navRect = nav?.getBoundingClientRect();
    return {
      width: cardElement?.scrollWidth || 0,
      cardTop: cardRect?.top || 0,
      navBottom: navRect?.bottom || 0,
      farthestRight: Math.max(0, ...rows.map((row) => row.getBoundingClientRect().right)),
      viewportWidth: window.innerWidth,
    };
  });
  expect(metrics.width).toBeLessThanOrEqual(390);
  expect(metrics.cardTop).toBeGreaterThanOrEqual(metrics.navBottom);
  expect(metrics.farthestRight).toBeLessThanOrEqual(metrics.viewportWidth);

  mkdirSync(REVIEW_DIR, { recursive: true });
  await page.screenshot({ path: `${REVIEW_DIR}/leaderboard-mobile.png`, fullPage: true });
});
