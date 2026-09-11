import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

async function dashboard(page) {
  const response = await page.request.get('/api/dashboard');
  expect(response.ok()).toBe(true);
  return response.json();
}

test('mobile Inventory context exposes the authoritative five readable stats without cluttering Play', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('local-login-a').click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');

  const data = await dashboard(page);
  expect(data.character.stats).toEqual({
    attack: 6,
    defense: 2,
    maxHp: 40,
    speed: 10,
    critChance: 0.05,
    critChancePercent: 5,
  });
  expect(data.character.attackPower).toBe(data.character.stats.attack);
  expect(data.character.maxHealth).toBe(data.character.stats.maxHp);

  // The chat-first Play surface intentionally hides the legacy character panel. Readable
  // stats belong in the existing secondary Inventory context until the rich Profile card
  // lands in M2-04; do not reintroduce a tactical/dashboard panel into primary play.
  await expect(page.getByTestId('character-derived-stats')).toBeHidden();
  await page.getByTestId('mobile-game-nav').getByText('Inventory', { exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-game-view', 'gear');

  const strip = page.getByTestId('character-derived-stats');
  await expect(strip).toBeVisible();
  await expect(page.getByTestId('character-stat-attack')).toContainText('Attack6');
  await expect(page.getByTestId('character-stat-defense')).toContainText('Defense2');
  await expect(page.getByTestId('character-stat-max-hp')).toContainText('Max HP40');
  await expect(page.getByTestId('character-stat-speed')).toContainText('Speed10');
  await expect(page.getByTestId('character-stat-crit')).toContainText('Crit5%');

  const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(bodyWidth).toBeLessThanOrEqual(390);

  await mkdir('ux-review', { recursive: true });
  await page.screenshot({ path: 'ux-review/derived-stats-mobile.png', fullPage: true });
});
