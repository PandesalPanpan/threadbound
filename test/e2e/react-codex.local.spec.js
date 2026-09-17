import { test, expect } from '@playwright/test';

test('React Codex keeps authoritative search, category, and detail navigation on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('local-login-d').click();
  await page.goto('/codex');

  await expect(page.getByTestId('codex-status')).not.toHaveText('Loading…');
  await expect(page.getByTestId('codex-search')).toBeVisible();
  await expect(page.getByTestId('codex-entry').first()).toBeVisible();
  await expect(page.getByTestId('codex-detail')).toBeVisible();

  await page.getByTestId('codex-tab-enemies').click();
  await expect(page.getByTestId('codex-entry').first()).toBeVisible();
  await expect(page.getByTestId('codex-detail')).toContainText(/enemy|wisp|hollow/i);

  await page.getByTestId('codex-search').fill('wisp');
  await expect(page.getByTestId('codex-entry').first()).toContainText(/wisp/i);
  await page.getByTestId('codex-entry').first().click();
  await expect(page.getByTestId('codex-detail-title')).toContainText(/wisp/i);
  await expect(page).toHaveURL(/\/codex#enemies\//);
  await page.screenshot({ path: 'ux-review/react-codex-mobile.png', fullPage: true });

  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(page.getByRole('navigation', { name: 'Threadbound' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  await page.screenshot({ path: 'ux-review/react-codex-desktop.png', fullPage: true });
});
