import { test, expect } from '@playwright/test';

async function login(page) {
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

async function action(page, context, testId) {
  const before = await dashboard(context);
  const version = before.activeRun?.version ?? -1;
  const button = page.getByTestId(testId);
  await expect(button).toBeVisible({ timeout:7000 });
  await expect(button).toBeEnabled({ timeout:7000 });
  await button.click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.version ?? -1, { timeout:7000 }).toBeGreaterThan(version);
}

async function reactiveAction(page, context) {
  const state = await dashboard(context);
  const reaction = state.activeRun?.enemyIntent?.reaction;
  if (reaction === 'interrupt') return action(page, context, 'stream-interrupt');
  if (reaction === 'guard') return action(page, context, 'stream-guard');
  return action(page, context, 'stream-attack');
}

test('skills stay a compact secondary row and persist their authoritative cooldown across refresh', async ({ page, context }) => {
  test.setTimeout(90000);
  await login(page);
  await page.getByTestId('stream-start-dungeon').click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.phase, { timeout:7000 }).toBe('combat');

  const local = page.getByTestId('stream-thread-local');
  const panel = page.getByTestId('combat-skill-panel');
  await expect(local).toBeVisible();
  await expect(panel).toBeVisible();
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();
  expect(await panel.evaluate((element) => Boolean(element.closest('[data-testid="adventure-stream-log"]')))).toBe(true);

  const piercing = page.getByTestId('skill-piercing-stitch');
  await expect(piercing).toBeVisible();
  const box = await piercing.boundingBox();
  expect(box).not.toBeNull();
  expect(box.height).toBeGreaterThanOrEqual(40);

  // Focus is still a compatibility-backed skill resource for this pass, but it no longer
  // creates a separate dashboard. Build enough through ordinary thread actions.
  for (let turn = 0; turn < 30; turn += 1) {
    const state = await dashboard(context);
    if (!['combat', 'boss'].includes(state.activeRun?.phase)) break;
    if (Number(state.activeRun.viewer.focus || 0) >= 2 && !state.activeRun.enemyIntent) break;
    await reactiveAction(page, context);
  }

  let state = await dashboard(context);
  expect(['combat', 'boss']).toContain(state.activeRun.phase);
  expect(Number(state.activeRun.viewer.focus || 0)).toBeGreaterThanOrEqual(2);
  await page.reload();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  await expect(page.getByTestId('skill-piercing-stitch')).toBeEnabled({ timeout:7000 });

  const version = state.activeRun.version;
  await page.getByTestId('skill-piercing-stitch').click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.version ?? -1, { timeout:7000 }).toBeGreaterThan(version);
  state = await dashboard(context);
  expect(Number(state.activeRun.viewer.skillCooldowns['piercing-stitch'] || 0)).toBeGreaterThan(0);

  await page.reload();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  const afterReload = await dashboard(context);
  expect(Number(afterReload.activeRun.viewer.skillCooldowns['piercing-stitch'] || 0)).toBe(Number(state.activeRun.viewer.skillCooldowns['piercing-stitch'] || 0));
  await expect(page.getByTestId('skill-piercing-stitch')).toBeDisabled();

  await expect(page.getByTestId('stream-build-summary')).toBeHidden();
  expect(afterReload.activeRun.runEventSchedule).toBeNull();
  expect(afterReload.activeRun.runUpgradeOfferIds).toEqual([]);
});
