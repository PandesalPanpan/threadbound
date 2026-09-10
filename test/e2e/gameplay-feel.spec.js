import { test, expect } from '@playwright/test';

async function loginWithThreaded(page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Connect with Threaded' }).click();
  await expect(page.getByRole('heading', { name: 'Fake Threaded' })).toBeVisible();
  await page.getByRole('button', { name: 'Authorize Threadbound' }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
}

async function dashboard(context, previews = false) {
  const response = await context.request.get(`/api/dashboard${previews ? '?previews=1' : ''}`);
  expect(response.ok()).toBe(true);
  return response.json();
}

async function actAndWait(page, context, testId) {
  const before = await dashboard(context);
  const version = before.activeRun?.version ?? -1;
  const action = page.getByTestId('stream-thread-local').getByTestId(testId);
  await expect(action).toBeVisible({ timeout:7000 });
  await expect(action).toBeEnabled({ timeout:7000 });
  await action.click();
  await expect.poll(async () => {
    const after = await dashboard(context);
    if (!after.activeRun || after.activeRun.id !== before.activeRun?.id) return true;
    return (after.activeRun.version ?? -1) > version;
  }, { timeout:7000 }).toBe(true);
}

async function reactiveTurn(page, context) {
  const state = await dashboard(context);
  const reaction = state.activeRun?.enemyIntent?.reaction;
  if (reaction === 'interrupt') return actAndWait(page, context, 'stream-interrupt');
  if (reaction === 'guard') return actAndWait(page, context, 'stream-guard');
  return actAndWait(page, context, 'stream-attack');
}

async function playUntilPhase(page, context, phase, limit = 100) {
  for (let index = 0; index < limit; index += 1) {
    const state = await dashboard(context);
    if (!state.activeRun || state.activeRun.phase === phase) return state;
    if (!['combat','boss'].includes(state.activeRun.phase)) throw new Error(`Unexpected phase ${state.activeRun.phase}.`);
    await reactiveTurn(page, context);
  }
  throw new Error(`Run did not reach ${phase}.`);
}

test('gameplay feel keeps previews, semantic receipts, history, and animation while removing dashboard buildcraft', async ({ page, context }) => {
  test.setTimeout(100000);
  await loginWithThreaded(page);

  // Long chat history remains paged rather than loading the entire timeline at startup.
  for (let index = 1; index <= 42; index += 1) {
    const response = await context.request.post('/api/stream/messages', { data:{ body:`history message ${index}` } });
    expect(response.ok()).toBe(true);
  }
  await page.reload();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  const log = page.getByTestId('adventure-stream-log');
  await expect(log.locator('.stream-entry')).toHaveCount(30);
  await log.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(async () => log.locator('.stream-entry').count(), { timeout:7000 }).toBeGreaterThan(30);
  await expect(log.locator('.stream-history-entry').first()).toBeVisible();

  await page.getByTestId('stream-thread-local').getByTestId('stream-start-dungeon').click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.phase, { timeout:7000 }).toBe('combat');
  const previewState = await dashboard(context, true);
  const expectedDamage = previewState.actionPreviews.actions.attack.damage;
  expect(expectedDamage).toBeGreaterThan(0);

  // The Slay-the-Spire-style consequence preview remains on the action itself. The duplicate
  // stacked forecast card is intentionally gone.
  const attack = page.getByTestId('stream-thread-local').getByTestId('stream-attack');
  await expect(attack).toBeVisible({ timeout:7000 });
  await expect.poll(async () => Number(await attack.getAttribute('data-preview-damage') || 0), { timeout:7000 }).toBe(expectedDamage);
  await expect(page.getByTestId('stream-action-forecast')).toBeHidden();
  await expect(page.locator('.ux-transition-state')).toHaveCount(0);

  const beforeHover = await attack.boundingBox();
  await attack.hover();
  const previewCopy = page.getByTestId('enemy-damage-preview-copy');
  await expect(previewCopy).toContainText(`${previewState.actionPreviews.actions.attack.enemyHpBefore} → ${previewState.actionPreviews.actions.attack.enemyHpAfter} HP`, { timeout:7000 });
  const afterHover = await attack.boundingBox();
  expect(afterHover?.width).toBe(beforeHover?.width);
  expect(afterHover?.height).toBe(beforeHover?.height);

  await actAndWait(page, context, 'stream-attack');
  const attackReceipt = page.locator('.stream-entry-rich.stream-action-attack').last();
  await expect(attackReceipt).toBeVisible({ timeout:7000 });
  await expect(attackReceipt.locator('.combat-metric.damage')).toHaveText(String(expectedDamage));
  await expect(attackReceipt.locator('.stream-result-chip.damage-out')).toContainText(`−${expectedDamage}`);

  // The first Wisp telegraph exposes only the relevant reaction in the immediate decision row.
  await expect(page.getByTestId('stream-thread-local').getByTestId('stream-interrupt')).toBeVisible({ timeout:7000 });
  await expect(page.getByTestId('stream-thread-local').getByTestId('stream-guard')).toBeHidden();
  await actAndWait(page, context, 'stream-interrupt');
  const interruptReceipt = page.locator('.stream-entry-rich.stream-action-interrupt').last();
  await expect(interruptReceipt).toBeVisible();
  await expect(interruptReceipt.locator('.stream-result-chip.damage-in')).toHaveCount(0);

  // Consecutive combat receipts condense into one live exchange while preserving durable history.
  await expect.poll(async () => page.locator('[data-live-combat-receipt="true"]').count(), { timeout:7000 }).toBeGreaterThan(0);
  const liveReceipt = page.locator('[data-live-combat-receipt="true"]').last();
  await expect(liveReceipt.getByTestId('stream-exchange-count')).toContainText('actions condensed');
  const animatedFill = liveReceipt.locator('.stream-health-track > span:not(.stream-health-preview)').first();
  await expect.poll(async () => animatedFill.evaluate((element) => getComputedStyle(element).transitionDuration)).not.toBe('0s');

  await playUntilPhase(page, context, 'boss');
  const boss = await dashboard(context);
  expect(boss.activeRun.phase).toBe('boss');
  expect(boss.activeRun.runAttackBonus).toBe(0);
  expect(boss.activeRun.selectedUpgrades).toEqual([]);
  expect(boss.activeRun.runEventHistory).toEqual([]);
  expect(boss.runUpgrades || []).toEqual([]);
  await expect(page.getByTestId('stream-build-summary')).toBeHidden();
  await expect(page.getByTestId('stream-action-forecast')).toBeHidden();
});
