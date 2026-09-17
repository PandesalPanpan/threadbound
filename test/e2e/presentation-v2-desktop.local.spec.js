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

  test('keeps rail commands on the shared stream path and keeps Live Context read-only', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await login(page, 'c');

    const apiMutations = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/') && request.method() !== 'GET') apiMutations.push(new URL(request.url()).pathname);
    });

    const railContract = await page.locator('[data-testid="desktop-command-rail"] button').evaluateAll((buttons) => buttons.map((button) => ({
      type: button.type,
      command: button.dataset.command || '',
    })));
    expect(railContract).toHaveLength(7);
    expect(railContract.every(({ type, command }) => type === 'button' && command)).toBe(true);
    await expect(page.getByTestId('desktop-live-context').locator('form')).toHaveCount(0);

    await page.getByTestId('desktop-open-guild').click();
    await expect(page.getByTestId('stream-command-card')).toHaveAttribute('data-rich-card-kind', 'leaderboard');
    expect(apiMutations).toEqual([]);

    const [huntResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/api/hunt') && response.request().method() === 'POST'),
      page.getByTestId('desktop-command-hunt').click(),
    ]);
    expect(huntResponse.ok()).toBe(true);
    await expect(page.getByTestId('stream-system-entry').filter({ hasText: /Victory|Defeat|fell to/i }).last()).toBeVisible();
    expect(apiMutations).toEqual(['/api/hunt']);
  });

  test('keeps common player flows semantically identical across mobile typing and desktop rails', async ({ page }) => {
    const flows = [
      { id: 'town', command: 'town', kind: 'town' },
      { id: 'inventory', command: 'inventory', kind: 'inventory' },
      { id: 'quest', command: 'quest', kind: 'quest' },
      { id: 'bank', command: 'bank', kind: 'bank' },
      { id: 'guild-hall', command: 'leaderboard', kind: 'leaderboard' },
    ];

    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, 'b');
    await expect(page.getByTestId('desktop-command-rail')).toBeHidden();
    for (const flow of flows) {
      await page.getByTestId('stream-message').fill(flow.command);
      await page.getByTestId('stream-send').click();
      await expect(page.getByTestId('stream-command-card')).toHaveAttribute('data-rich-card-kind', flow.kind);
    }

    await page.setViewportSize({ width: 1440, height: 960 });
    await page.reload();
    await expect(page.getByTestId('app-status')).toHaveText('Ready');
    await expect(page.getByTestId('desktop-command-rail')).toBeVisible();
    await expect(page.getByTestId('mobile-game-nav')).toBeHidden();
    for (const flow of flows) {
      await page.getByTestId(`desktop-command-${flow.id}`).click();
      await expect(page.getByTestId('stream-command-card')).toHaveAttribute('data-rich-card-kind', flow.kind);
    }
  });
});
