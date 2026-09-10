import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function login(page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Connect with Threaded' }).click();
  await expect(page.getByRole('heading', { name: 'Fake Threaded' })).toBeVisible();
  await page.getByRole('button', { name: 'Authorize Threadbound' }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
}

test('mobile play stays chat-first and Gear stays a clean secondary surface', async ({ page }) => {
  await login(page);

  // The approved mobile direction keeps the Adventure Stream dominant: only the
  // two simple-loop entry actions are exposed before combat, with legacy panels
  // and advanced combat/buildcraft controls absent from the play surface.
  await expect(page.locator('.simple-loop-action')).toHaveCount(2);
  await expect(page.getByTestId('stream-hunt')).toBeVisible();
  await expect(page.getByTestId('stream-start-dungeon')).toBeVisible();
  await expect(page.getByTestId('stream-guard')).toHaveCount(0);
  await expect(page.getByTestId('stream-interrupt')).toHaveCount(0);
  await expect(page.getByTestId('combat-skill-panel')).toHaveCount(0);
  await expect(page.locator('#character')).toBeHidden();
  await expect(page.locator('#dungeon')).toBeHidden();
  await expect(page.getByText(/PRIVATE THREAD REPLY/i)).toHaveCount(0);
  await expect(page.getByTestId('stream-message')).toHaveAttribute('placeholder', 'Message party or /hunt…');

  // Gear remains one tap away rather than competing with the chat. The current
  // relic artwork is intentionally the compatibility fallback until a generated
  // item/equipment atlas is committed and mapped in the presentation layer.
  const bottomNav = page.getByTestId('mobile-game-nav');
  await expect(bottomNav).toBeVisible();
  await bottomNav.getByText('Gear', { exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-game-view', 'gear');
  await expect(page.locator('#inventory')).toBeVisible();

  const items = page.getByTestId('inventory-item');
  if (await items.count()) {
    const firstItem = items.first();
    await expect(firstItem).toBeVisible();
    await expect(firstItem.locator('img').first()).toHaveAttribute('src', /\/sprites\/relic\.svg$/);
  }

  // Returning to Play restores the same uncluttered chat-first surface.
  await bottomNav.getByText('Play', { exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-game-view', 'play');
  await expect(page.locator('.simple-loop-action')).toHaveCount(2);
  await expect(page.getByTestId('stream-message')).toBeVisible();
});
