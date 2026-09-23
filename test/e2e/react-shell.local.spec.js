import { test, expect } from '@playwright/test';

test('React Adventure Stream exposes authoritative command cards on mobile and desktop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('local-login-d').click();
  await page.context().request.post('/api/party/leave');
  await page.goto('/game');

  await expect(page.getByTestId('adventure-stream-log')).toBeVisible();
  await expect(page.getByTestId('stream-message')).toBeVisible();
  await expect(page.getByTestId('stream-connection')).toBeVisible();
  await expect(page.getByTestId('stream-context-hunt')).toBeVisible();

  const composer = page.getByTestId('stream-message');
  const dashboard = await (await page.context().request.get('/api/dashboard')).json();
  await composer.fill('status');
  await composer.press('Enter');
  const status = page.getByTestId('stream-player-status').last();
  await expect(status).toBeVisible();
  await expect(status.getByTestId('status-signature-skill')).toContainText(dashboard.character.signatureSkill.name);
  await expect(status.getByTestId('status-signature-skill')).toContainText(`${dashboard.character.signatureSkill.manaCost} Mana`);
  await composer.fill('inventory');
  await composer.press('Enter');
  await expect(page.getByTestId('stream-inventory-rich-card').last()).toBeVisible();
  await expect(page.getByTestId('inventory-rich-card')).toHaveCount(0);

  await composer.fill('shop');
  await composer.press('Enter');
  await expect(page.getByTestId('stream-shop-rich-card').last()).toBeVisible();
  await expect(page.getByTestId('stream-shop-item').first()).toBeVisible();
  await expect(page.getByTestId('shop-rich-card')).toHaveCount(0);

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
  const areaCard = page.getByTestId('area-rich-card');
  await expect(areaCard).toBeVisible();
  const areaPayload = await (await page.context().request.get('/api/areas')).json();
  await expect(areaCard.getByTestId('area-recommended-level')).toContainText(String(areaPayload.area.currentAreaContent.recommendedLevel.min));
  const nextLocked = areaPayload.area.nextLockedArea;
  await expect(areaCard.getByTestId('next-locked-area')).toContainText(nextLocked.name);
  await expect(areaCard.getByTestId('next-locked-area')).toContainText(nextLocked.progressionChallenge.name);
  await expect(areaCard.getByTestId('next-locked-area')).toContainText(nextLocked.lockReason);
  await expect(areaCard.getByTestId('next-area-recommended-level')).toContainText(String(nextLocked.recommendedLevel.min));
  await areaCard.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: 'ux-review/react-area-rich-card-mobile.png' });

  await composer.fill('quest');
  await composer.press('Enter');
  await expect(page.getByTestId('quest-rich-card')).toBeVisible();
  await expect(page.getByTestId('stream-chat-entry').last()).toContainText('quest');
  await composer.fill('world');
  await composer.press('Enter');
  await expect(page.getByTestId('world-rich-card')).toBeVisible();
  await composer.fill('honey');
  await composer.press('Enter');
  await expect(page.getByTestId('honey-rich-card')).toBeVisible();
  await page.screenshot({ path: 'ux-review/react-shell-mobile.png', fullPage: true });

  await composer.fill('party');
  await composer.press('Enter');
  await page.getByRole('button', { name: 'Leave Party' }).click();
  await expect(page.getByTestId('stream-command-card').getByText('Solo thread')).toBeVisible();
  await composer.fill('hunt');
  await composer.press('Enter');
  await expect(page.getByTestId('stream-hunt-rich-card').last()).toBeVisible();
  await expect(page.getByTestId('stream-hunt-rich-card').last().getByTestId('shared-battle-surface')).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 960 });
  await composer.fill('area');
  await composer.press('Enter');
  const desktopAreaCard = page.getByTestId('area-rich-card');
  await expect(desktopAreaCard.getByTestId('area-recommended-level')).toContainText(String(areaPayload.area.currentAreaContent.recommendedLevel.min));
  await desktopAreaCard.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: 'ux-review/react-area-rich-card-desktop.png' });

  await composer.fill('help');
  await composer.press('Enter');
  await expect(page.getByTestId('stream-command-card')).toBeVisible();
  await expect(composer).toBeFocused();
  await expect(page.getByTestId('quick-dungeon')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Live Context' })).toBeVisible();
  await expect(page.getByTestId('adventure-stream-log')).toHaveCSS('overflow-y', 'auto');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  await page.screenshot({ path: 'ux-review/react-shell-desktop.png', fullPage: true });
});
