import { test, expect } from '@playwright/test';

async function loginWithThreaded(page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Connect with Threaded' }).click();
  await expect(page.getByRole('heading', { name: 'Fake Threaded' })).toBeVisible();
  await page.getByRole('button', { name: 'Authorize Threadbound' }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
}

async function dashboard(context) {
  const response = await context.request.get('/api/dashboard');
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

test('decision state, forecast, run choices, and navigation are visually separated and truthful', async ({ page, context }) => {
  test.setTimeout(80000);
  await loginWithThreaded(page);

  const primary = page.getByTestId('stream-primary-actions');
  const meta = page.getByTestId('stream-meta-actions');
  await expect(primary).toBeVisible({ timeout: 5000 });
  await expect(meta).toBeVisible();
  await expect(page.getByTestId('stream-action-mode')).toHaveText('START ADVENTURE');
  await expect(meta.getByRole('button', { name: 'Dungeons' })).toBeVisible();
  await expect(meta.getByRole('button', { name: 'Status' })).toBeVisible();
  await expect(meta.getByRole('button', { name: 'Gear' })).toBeVisible();
  await expect(meta.getByRole('button', { name: 'Party' })).toBeVisible();
  await expect(meta.getByRole('button', { name: 'Codex' })).toBeVisible();
  await expect(meta.getByRole('button', { name: 'World' })).toBeVisible();
  await expect(meta.getByRole('button', { name: 'Honey' })).toBeVisible();

  await page.getByTestId('stream-start-dungeon').click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.phase, { timeout: 5000 }).toBe('combat');

  const snapshot = page.getByTestId('stream-decision-snapshot');
  await expect(snapshot).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('stream-action-mode')).toHaveText('COMBAT ACTIONS');
  await expect(page.getByTestId('stream-decision-you-hp')).toHaveText(/\d+ \/ \d+ HP/);
  await expect(page.getByTestId('stream-decision-focus')).toHaveText(/Focus \d+ \/ \d+/);
  await expect(page.getByTestId('stream-decision-enemy-hp')).toHaveText(/\d+ \/ \d+ HP/);

  const forecast = page.getByTestId('stream-action-forecast');
  await expect(forecast).toBeVisible();
  await expect(forecast).toContainText('PROJECTED · ATTACK');
  await expect(forecast).toContainText(/Enemy HP \d+ → \d+/);
  const forecastValue = page.getByTestId('stream-action-forecast-value');
  await expect(forecastValue).toHaveText(/−\d+/);
  expect(await forecast.evaluate((element) => getComputedStyle(element).borderTopColor)).toBe('rgb(255, 228, 92)');
  expect(await forecastValue.evaluate((element) => getComputedStyle(element).color)).toBe('rgb(255, 243, 163)');

  // Navigation is a separate visual surface. Its hidden command sources do not compete
  // with the visible run-action row.
  await expect(page.getByTestId('stream-suggestions').getByRole('button', { name: 'Status' })).toHaveCount(0);
  await expect(page.getByTestId('stream-suggestions').getByRole('button', { name: 'Gear' })).toHaveCount(0);
  await expect(page.getByTestId('stream-attack')).toBeVisible();
  await expect(page.getByTestId('stream-guard')).toBeVisible();

  let state = await attackUntilPhaseChanges(page, context, 'combat');
  expect(state.activeRun?.phase).toBe('upgrade');
  await expect(page.getByTestId('stream-action-mode')).toHaveText('RUN UPGRADE', { timeout: 5000 });
  await expect(snapshot).toBeVisible();
  await expect(page.getByTestId('stream-decision-you-hp')).toHaveText(`${state.activeRun.viewer.hp} / ${state.activeRun.viewer.maxHp} HP`);
  await expect(page.getByTestId('stream-decision-focus')).toHaveText(`Focus ${state.activeRun.viewer.focus} / ${state.activeRun.viewer.maxFocus}`);
  const cards = page.getByTestId('stream-suggestions').locator('button.run-power-card:not([hidden])');
  await expect(cards).toHaveCount(3);
  await expect(page.getByTestId('stream-attack')).toHaveCount(0);

  await cards.first().click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.phase, { timeout: 5000 }).toBe('combat');
  state = await dashboard(context);

  const transition = page.locator('.stream-entry-transition').last();
  await expect(transition.getByTestId('stream-next-enemy')).toContainText(state.activeRun.enemy.name, { timeout: 5000 });
  await expect(transition.getByTestId('stream-transition-player-state')).toBeVisible({ timeout: 5000 });
  await expect(transition.getByTestId('stream-transition-you-hp')).toHaveText(`YOU · ${state.activeRun.viewer.hp}/${state.activeRun.viewer.maxHp} HP`);
  await expect(transition.getByTestId('stream-transition-you-focus')).toHaveText(`Focus ${state.activeRun.viewer.focus}/${state.activeRun.viewer.maxFocus}`);
  await expect(transition.getByTestId('stream-transition-preview')).toContainText('PROJECTED · ATTACK');
  await expect(transition.getByTestId('stream-transition-preview-value')).toHaveText(/−\d+/);

  state = await attackUntilPhaseChanges(page, context, 'combat');
  expect(state.activeRun?.phase).toBe('event');
  await expect(page.getByTestId('stream-action-mode')).toHaveText('RUN DISCOVERY', { timeout: 5000 });
  await expect(primary.getByTestId('run-event-card')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('stream-attack')).toHaveCount(0);
  await expect(meta.getByRole('button', { name: 'Status' })).toBeVisible();
});
