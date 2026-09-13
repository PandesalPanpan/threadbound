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

async function openLeaderboard(page) {
  await page.getByTestId('stream-message').fill('leaderboard');
  await page.getByTestId('stream-send').click();
  const card = page.getByTestId('stream-command-card');
  await expect(card).toHaveAttribute('data-rich-card-kind', 'leaderboard');
  return card;
}

test('simulated Adventurer Profile opens from Leaderboard with authoritative equipment, stats, and recent history', async ({ page, context }) => {
  await login(page);

  const duel = await context.request.post('/api/duels/guild-rook', {
    headers: { 'Idempotency-Key': 'profile-rook-history-0001' },
  });
  expect(duel.ok()).toBe(true);

  const leaderboard = await openLeaderboard(page);
  const profileButton = leaderboard.getByTestId('leaderboard-profile-guild-rook');
  await expect(profileButton).toBeVisible();
  await expect(profileButton).toHaveText('Profile');
  const profileButtonSize = await profileButton.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(profileButtonSize.width).toBeGreaterThanOrEqual(44);
  expect(profileButtonSize.height).toBeGreaterThanOrEqual(44);

  await profileButton.click();
  const card = page.getByTestId('stream-command-card');
  await expect(card).toHaveAttribute('data-rich-card-kind', 'simulated-profile');
  await expect(card).toHaveAttribute('data-simulated-profile-rich-card', 'true');
  await expect(card.getByTestId('simulated-profile-name')).toHaveText('Rook');
  await expect(card.getByTestId('simulated-profile-level')).toHaveText('15');
  await expect(card.getByTestId('simulated-profile-area')).toHaveText('5');
  await expect(card.getByTestId('simulated-profile-hunts')).toHaveText('260');
  await expect(card.getByTestId('simulated-profile-adventures')).toHaveText('72');
  await expect(card.getByTestId('simulated-profile-duels')).toContainText(/\d+-\d+-\d+/);
  await expect(card.getByTestId('simulated-profile-stat-attack')).not.toHaveText('0');
  await expect(card.getByTestId('simulated-profile-slot-weapon')).toContainText('Veteran Blade');
  await expect(card.getByTestId('simulated-profile-slot-armor')).toContainText('Veteran Armor');
  await expect(card.locator('[data-testid^="simulated-profile-slot-"]')).toHaveCount(5);
  await expect(card.getByRole('heading', { name: 'Achievements' })).toBeVisible();
  await expect(card.getByTestId('simulated-profile-achievements')).toBeVisible();
  await expect(card.getByTestId('simulated-profile-achievements')).toContainText('First Hunt');
  await expect(card.getByTestId('simulated-profile-achievements')).toContainText('Veteran Rival');
  await expect(card.getByRole('heading', { name: 'Recent history' })).toBeVisible();
  await expect(card.getByTestId('simulated-profile-history')).toBeVisible();
  await expect(card.getByTestId('simulated-profile-history')).toContainText(/Duel/);
  await expect(card.getByTestId('simulated-profile-avatar')).toHaveAttribute('data-visual-asset-id', /character\./);
  await expect(card).not.toContainText(/Honey balance|Spend Honey|Thread Dust|Temper|Relic Pouch/);

  const metrics = await page.evaluate(() => {
    const cardElement = document.querySelector('[data-testid="stream-command-card"]');
    const nav = document.querySelector('.threadbound-topnav');
    const dismiss = cardElement?.querySelector('[data-rich-card-dismiss="true"]');
    const cardRect = cardElement?.getBoundingClientRect();
    const navRect = nav?.getBoundingClientRect();
    const dismissRect = dismiss?.getBoundingClientRect();
    return {
      width: cardElement?.scrollWidth || 0,
      cardTop: cardRect?.top || 0,
      navBottom: navRect?.bottom || 0,
      viewportWidth: window.innerWidth,
      right: cardRect?.right || 0,
      dismissWidth: dismissRect?.width || 0,
      dismissHeight: dismissRect?.height || 0,
    };
  });
  expect(metrics.width).toBeLessThanOrEqual(390);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.cardTop).toBeGreaterThanOrEqual(metrics.navBottom);
  expect(metrics.dismissWidth).toBeGreaterThanOrEqual(44);
  expect(metrics.dismissHeight).toBeGreaterThanOrEqual(44);

  mkdirSync(REVIEW_DIR, { recursive: true });
  await page.screenshot({ path: `${REVIEW_DIR}/simulated-profile-mobile.png`, fullPage: true });
});

test('typed profile command only resolves current Guild Hall simulated adventurers', async ({ page }) => {
  await login(page);

  await page.getByTestId('stream-message').fill('profile Mira');
  await page.getByTestId('stream-send').click();
  const card = page.getByTestId('stream-command-card');
  await expect(card).toHaveAttribute('data-rich-card-kind', 'simulated-profile');
  await expect(card.getByTestId('simulated-profile-name')).toHaveText('Mira');
  await expect(card.getByTestId('simulated-profile-level')).toHaveText('5');
  await expect(card.getByTestId('simulated-profile-area')).toHaveText('2');

  await page.getByTestId('stream-message').fill('profile not-a-guild-adventurer');
  await page.getByTestId('stream-send').click();
  await expect(page.getByTestId('stream-error')).toContainText('No current Guild Hall adventurer matches');
});
