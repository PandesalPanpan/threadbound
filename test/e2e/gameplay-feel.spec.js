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
  await page.getByTestId(testId).click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.version ?? -1, { timeout: 5000 }).toBeGreaterThan(version);
}

async function attackUntilPhaseChanges(page, context, phase, maxActions = 24) {
  for (let index = 0; index < maxActions; index += 1) {
    const state = await dashboard(context);
    if (state.activeRun?.phase !== phase) return state;
    await actAndWait(page, context, 'stream-attack');
  }
  throw new Error(`Run did not leave ${phase} after ${maxActions} attacks.`);
}

test('gameplay feel pass previews outcomes, condenses live receipts, pages history, and presents stable power cards', async ({ page, context }) => {
  test.setTimeout(90000);
  await loginWithThreaded(page);

  // Build enough durable chat history to prove the first paint stays bounded.
  for (let index = 1; index <= 42; index += 1) {
    const response = await context.request.post('/api/stream/messages', { data: { body: `history message ${index}` } });
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
  await expect.poll(async () => log.locator('.stream-entry').count(), { timeout: 5000 }).toBeGreaterThan(30);
  await expect(log.locator('.stream-history-entry').first()).toBeVisible();

  await page.getByTestId('stream-start-dungeon').click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.phase, { timeout: 5000 }).toBe('combat');
  await expect(page.getByTestId('stream-attack')).toBeVisible();

  const previewState = await dashboard(context, true);
  const expectedDamage = previewState.actionPreviews.actions.attack.damage;
  expect(expectedDamage).toBeGreaterThan(0);
  const attack = page.getByTestId('stream-attack');
  await expect.poll(async () => Number(await attack.getAttribute('data-preview-damage') || 0), { timeout: 5000 }).toBe(expectedDamage);
  await attack.hover();
  await expect(page.getByTestId('enemy-damage-preview')).toBeVisible();
  await expect(page.getByTestId('enemy-damage-preview-copy')).toContainText(`${previewState.actionPreviews.actions.attack.enemyHpBefore} → ${previewState.actionPreviews.actions.attack.enemyHpAfter} HP`);

  await actAndWait(page, context, 'stream-attack');
  await actAndWait(page, context, 'stream-guard');
  await expect.poll(async () => page.locator('[data-live-combat-receipt="true"]').count(), { timeout: 5000 }).toBeGreaterThan(0);
  const liveReceipt = page.locator('[data-live-combat-receipt="true"]').last();
  await expect(liveReceipt).toHaveAttribute('data-coalesced-count', '2');
  await expect(liveReceipt.getByTestId('stream-exchange-count')).toContainText('2 actions condensed');
  await expect(page.locator('.stream-entry.is-condensed-receipt').last()).toBeHidden();
  const animatedFill = liveReceipt.locator('.stream-health-track > span:not(.stream-health-preview)').first();
  await expect.poll(async () => animatedFill.evaluate((element) => getComputedStyle(element).transitionDuration)).toContain('0.36s');

  let state = await attackUntilPhaseChanges(page, context, 'combat');
  expect(state.activeRun.phase).toBe('event');
  const eventChoice = state.activeRun.runEvent.choices[0];
  await page.getByTestId(`run-event-choice-${eventChoice.id}`).click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.phase, { timeout: 5000 }).toBe('combat');
  state = await attackUntilPhaseChanges(page, context, 'combat');
  expect(state.activeRun.phase).toBe('upgrade');

  const cards = page.getByTestId('stream-suggestions').locator('button.run-power-card');
  await expect(cards).toHaveCount(3);
  await expect(page.getByTestId('upgrade-description-sharpen')).toContainText(/Attack/i);
  const offeredBeforeReload = await cards.evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
  expect(offeredBeforeReload).toContain('Sharpen the Thread');
  expect(new Set(offeredBeforeReload).size).toBe(3);

  const allUpgradeIds = ['sharpen', 'reinforce', 'riposte', 'disrupt'];
  const offeredIds = (await dashboard(context)).runUpgrades.map((upgrade) => upgrade.id);
  const omittedId = allUpgradeIds.find((id) => !offeredIds.includes(id));
  expect(omittedId).toBeTruthy();
  const rejected = await context.request.post(`/api/runs/${state.activeRun.id}/upgrade`, { data: { upgradeId: omittedId } });
  expect(rejected.status()).toBe(409);

  await page.reload();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  const cardsAfterReload = page.getByTestId('stream-suggestions').locator('button.run-power-card');
  await expect(cardsAfterReload).toHaveCount(3);
  const offeredAfterReload = await cardsAfterReload.evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
  expect(offeredAfterReload).toEqual(offeredBeforeReload);
});
