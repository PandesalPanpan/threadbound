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

test('new-run skills are compact, immediately usable, and persist cooldowns without Focus or Exposed', async ({ page, context }) => {
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

  let state = await dashboard(context);
  expect(state.activeRun.streamlinedSkills).toBe(true);
  expect(Number(state.activeRun.viewer.focus || 0)).toBe(0);
  expect(Number(state.activeRun.enemy?.statuses?.exposed || 0)).toBe(0);
  await expect(page.getByTestId('skill-focus')).toHaveCount(0);
  await expect(page.getByTestId('stream-decision-focus')).toHaveCount(0);

  const piercing = page.getByTestId('skill-piercing-stitch');
  await expect(piercing).toBeVisible();
  await expect(piercing).toBeEnabled();
  await expect(page.getByTestId('skill-piercing-stitch-state')).toHaveText('Ready');
  const box = await piercing.boundingBox();
  expect(box).not.toBeNull();
  expect(box.height).toBeGreaterThanOrEqual(40);

  const version = state.activeRun.version;
  await piercing.click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.version ?? -1, { timeout:7000 }).toBeGreaterThan(version);
  state = await dashboard(context);
  expect(Number(state.activeRun.viewer.focus || 0)).toBe(0);
  expect(Number(state.activeRun.enemy?.statuses?.exposed || 0)).toBe(0);
  expect(Number(state.activeRun.viewer.skillCooldowns['piercing-stitch'] || 0)).toBe(2);
  await expect(page.getByTestId('enemy-status-exposed')).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  const afterReload = await dashboard(context);
  expect(afterReload.activeRun.streamlinedSkills).toBe(true);
  expect(Number(afterReload.activeRun.viewer.focus || 0)).toBe(0);
  expect(Number(afterReload.activeRun.viewer.skillCooldowns['piercing-stitch'] || 0)).toBe(2);
  await expect(page.getByTestId('skill-focus')).toHaveCount(0);
  await expect(page.getByTestId('skill-piercing-stitch')).toBeDisabled({ timeout:7000 });
  await expect(page.getByTestId('skill-piercing-stitch-state')).toHaveText('Cooldown 2');

  await action(page, context, 'stream-attack');
  await expect(page.getByTestId('skill-piercing-stitch-state')).toHaveText('Cooldown 1', { timeout:7000 });
  await action(page, context, 'stream-attack');
  await expect(page.getByTestId('skill-piercing-stitch')).toBeEnabled({ timeout:7000 });
  await expect(page.getByTestId('skill-piercing-stitch-state')).toHaveText('Ready');

  const ready = await dashboard(context);
  expect(Number(ready.activeRun.viewer.focus || 0)).toBe(0);
  expect(Number(ready.activeRun.enemy?.statuses?.exposed || 0)).toBe(0);
  expect(ready.runUpgrades).toEqual([]);
  await expect(page.getByTestId('stream-build-summary')).toBeHidden();
  expect(ready.activeRun.runEventSchedule).toBeNull();
  expect(ready.activeRun.runUpgradeOfferIds).toEqual([]);
});
