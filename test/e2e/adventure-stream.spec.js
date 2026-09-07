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

function visibleTestId(page, id) {
  return page.locator(`[data-testid="${id}"]:visible`).first();
}

test('players can chat, inspect state, and fight through the realtime adventure thread', async ({ browser }) => {
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
    const sendBox = await first.getByTestId('stream-send').boundingBox();
    expect(sendBox).not.toBeNull();
    expect(sendBox.height).toBeGreaterThanOrEqual(44);

    // Slash commands are private replaceable thread replies, not global chat spam.
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

    // A remote adventure can update the shared timeline without destroying a local draft.
    await second.getByTestId('stream-message').fill('do not erase this draft');
    await first.getByTestId('stream-start-dungeon').click();
    await expect(first.getByTestId('run-state')).toContainText('Phase: combat');
    await expect(second.getByTestId('stream-message')).toHaveValue('do not erase this draft');
    const firstEntered = second.getByTestId('stream-system-entry').filter({ hasText: 'Local Weaver C entered Frayed Hollow.' });
    await expect(firstEntered).toBeVisible();

    // HP, foe identity, pixel sprite, manual attack and reactive skills all live in the thread.
    await expect(first.getByTestId('stream-combat-dock')).toBeVisible();
    await expect(first.getByTestId('stream-combat-status')).toContainText('Auto Strike ON');
    await expect(first.getByTestId('stream-combat-dock').locator('img[src="/sprites/frayed-wisp.svg"]')).toBeVisible();
    const attack = visibleTestId(first, 'stream-attack');
    const guard = visibleTestId(first, 'stream-guard');
    await expect(attack).toBeVisible();
    await expect(guard).toBeVisible();
    const guardBox = await guard.boundingBox();
    expect(guardBox).not.toBeNull();
    expect(guardBox.height).toBeGreaterThanOrEqual(44);
    await attack.click();
    await expect(second.getByTestId('stream-system-entry').filter({ hasText: /Local Weaver C struck Frayed Wisp/ }).first()).toBeVisible({ timeout: 7000 });
    await guard.click();
    await expect(second.getByTestId('stream-system-entry').filter({ hasText: 'Local Weaver C raised Guard.' }).first()).toBeVisible();

    // Independent dungeon streams coexist in the same social thread.
    await second.getByTestId('stream-message').fill('');
    await second.getByTestId('stream-start-dungeon').click();
    await expect(second.getByTestId('run-state')).toContainText('Phase: combat');
    await expect(first.getByTestId('stream-system-entry').filter({ hasText: 'Local Weaver D entered Frayed Hollow.' })).toBeVisible();
    const firstState = await (await firstContext.request.get('/api/dashboard')).json();
    const secondState = await (await secondContext.request.get('/api/dashboard')).json();
    expect(firstState.activeRun.id).not.toBe(secondState.activeRun.id);

    const tooLong = await firstContext.request.post('/api/stream/messages', { data: { body: 'x'.repeat(501) } });
    expect(tooLong.status()).toBe(422);

    await second.reload();
    await expect(second.getByTestId('stream-connection')).toHaveText('WebSocket live');
    await expect(second.getByTestId('stream-chat-entry').filter({ hasText: 'heal or attack?' })).toBeVisible();
    await expect(second.getByTestId('stream-system-entry').filter({ hasText: 'Local Weaver C entered Frayed Hollow.' })).toBeVisible();
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
