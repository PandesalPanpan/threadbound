import { test, expect } from '@playwright/test';

async function login(page, slot = 'd') {
  await page.goto('/');
  await page.getByTestId(`local-login-${slot}`).click();
  await page.context().request.post('/api/party/leave');
  await page.goto('/game');
}

async function command(page, value) {
  const composer = page.getByTestId('stream-message');
  await composer.fill(value);
  await composer.press('Enter');
}

test('React shell embeds the server-ranked Guild Hall with profile and Duel receipts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  await command(page, 'leaderboard');
  const card = page.getByTestId('leaderboard-rich-card');
  await expect(card).toBeVisible();
  await expect(card.getByTestId('leaderboard-list')).toBeVisible();
  const rival = card.locator('[data-testid^="leaderboard-row-"]').filter({ hasText: 'Rook' }).first();
  await expect(rival).toBeVisible();
  await command(page, 'profile guild-rook');
  await expect(card.getByTestId('shell-simulated-profile')).toBeVisible();
  await expect(card.getByTestId('shell-profile-name')).toContainText('Rook');
  await rival.getByRole('button', { name: 'Profile' }).click();
  await expect(card.getByTestId('shell-simulated-profile')).toBeVisible();
  await expect(card.getByTestId('shell-profile-name')).toContainText('Rook');

  await rival.getByRole('button', { name: /Duel/ }).click();
  await expect(card.getByTestId('shell-duel-result')).toBeVisible();
  await expect(page.getByTestId('stream-system-entry').last()).toContainText(/Duel|duel/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('React shell embeds Gold games and server-backed Blackjack state', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'c');
  const hunt = await page.context().request.post('/api/hunt');
  expect(hunt.ok()).toBe(true);

  await command(page, 'gambling');
  const card = page.getByTestId('gambling-rich-card');
  await expect(card).toBeVisible();
  await expect(card.getByText('Choose a Gold game')).toBeVisible();

  await command(page, 'blackjack 1');
  await expect(card).toBeVisible();
  await expect(card.locator('[data-testid="shell-blackjack-active"], [data-testid="shell-blackjack-result"]')).toBeVisible();
  if (await card.getByTestId('shell-blackjack-active').count()) {
    await card.getByTestId('shell-blackjack-stand').click();
    await expect(card.getByTestId('shell-blackjack-result')).toBeVisible();
  }

  await command(page, 'coinflip');
  await expect(card).toContainText('Coinflip');
  await expect(card).toContainText('coinflip <wager> heads or tails');
  await command(page, 'slots');
  await expect(card).toContainText('Slots');
  await expect(card).toContainText('slots <wager>');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
