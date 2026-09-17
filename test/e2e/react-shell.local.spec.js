import { test, expect } from '@playwright/test';

test('React Adventure Stream exposes authoritative command cards on mobile and desktop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('local-login-d').click();
  await page.context().request.post('/api/party/leave');
  await page.goto('/game-react');

  await expect(page.getByTestId('stream-player-status')).toBeVisible();
  await expect(page.getByTestId('adventure-stream-log')).toBeVisible();
  await expect(page.getByTestId('stream-message')).toBeVisible();
  await expect(page.getByTestId('stream-connection')).toBeVisible();
  await expect(page.getByTestId('stream-context-hunt')).toBeVisible();

  const composer = page.getByTestId('stream-message');
  await composer.fill('inventory');
  await composer.press('Enter');
  await expect(page.getByTestId('inventory-rich-card')).toBeVisible();

  await composer.fill('shop');
  await composer.press('Enter');
  await expect(page.getByTestId('shop-rich-card')).toBeVisible();
  await expect(page.getByTestId('shop-offer').first()).toBeVisible();

  await composer.fill('bank');
  await composer.press('Enter');
  await expect(page.getByTestId('bank-rich-card')).toBeVisible();

  await composer.fill('party');
  await composer.press('Enter');
  await expect(page.getByTestId('stream-command-card')).toHaveAttribute('data-rich-card-kind', 'party');
  await page.getByRole('button', { name: 'Create Party' }).click();
  await expect(page.getByRole('button', { name: 'Leave Party' })).toBeVisible();

  await composer.fill('area');
  await composer.press('Enter');
  await expect(page.getByTestId('area-rich-card')).toBeVisible();

  await composer.fill('quest');
  await composer.press('Enter');
  await expect(page.getByTestId('quest-rich-card')).toBeVisible();
  await expect(page.getByTestId('stream-chat-entry').last()).toContainText('quest');
  await page.screenshot({ path: 'ux-review/react-shell-mobile.png', fullPage: true });

  await composer.fill('party');
  await composer.press('Enter');
  await page.getByRole('button', { name: 'Leave Party' }).click();
  await expect(page.getByTestId('stream-command-card').getByText('Solo thread')).toBeVisible();
  await composer.fill('hunt');
  await composer.press('Enter');
  await expect(page.getByTestId('hunt-rich-card')).toBeVisible();
  await expect(page.locator('.stream-system-entry').last()).toContainText(/Hunt|hunted|defeated/i);

  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(page.getByTestId('quick-dungeon')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Live Context' })).toBeVisible();
  await expect(page.getByTestId('adventure-stream-log')).toHaveCSS('overflow-y', 'auto');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  await page.screenshot({ path: 'ux-review/react-shell-desktop.png', fullPage: true });
});
