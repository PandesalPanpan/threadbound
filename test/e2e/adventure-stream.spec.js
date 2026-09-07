import { test, expect } from '@playwright/test';

async function loginLocal(page, slot, expectedName) {
  await page.goto('/');
  await page.getByTestId(`local-login-${slot}`).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('threaded-user')).toHaveText(expectedName);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  await expect(page.getByTestId('stream-connection')).toHaveText('WebSocket live');
}

async function submitComposer(page, value) {
  await page.getByTestId('stream-message').fill(value);
  await page.getByTestId('stream-send').click();
  await expect(page.getByTestId('stream-message')).toHaveValue('');
}

test('players chat, inspect state, and exchange discrete game results in one realtime thread', async ({ browser }) => {
  const anonymousContext = await browser.newContext();
  const unauthenticatedToken = await anonymousContext.request.get('/api/realtime-token');
  expect(unauthenticatedToken.status()).toBe(401);
  await anonymousContext.close();

  const firstContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const secondContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();

  try {
    await loginLocal(first, 'c', 'Local Weaver C');
    await loginLocal(second, 'd', 'Local Weaver D');

    await expect(first.getByTestId('adventure-stream')).toBeVisible();
    await expect(first.getByTestId('stream-composer')).toBeVisible();
    await expect(first.getByTestId('stream-suggestions')).toContainText('Status');
    await expect(first.getByTestId('stream-suggestions')).toContainText('Gear');
    await expect(first.locator('.stream-hint')).toContainText('result of every action');
    const sendBox = await first.getByTestId('stream-send').boundingBox();
    expect(sendBox).not.toBeNull();
    expect(sendBox.height).toBeGreaterThanOrEqual(44);

    await submitComposer(first, '/status');
    await expect(first.getByTestId('stream-command-card')).toBeVisible();
    await expect(first.getByTestId('stream-command-card')).toContainText('Current adventure');
    await expect(first.getByTestId('stream-command-card')).toContainText('Local Weaver C');
    await expect(first.getByTestId('stream-command-card').locator('img[src="/sprites/weaver.svg"]')).toBeVisible();
    await expect(second.getByTestId('stream-command-card')).toBeHidden();

    await submitComposer(first, '/gear');
    await expect(first.getByTestId('stream-command-card')).toContainText('Relic pouch');

    await submitComposer(first, 'heal or attack?');
    const messageOnSecond = second.getByTestId('stream-chat-entry').filter({ hasText: 'heal or attack?' });
    await expect(messageOnSecond).toBeVisible();
    await expect(messageOnSecond).toContainText('Local Weaver C');

    const literalMarkup = '<img src=x onerror="window.chatInjected=true"> hello';
    await submitComposer(first, literalMarkup);
    const safeMessage = second.getByTestId('stream-chat-entry').filter({ hasText: literalMarkup });
    await expect(safeMessage).toBeVisible();
    await expect(safeMessage.locator('img')).toHaveCount(0);
    expect(await second.evaluate(() => window.chatInjected)).toBeUndefined();

    await second.getByTestId('stream-message').fill('do not erase this draft');
    await first.getByTestId('stream-start-dungeon').click();
    await expect(first.getByTestId('run-state')).toContainText('Phase: combat');
    await expect(second.getByTestId('stream-message')).toHaveValue('do not erase this draft');
    const firstEntered = second.getByTestId('stream-system-entry').filter({ hasText: /Local Weaver C entered Frayed Hollow/ });
    await expect(firstEntered).toBeVisible();
    await expect(firstEntered).toContainText('Frayed Wisp 12/12 HP');
    await expect(firstEntered).toContainText('Choose your first action');

    // The timeline + contextual row are the game UI; the old persistent combat HUD is gone.
    await expect(first.getByTestId('stream-combat-dock')).toBeHidden();
    await expect(first.getByTestId('enemy-card').locator('img[src="/sprites/frayed-wisp.svg"]')).toBeVisible();
    const attack = first.getByTestId('stream-attack');
    const guard = first.getByTestId('stream-guard');
    await expect(attack).toBeVisible();
    await expect(guard).toBeVisible();
    const guardBox = await guard.boundingBox();
    expect(guardBox).not.toBeNull();
    expect(guardBox.height).toBeGreaterThanOrEqual(44);

    await attack.click();
    const attackResult = second.getByTestId('stream-system-entry').filter({ hasText: /Local Weaver C attacked Frayed Wisp/ }).last();
    await expect(attackResult).toBeVisible({ timeout: 7000 });
    await expect(attackResult).toContainText(/Frayed Wisp \d+\/12/);
    await guard.click();
    await expect(second.getByTestId('stream-system-entry').filter({ hasText: /Local Weaver C guarded/ }).last()).toBeVisible();

    // Independent dungeon instances still coexist socially.
    await second.getByTestId('stream-message').fill('');
    await second.getByTestId('stream-start-dungeon').click();
    await expect(second.getByTestId('run-state')).toContainText('Phase: combat');
    await expect(first.getByTestId('stream-system-entry').filter({ hasText: /Local Weaver D entered Frayed Hollow/ })).toBeVisible();
    const firstState = await (await firstContext.request.get('/api/dashboard')).json();
    const secondState = await (await secondContext.request.get('/api/dashboard')).json();
    expect(firstState.activeRun.id).not.toBe(secondState.activeRun.id);

    const tooLong = await firstContext.request.post('/api/stream/messages', { data: { body: 'x'.repeat(501) } });
    expect(tooLong.status()).toBe(422);

    await second.reload();
    await expect(second.getByTestId('stream-connection')).toHaveText('WebSocket live');
    await expect(second.getByTestId('stream-chat-entry').filter({ hasText: 'heal or attack?' })).toBeVisible();
    await expect(second.getByTestId('stream-system-entry').filter({ hasText: /Local Weaver C entered Frayed Hollow/ })).toBeVisible();
    await expect(second.getByTestId('stream-system-entry').filter({ hasText: /Local Weaver C attacked Frayed Wisp/ })).toBeVisible();
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
