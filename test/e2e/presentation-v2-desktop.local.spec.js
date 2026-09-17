import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

async function login(page, slot) {
  await page.goto('/');
  await page.getByTestId(`local-login-${slot}`).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
}

test.describe('presentation v2 desktop player shell', () => {
  test('uses the Figma command rail, dominant stream, and read-only live context', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await login(page, 'd');

    await expect(page.getByTestId('desktop-command-rail')).toBeVisible();
    await expect(page.getByTestId('desktop-live-context')).toBeVisible();
    await expect(page.getByTestId('desktop-context-note')).toHaveText('Read-only context. Actions happen in the shared Adventure Stream.');
    await expect(page.getByTestId('desktop-command-rail')).toContainText('Guild Hall');
    await expect(page.getByTestId('desktop-current-area-card')).toContainText('Area 1');
    await expect(page.getByTestId('desktop-active-quest-card')).toContainText('Guild Field Check');
    await expect(page.getByTestId('desktop-guild-snapshot-card')).toContainText('Guild Hall');

    const metrics = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
      const rail = rect('[data-testid="desktop-command-rail"]');
      const center = rect('[data-testid="desktop-player-center"]');
      const context = rect('[data-testid="desktop-live-context"]');
      const stream = rect('[data-testid="adventure-stream"]');
      return {
        viewport: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        railWidth: rail?.width || 0,
        centerWidth: center?.width || 0,
        contextWidth: context?.width || 0,
        streamWidth: stream?.width || 0,
        streamTop: stream?.top || 0,
        navBottom: document.querySelector('.threadbound-topnav')?.getBoundingClientRect().bottom || 0,
      };
    });
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewport);
    expect(metrics.railWidth).toBe(240);
    expect(metrics.centerWidth).toBe(780);
    expect(metrics.contextWidth).toBe(420);
    expect(metrics.streamWidth).toBe(778);
    expect(metrics.streamTop).toBe(metrics.navBottom);

    await page.getByTestId('desktop-command-town').click();
    await expect(page.getByTestId('stream-command-card')).toHaveAttribute('data-rich-card-kind', 'town');

    await page.getByTestId('desktop-open-guild').click();
    await expect(page.getByTestId('stream-command-card')).toHaveAttribute('data-rich-card-kind', 'leaderboard');

    await mkdir('test-results/presentation-v2', { recursive: true });
    await page.screenshot({ path: 'test-results/presentation-v2/desktop-player-1440x960.png', fullPage: true });
  });
});
