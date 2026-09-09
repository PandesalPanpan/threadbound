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
  const action = page.getByTestId(testId);
  await expect(action).toBeVisible({ timeout:5000 });
  await action.click();
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

async function offeredCards(page) {
  const cards = page.getByTestId('stream-suggestions').locator('button.run-power-card:not([hidden])');
  await expect(cards).toHaveCount(3);
  return cards;
}

async function chooseEvent(page, context) {
  const state = await dashboard(context);
  expect(state.activeRun?.phase).toBe('event');
  const eventChoice = state.activeRun.runEvent.choices[0];
  const version = state.activeRun.version;
  await page.getByTestId(`run-event-choice-${eventChoice.id}`).click();
  await expect.poll(async () => {
    const next = await dashboard(context);
    return next.activeRun?.phase === 'combat' && next.activeRun.version > version;
  }, { timeout: 5000 }).toBe(true);
  const next = await dashboard(context);
  await expect(page.getByTestId('stream-next-enemy').last()).toContainText(next.activeRun.enemy.name, { timeout:5000 });
  await expect(page.getByTestId('stream-next-enemy-hp').last()).toHaveText(`${next.activeRun.enemy.hp} / ${next.activeRun.enemy.maxHp} HP`);
}

test('gameplay feel previews outcomes, uses semantic colors, condenses receipts, pages history, and keeps build depth at one boss milestone', async ({ page, context }) => {
  test.setTimeout(100000);
  await loginWithThreaded(page);

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
  const previewState = await dashboard(context, true);
  const expectedDamage = previewState.actionPreviews.actions.attack.damage;
  const expectedRetaliation = previewState.actionPreviews.actions.attack.retaliation;
  expect(expectedDamage).toBeGreaterThan(0);
  const attack = page.getByTestId('stream-attack');
  await expect.poll(async () => Number(await attack.getAttribute('data-preview-damage') || 0), { timeout: 5000 }).toBe(expectedDamage);
  const beforeHover = await attack.boundingBox();
  const rowBeforeHover = await page.getByTestId('stream-suggestions').boundingBox();
  await attack.hover();
  await expect(page.getByTestId('enemy-damage-preview')).toBeVisible();
  const afterHover = await attack.boundingBox();
  const rowAfterHover = await page.getByTestId('stream-suggestions').boundingBox();
  expect(afterHover?.width).toBe(beforeHover?.width);
  expect(afterHover?.height).toBe(beforeHover?.height);
  expect(rowAfterHover?.height).toBe(rowBeforeHover?.height);
  const previewCopy = page.getByTestId('enemy-damage-preview-copy');
  await expect(previewCopy).toContainText(`${previewState.actionPreviews.actions.attack.enemyHpBefore} → ${previewState.actionPreviews.actions.attack.enemyHpAfter} HP`);
  const forecastColor = await previewCopy.evaluate((element) => getComputedStyle(element).color);
  expect(forecastColor).toBe('rgb(255, 228, 92)');

  await actAndWait(page, context, 'stream-attack');
  const attackReceipt = page.locator('.stream-entry-rich.stream-action-attack').last();
  await expect(attackReceipt.locator('.combat-metric.damage')).toHaveText(String(expectedDamage));
  await expect(attackReceipt.locator('.stream-result-chip.damage-out')).toContainText(`−${expectedDamage}`);
  if (expectedRetaliation > 0) await expect(attackReceipt.locator('.stream-result-chip.damage-in')).toContainText(`−${expectedRetaliation} HP`);
  const confirmedColor = await attackReceipt.locator('.combat-metric.damage').evaluate((element) => getComputedStyle(element).color);
  expect(confirmedColor).not.toBe(forecastColor);

  // Frayed Wisp now demonstrates the contextual-action budget: its recovery telegraph makes
  // Interrupt appear while irrelevant Guard stays out of the primary surface.
  await expect(page.getByTestId('stream-guard')).toBeHidden();
  await actAndWait(page, context, 'stream-interrupt');
  const interruptReceipt = page.locator('.stream-entry-rich.stream-action-interrupt').last();
  await expect(interruptReceipt).toBeVisible();
  await expect(interruptReceipt.locator('.stream-result-chip.damage-in')).toHaveCount(0);
  await expect.poll(async () => page.locator('[data-live-combat-receipt="true"]').count(), { timeout: 5000 }).toBeGreaterThan(0);
  const liveReceipt = page.locator('[data-live-combat-receipt="true"]').last();
  await expect(liveReceipt).toHaveAttribute('data-coalesced-count', '2');
  await expect(liveReceipt.getByTestId('stream-exchange-count')).toContainText('2 actions condensed');
  await expect(page.locator('.stream-entry.is-condensed-receipt').last()).toBeHidden();
  const animatedFill = liveReceipt.locator('.stream-health-track > span:not(.stream-health-preview)').first();
  await expect.poll(async () => animatedFill.evaluate((element) => getComputedStyle(element).transitionDuration)).toContain('0.32s');

  let state = await attackUntilPhaseChanges(page, context, 'combat');
  expect(state.activeRun.phase).toBe('event');
  expect(state.activeRun.selectedUpgrades).toHaveLength(0);
  await chooseEvent(page, context);

  state = await attackUntilPhaseChanges(page, context, 'combat');
  expect(state.activeRun.phase).toBe('upgrade');
  expect(state.activeRun.runUpgradeResume).toBeNull();
  await expect(page.getByTestId('stream-action-mode')).toHaveText('BOSS PREPARATION', { timeout:5000 });
  let cards = await offeredCards(page);
  const categories = await cards.locator('.run-power-category').allTextContents();
  expect(categories.some((text) => text.includes('OFFENSE'))).toBe(true);
  expect(categories.some((text) => text.includes('SUSTAIN'))).toBe(true);
  expect(categories.some((text) => text.includes('TECHNIQUE'))).toBe(true);
  await expect(cards.locator('.run-power-description').first()).not.toBeEmpty();
  const offer = (await dashboard(context)).runUpgrades.map((upgrade) => upgrade.id);
  expect(offer).toHaveLength(3);

  const allUpgradeIds = ['sharpen', 'needle-rush', 'tempered-edge', 'reinforce', 'deep-bind', 'silk-ward', 'riposte', 'disrupt', 'warping-riposte', 'breaker-knot'];
  const omittedId = allUpgradeIds.find((id) => !offer.includes(id));
  expect(omittedId).toBeTruthy();
  const rejected = await context.request.post(`/api/runs/${state.activeRun.id}/upgrade`, { data: { upgradeId: omittedId } });
  expect(rejected.status()).toBe(409);

  const offeredBeforeReload = await cards.evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
  await page.reload();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  cards = await offeredCards(page);
  expect(await cards.evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))).toEqual(offeredBeforeReload);
  await cards.first().click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.phase, { timeout: 5000 }).toBe('boss');
  await expect.poll(async () => (await dashboard(context)).activeRun?.selectedUpgrades?.length || 0, { timeout: 5000 }).toBe(1);
  const nextState = await dashboard(context);
  await expect(page.getByTestId('stream-next-enemy').last()).toContainText(nextState.activeRun.enemy.name, { timeout:5000 });
  await expect(page.getByTestId('stream-next-enemy-hp').last()).toHaveText(`${nextState.activeRun.enemy.maxHp} / ${nextState.activeRun.enemy.maxHp} HP`);
});
