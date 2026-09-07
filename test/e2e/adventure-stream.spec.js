import { test, expect } from '@playwright/test';

async function loginLocal(page, slot, expectedName) {
  await page.goto('/');
  await page.getByTestId(`local-login-${slot}`).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('threaded-user')).toHaveText(expectedName);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  await expect(page.getByTestId('stream-connection')).toHaveText('WebSocket live');
}

async function sendMessage(page, message) {
  await page.getByTestId('stream-message').fill(message);
  await page.getByTestId('stream-send').click();
  await expect(page.getByTestId('stream-message')).toHaveValue('');
}

test('mobile and desktop players share chat and play reactively through the realtime stream', async ({ browser }) => {
  const anonymousContext = await browser.newContext();
  const unauthenticatedToken = await anonymousContext.request.get('/api/realtime-token');
  expect(unauthenticatedToken.status()).toBe(401);
  await anonymousContext.close();

  const firstContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const secondContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();

  try {
    // C/D are reserved for the independent-adventure social scenario so its intentionally
    // persistent dungeon state cannot contaminate the A/B co-op journey in the next test.
    await loginLocal(first, 'c', 'Local Weaver C');
    await loginLocal(second, 'd', 'Local Weaver D');

    await expect(first.getByTestId('adventure-stream')).toBeVisible();
    await expect(first.getByTestId('stream-composer')).toBeVisible();
    const emptyState = first.getByTestId('stream-empty');
    const existingEntries = first.locator('[data-testid="stream-chat-entry"], [data-testid="stream-system-entry"]');
    await expect.poll(async () => (await emptyState.count()) + (await existingEntries.count()), { timeout: 5000 }).toBeGreaterThan(0);
    if (await emptyState.count()) {
      const quietLog = await first.getByTestId('adventure-stream-log').boundingBox();
      expect(quietLog).not.toBeNull();
      expect(quietLog.height).toBeLessThan(180);
    }
    const sendBox = await first.getByTestId('stream-send').boundingBox();
    expect(sendBox).not.toBeNull();
    expect(sendBox.height).toBeGreaterThanOrEqual(44);

    await sendMessage(first, 'heal or attack?');
    await expect(first.getByTestId('stream-chat-entry').filter({ hasText: 'heal or attack?' })).toBeVisible();
    const messageOnSecond = second.getByTestId('stream-chat-entry').filter({ hasText: 'heal or attack?' });
    await expect(messageOnSecond).toBeVisible();
    await expect(messageOnSecond).toContainText('Local Weaver C');

    await sendMessage(second, 'attack, I am full HP');
    await expect(first.getByTestId('stream-chat-entry').filter({ hasText: 'attack, I am full HP' })).toBeVisible();

    const literalMarkup = '<img src=x onerror="window.chatInjected=true"> hello';
    await sendMessage(first, literalMarkup);
    const safeMessage = second.getByTestId('stream-chat-entry').filter({ hasText: literalMarkup });
    await expect(safeMessage).toBeVisible();
    await expect(safeMessage.locator('img')).toHaveCount(0);
    expect(await second.evaluate(() => window.chatInjected)).toBeUndefined();

    // Social activity is global, but another player's combat must not invalidate this
    // player's private UI state or replace text they are actively entering.
    await second.getByTestId('party-code-input').fill('ABC123');
    await first.getByTestId('start-dungeon').first().click();
    await expect(first.getByTestId('run-state')).toContainText('Phase: combat');
    const firstEntered = second.getByTestId('stream-system-entry').filter({ hasText: 'Local Weaver C entered Frayed Hollow.' });
    await expect(firstEntered).toBeVisible();
    await expect(firstEntered).toContainText('DUNGEON STARTED');
    await expect(second.getByTestId('party-code-input')).toHaveValue('ABC123');

    // On mobile the stream itself becomes the reactive control surface. It delegates to
    // the existing domain-backed controls rather than creating a second combat path.
    await expect(first.getByTestId('stream-combat-dock')).toBeVisible();
    await expect(first.getByTestId('stream-combat-status')).toContainText('Auto Strike ON');
    await expect(first.getByTestId('stream-guard')).toBeVisible();
    const streamGuardBox = await first.getByTestId('stream-guard').boundingBox();
    expect(streamGuardBox).not.toBeNull();
    expect(streamGuardBox.height).toBeGreaterThanOrEqual(44);
    await expect(first.getByTestId('guard')).toBeHidden();
    await first.getByTestId('stream-guard').click();
    await expect(second.getByTestId('stream-system-entry').filter({ hasText: 'Local Weaver C raised Guard.' }).first()).toBeVisible();

    await second.getByTestId('start-dungeon').first().click();
    await expect(second.getByTestId('run-state')).toContainText('Phase: combat');
    await expect(first.getByTestId('stream-system-entry').filter({ hasText: 'Local Weaver D entered Frayed Hollow.' })).toBeVisible();

    const firstDashboard = await firstContext.request.get('/api/dashboard');
    const secondDashboard = await secondContext.request.get('/api/dashboard');
    const firstState = await firstDashboard.json();
    const secondState = await secondDashboard.json();
    expect(firstState.activeRun.id).not.toBe(secondState.activeRun.id);
    expect(firstState.activeRun.ownerType).toBe('player');
    expect(secondState.activeRun.ownerType).toBe('player');

    await expect(second.getByTestId('stream-system-entry').filter({ hasText: /Local Weaver C struck Frayed Wisp/ }).first()).toBeVisible({ timeout: 7000 });

    const tooLong = await firstContext.request.post('/api/stream/messages', { data: { body: 'x'.repeat(501) } });
    expect(tooLong.status()).toBe(422);
    expect((await tooLong.json()).error).toBe('invalid_chat_message');

    await second.reload();
    await expect(second.getByTestId('stream-connection')).toHaveText('WebSocket live');
    await expect(second.getByTestId('stream-chat-entry').filter({ hasText: 'heal or attack?' })).toBeVisible();
    await expect(second.getByTestId('stream-system-entry').filter({ hasText: 'Local Weaver C entered Frayed Hollow.' })).toBeVisible();
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});