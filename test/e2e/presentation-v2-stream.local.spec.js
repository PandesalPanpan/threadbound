import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

async function login(page, slot) {
  await page.goto('/');
  await page.getByTestId(`local-login-${slot}`).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  await expect(page.getByTestId('stream-player-status')).toHaveAttribute('aria-label', /HP, party \d of 2/i);
}

async function runCommand(page, command) {
  await page.getByTestId('stream-message').fill(command);
  await page.getByTestId('stream-send').click();
}

test.describe('presentation v2 Adventure Stream', () => {
  test('mobile stream distinguishes roles and keeps only the newest rich card interactive', async ({ browser }) => {
    const firstContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const secondContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const first = await firstContext.newPage();
    const second = await secondContext.newPage();
    await login(first, 'a');
    await login(second, 'b');

    const selfMessage = `player-message-${Date.now()}`;
    await runCommand(first, selfMessage);
    await expect(first.getByTestId('stream-chat-entry').filter({ hasText: selfMessage }).last()).toHaveAttribute('data-message-role', 'player');

    const partnerMessage = `partner-message-${Date.now()}`;
    await runCommand(second, partnerMessage);
    const partnerEntry = first.getByTestId('stream-chat-entry').filter({ hasText: partnerMessage }).last();
    await expect(partnerEntry).toBeVisible();
    await expect(partnerEntry).toHaveAttribute('data-message-role', 'partner');

    await runCommand(first, 'status');
    await expect(first.getByTestId('stream-command-card')).toHaveAttribute('data-rich-card-kind', 'status');
    await runCommand(first, 'shop');
    const current = first.getByTestId('stream-command-card');
    await expect(current).toHaveAttribute('data-rich-card-kind', 'shop');
    await expect(current.locator('[data-rich-card-action="true"]')).not.toHaveCount(0);

    const history = first.getByTestId('rich-card-history-snapshot');
    await expect(history).not.toHaveCount(0);
    const lastHistory = history.last();
    await expect(lastHistory.locator('details')).not.toHaveAttribute('open', '');
    await expect(lastHistory.locator('button, input, select, textarea, [data-rich-card-action="true"]')).toHaveCount(0);
    await lastHistory.locator('summary').click();
    await expect(lastHistory.locator('details')).toHaveAttribute('open', '');
    await expect(lastHistory).toContainText('Open the latest card to take actions');

    await runCommand(first, 'town');
    const town = first.getByTestId('stream-command-card');
    await expect(town).toHaveAttribute('data-rich-card-kind', 'town');
    await town.locator('[data-testid^="town-talk-"]').first().click();
    const npcEntry = first.locator('[data-message-role="npc"]').last();
    await expect(npcEntry).toBeVisible();
    await expect(npcEntry.locator('.stream-role-badge')).toHaveText('NPC');
    await expect(npcEntry.locator('.stream-app-badge')).toBeHidden();

    const metrics = await first.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      composerHeight: document.querySelector('[data-testid="stream-composer"]')?.getBoundingClientRect().height || 0,
      actionHeights: [...document.querySelectorAll('[data-testid="stream-suggestions"] button')]
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => element.getBoundingClientRect().height),
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewport);
    expect(metrics.composerHeight).toBeGreaterThanOrEqual(44);
    for (const height of metrics.actionHeights) expect(height).toBeGreaterThanOrEqual(44);

    await mkdir('test-results/presentation-v2', { recursive: true });
    await first.screenshot({ path: 'test-results/presentation-v2/stream-390x844.png', fullPage: true });

    await first.reload();
    await expect(first.getByTestId('app-status')).toHaveText('Ready');
    await expect(first.getByTestId('stream-chat-entry').filter({ hasText: selfMessage }).last()).toHaveAttribute('data-message-role', 'player');
    await expect(first.getByTestId('stream-chat-entry').filter({ hasText: partnerMessage }).last()).toHaveAttribute('data-message-role', 'partner');

    await firstContext.close();
    await secondContext.close();
  });

  test('desktop stream uses the same semantic message and composer system', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await login(page, 'c');
    await runCommand(page, `desktop-message-${Date.now()}`);
    await expect(page.getByTestId('stream-chat-entry').last()).toHaveAttribute('data-message-role', 'player');

    const metrics = await page.evaluate(() => {
      const stream = document.querySelector('[data-testid="adventure-stream"]')?.getBoundingClientRect();
      const composer = document.querySelector('[data-testid="stream-composer"]')?.getBoundingClientRect();
      return {
        viewport: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        streamWidth: stream?.width || 0,
        composerWidth: composer?.width || 0,
      };
    });
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewport);
    expect(metrics.streamWidth).toBeGreaterThan(600);
    expect(metrics.streamWidth).toBeLessThanOrEqual(780);
    expect(metrics.composerWidth).toBeLessThanOrEqual(metrics.streamWidth);

    await mkdir('test-results/presentation-v2', { recursive: true });
    await page.screenshot({ path: 'test-results/presentation-v2/stream-1440x960.png', fullPage: true });
  });
});
