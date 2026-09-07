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

test('two independent players share realtime chat and system activity over WebSocket without refreshing', async ({ browser }) => {
  const anonymousContext = await browser.newContext();
  const unauthenticatedToken = await anonymousContext.request.get('/api/realtime-token');
  expect(unauthenticatedToken.status()).toBe(401);
  await anonymousContext.close();

  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();

  try {
    await loginLocal(first, 'a', 'Local Weaver A');
    await loginLocal(second, 'b', 'Local Weaver B');

    await sendMessage(first, 'heal or attack?');
    const messageOnSecond = second.getByTestId('stream-chat-entry').filter({ hasText: 'heal or attack?' });
    await expect(messageOnSecond).toBeVisible();
    await expect(messageOnSecond).toContainText('Local Weaver A');

    await sendMessage(second, 'attack, I am full HP');
    await expect(first.getByTestId('stream-chat-entry').filter({ hasText: 'attack, I am full HP' })).toBeVisible();

    const literalMarkup = '<img src=x onerror="window.chatInjected=true"> hello';
    await sendMessage(first, literalMarkup);
    const safeMessage = second.getByTestId('stream-chat-entry').filter({ hasText: literalMarkup });
    await expect(safeMessage).toBeVisible();
    await expect(safeMessage.locator('img')).toHaveCount(0);
    expect(await second.evaluate(() => window.chatInjected)).toBeUndefined();

    await first.getByTestId('start-dungeon').first().click();
    await expect(first.getByTestId('run-state')).toContainText('Phase: combat');
    const firstEntered = second.getByTestId('stream-system-entry').filter({ hasText: 'Local Weaver A entered Frayed Hollow.' });
    await expect(firstEntered).toBeVisible();
    await expect(firstEntered).toContainText('DUNGEON STARTED');

    await second.getByTestId('start-dungeon').first().click();
    await expect(second.getByTestId('run-state')).toContainText('Phase: combat');
    await expect(first.getByTestId('stream-system-entry').filter({ hasText: 'Local Weaver B entered Frayed Hollow.' })).toBeVisible();

    const firstDashboard = await firstContext.request.get('/api/dashboard');
    const secondDashboard = await secondContext.request.get('/api/dashboard');
    const firstState = await firstDashboard.json();
    const secondState = await secondDashboard.json();
    expect(firstState.activeRun.id).not.toBe(secondState.activeRun.id);
    expect(firstState.activeRun.ownerType).toBe('player');
    expect(secondState.activeRun.ownerType).toBe('player');

    await expect(second.getByTestId('stream-system-entry').filter({ hasText: /Local Weaver A struck Frayed Wisp/ }).first()).toBeVisible({ timeout: 7000 });

    const tooLong = await firstContext.request.post('/api/stream/messages', { data: { body: 'x'.repeat(501) } });
    expect(tooLong.status()).toBe(422);
    expect((await tooLong.json()).error).toBe('invalid_chat_message');

    await second.reload();
    await expect(second.getByTestId('stream-connection')).toHaveText('WebSocket live');
    await expect(second.getByTestId('stream-chat-entry').filter({ hasText: 'heal or attack?' })).toBeVisible();
    await expect(second.getByTestId('stream-system-entry').filter({ hasText: 'Local Weaver A entered Frayed Hollow.' })).toBeVisible();
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
