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

test('Town card shows persistent Guild Hall adventurers and an intentionally strong rival on mobile', async ({ page, context }) => {
  await login(page);

  const response = await context.request.get('/api/areas');
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  const town = payload.area.towns[0];
  expect(town.services).toContain('guild_hall');
  expect(town.guildHall.name).toBe('Guild Hall');
  expect(town.guildHall.adventurers).toHaveLength(3);
  expect(town.guildHall.adventurers.find((adventurer) => adventurer.id === 'guild-rook')).toMatchObject({
    name: 'Rook',
    level: 15,
    highestUnlockedAreaNumber: 5,
    strongRival: true,
  });

  await page.getByTestId('stream-message').fill('town');
  await page.getByTestId('stream-send').click();
  const card = page.getByTestId('stream-command-card');
  await expect(card).toHaveAttribute('data-rich-card-kind', 'town');
  await expect(card.getByTestId('town-services')).toContainText('guild hall');
  await expect(card.getByTestId('town-guild-hall')).toBeVisible();
  await expect(card.getByTestId('town-guild-adventurers').locator('.thread-town-adventurer')).toHaveCount(3);
  await expect(card.getByTestId('town-guild-adventurer-guild-rook')).toContainText('Rook');
  await expect(card.getByTestId('town-guild-adventurer-guild-rook')).toContainText('Lv 15');
  await expect(card.getByTestId('town-guild-adventurer-guild-rook')).toContainText('Reached Area 5');
  await expect(card.getByTestId('town-guild-adventurer-guild-rook')).toContainText('Dedicated');
  await expect(card.getByTestId('town-guild-rival-guild-rook')).toHaveText('Veteran rival');
  await expect(card.locator('[data-testid^="town-guild-sprite-"]')).toHaveCount(3);
  await expect(card.locator('[data-testid^="town-guild-sprite-"]').first()).toHaveAttribute('data-visual-asset-id', /character\./);
  await expect(card).not.toContainText(/Duel|Leaderboard/);

  const metrics = await page.evaluate(() => {
    const cardElement = document.querySelector('[data-testid="stream-command-card"]');
    const nav = document.querySelector('.threadbound-topnav');
    const rival = cardElement?.querySelector('[data-testid="town-guild-adventurer-guild-rook"]');
    const cardRect = cardElement?.getBoundingClientRect();
    const navRect = nav?.getBoundingClientRect();
    const rivalRect = rival?.getBoundingClientRect();
    return {
      width: cardElement?.scrollWidth || 0,
      cardTop: cardRect?.top || 0,
      navBottom: navRect?.bottom || 0,
      rivalRight: rivalRect?.right || 0,
      viewportWidth: window.innerWidth,
    };
  });
  expect(metrics.width).toBeLessThanOrEqual(390);
  expect(metrics.cardTop).toBeGreaterThanOrEqual(metrics.navBottom);
  expect(metrics.rivalRight).toBeLessThanOrEqual(metrics.viewportWidth);

  mkdirSync(REVIEW_DIR, { recursive: true });
  await page.screenshot({ path: `${REVIEW_DIR}/guild-hall-town-mobile.png`, fullPage: true });
});
