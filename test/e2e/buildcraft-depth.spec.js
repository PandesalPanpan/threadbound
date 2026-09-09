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
  await expect.poll(async () => (await dashboard(context)).activeRun?.version ?? -1, { timeout:5000 }).toBeGreaterThan(version);
}

async function attackUntilPhaseChanges(page, context, phase, maxActions = 30) {
  for (let index = 0; index < maxActions; index += 1) {
    const state = await dashboard(context);
    if (state.activeRun?.phase !== phase) return state;
    await actAndWait(page, context, 'stream-attack');
  }
  throw new Error(`Run did not leave ${phase}.`);
}

test('selected run power becomes a persistent readable build and changes the next tactical reaction', async ({ page, context }) => {
  test.setTimeout(80000);
  await loginWithThreaded(page);
  await page.getByTestId('stream-start-dungeon').click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.phase, { timeout:5000 }).toBe('combat');

  let state = await attackUntilPhaseChanges(page, context, 'combat');
  expect(state.activeRun.phase).toBe('upgrade');

  const offered = state.runUpgrades;
  const technique = offered.find((power) => power.category === 'TECHNIQUE') || offered[0];
  expect(technique).toBeTruthy();
  await page.getByRole('button', { name: new RegExp(technique.name, 'i') }).click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.phase, { timeout:5000 }).toBe('combat');

  const build = page.getByTestId('stream-build-summary');
  await expect(build).toBeVisible({ timeout:5000 });
  await expect(build).toContainText(technique.name);
  await expect(build.getByTestId('stream-build-paths')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  await expect(page.getByTestId('stream-build-summary')).toContainText(technique.name, { timeout:5000 });

  // Hollow Stalker telegraphs guardable heavy pressure after one action. The selected
  // technique determines whether this persona answers through Guard/Riposte or Control.
  const beforeReaction = await dashboard(context);
  await actAndWait(page, context, 'stream-attack');
  state = await dashboard(context);
  expect(state.activeRun.enemyIntent).toBeTruthy();

  const selectedTags = new Set(technique.archetypes || []);
  if (selectedTags.has('guard')) {
    await actAndWait(page, context, 'stream-guard');
    state = await dashboard(context);
    const viewer = state.activeRun.viewer;
    expect(viewer.successfulGuards).toBeGreaterThan(beforeReaction.activeRun.viewer.successfulGuards);
    expect(viewer.reactionDamageBonus).toBeGreaterThan(0);
  } else {
    await actAndWait(page, context, 'stream-interrupt');
    state = await dashboard(context);
    const viewer = state.activeRun.viewer;
    expect(viewer.successfulInterrupts).toBeGreaterThan(beforeReaction.activeRun.viewer.successfulInterrupts);
    expect(viewer.focus).toBeGreaterThanOrEqual(beforeReaction.activeRun.viewer.focus);
  }

  await expect(page.getByTestId('stream-build-summary')).toContainText(technique.name);
});
