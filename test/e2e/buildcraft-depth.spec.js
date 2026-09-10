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
  const action = page.getByTestId(testId);
  await expect(action).toBeVisible({ timeout:5000 });
  await expect(action).toBeEnabled({ timeout:5000 });
  await action.click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.version ?? -1, { timeout:5000 }).toBeGreaterThan(version);
}

async function reactiveTurn(page, context) {
  const state = await dashboard(context);
  const reaction = state.activeRun?.enemyIntent?.reaction;
  if (reaction === 'interrupt') return actAndWait(page, context, 'stream-interrupt');
  if (reaction === 'guard') return actAndWait(page, context, 'stream-guard');
  return actAndWait(page, context, 'stream-attack');
}

test('new runs stay chat-first and reach the boss without temporary buildcraft', async ({ page, context }) => {
  test.setTimeout(90000);
  await loginWithThreaded(page);
  await page.getByTestId('stream-start-dungeon').click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.phase, { timeout:5000 }).toBe('combat');

  let state = await dashboard(context);
  expect(state.activeRun.streamlinedLoop).toBe(true);
  expect(state.activeRun.runEventSchedule).toBeNull();
  expect(state.activeRun.runPowerDraftsEnabled).toBe(false);
  expect(state.activeRun.selectedUpgrades).toEqual([]);
  expect(state.runUpgrades || []).toEqual([]);
  await expect(page.getByTestId('stream-build-summary')).toBeHidden();

  for (let turn = 0; turn < 80; turn += 1) {
    state = await dashboard(context);
    if (state.activeRun?.phase !== 'combat') break;
    await reactiveTurn(page, context);
  }

  state = await dashboard(context);
  expect(state.activeRun.phase).toBe('boss');
  expect(state.activeRun.enemy.isBoss).toBe(true);
  expect(state.activeRun.runAttackBonus).toBe(0);
  expect(state.activeRun.selectedUpgrade).toBeNull();
  expect(state.activeRun.selectedUpgrades).toEqual([]);
  expect(state.activeRun.runEventHistory).toEqual([]);
  expect(state.activeRun.runUpgradeOfferIds).toEqual([]);
  await expect(page.getByTestId('stream-build-summary')).toBeHidden();

  const local = page.getByTestId('stream-thread-local');
  await expect(local).toBeVisible();
  await expect(local.getByTestId('stream-attack')).toBeVisible();
  expect(await local.evaluate((node) => Boolean(node.closest('[data-testid="adventure-stream-log"]')))).toBe(true);

  await page.reload();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  await expect(page.getByTestId('stream-build-summary')).toBeHidden();
  state = await dashboard(context);
  expect(state.activeRun.phase).toBe('boss');
  expect(state.activeRun.selectedUpgrades).toEqual([]);
});
