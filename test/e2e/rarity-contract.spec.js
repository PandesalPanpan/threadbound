import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Connect with Threaded' }).click();
  await page.getByRole('button', { name: 'Authorize Threadbound' }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
}

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('rarity presentation exposes the six-tier contract and styles Mythic cards without changing the chat shell', async ({ page }) => {
  await login(page);
  await expect(page.locator('html')).toHaveAttribute('data-rarity-contract', 'common-uncommon-rare-epic-legendary-mythic');
  await expect(page.locator('#stream')).toBeVisible();
  await expect(page.locator('#character')).toBeHidden();

  await page.evaluate(() => {
    const host = document.querySelector('[data-testid="stream-command-card"]') || document.querySelector('#stream');
    const card = document.createElement('article');
    card.className = 'gear-card rarity-mythic';
    card.dataset.testid = 'rarity-contract-mythic';
    card.innerHTML = '<span class="rarity-badge">Mythic · T1</span><strong>Mythic test equipment</strong>';
    host.append(card);
  });

  const mythic = page.getByTestId('rarity-contract-mythic');
  await expect(mythic).toHaveAttribute('data-rarity', 'mythic');
  await expect(mythic).toHaveAttribute('data-rarity-tier', '6');
  await expect(mythic.locator('.rarity-badge')).toHaveText('Mythic · T6');
  const rarityColor = await mythic.evaluate((element) => getComputedStyle(element).getPropertyValue('--rarity-color').trim());
  expect(rarityColor).not.toBe('');
});
