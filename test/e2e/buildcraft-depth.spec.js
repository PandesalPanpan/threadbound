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
  await action.click();
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

async function chooseDiscovery(page, context) {
  const state = await dashboard(context);
  expect(state.activeRun?.phase).toBe('event');
  const choice = state.activeRun.runEvent?.choices?.[0];
  expect(choice).toBeTruthy();
  const version = state.activeRun.version;
  await page.getByTestId(`run-event-choice-${choice.id}`).click();
  await expect.poll(async () => {
    const next = await dashboard(context);
    return next.activeRun?.phase === 'combat' && next.activeRun.version > version;
  }, { timeout:5000 }).toBe(true);
}

test('the single boss-prep run power becomes a persistent readable build and changes a matching boss reaction', async ({ page, context }) => {
  test.setTimeout(90000);
  await loginWithThreaded(page);
  await page.getByTestId('stream-start-dungeon').click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.phase, { timeout:5000 }).toBe('combat');

  let state = await attackUntilPhaseChanges(page, context, 'combat');
  expect(state.activeRun.phase).toBe('event');
  expect(state.activeRun.selectedUpgrades).toHaveLength(0);
  await chooseDiscovery(page, context);

  state = await attackUntilPhaseChanges(page, context, 'combat');
  expect(state.activeRun.phase).toBe('upgrade');
  expect(state.activeRun.runUpgradeResume).toBeNull();
  await expect(page.getByTestId('stream-action-mode')).toHaveText('BOSS PREPARATION', { timeout:5000 });

  const offered = state.runUpgrades;
  const technique = offered.find((power) => power.category === 'TECHNIQUE') || offered[0];
  expect(technique).toBeTruthy();
  const powerButton = page.getByRole('button', { name: technique.name, exact:true });
  await expect(powerButton).toBeVisible({ timeout:5000 });
  await expect(powerButton).toContainText(technique.description);
  await powerButton.click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.phase, { timeout:5000 }).toBe('boss');

  const build = page.getByTestId('stream-build-summary');
  await expect(build).toBeVisible({ timeout:5000 });
  await expect(build).toContainText(technique.name);
  await expect(build.getByTestId('stream-build-paths')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  await expect(page.getByTestId('stream-build-summary')).toContainText(technique.name, { timeout:5000 });
  expect((await dashboard(context)).activeRun.selectedUpgrades).toEqual([technique.id]);

  // Build depth stays underneath the simple chat loop. We wait for the boss to create the
  // reaction window that matches the selected technique, then prove the power changes it.
  const selectedTags = new Set(technique.archetypes || []);
  const preferredReaction = selectedTags.has('guard') ? 'guard' : 'interrupt';
  let provedReaction = false;

  for (let turn = 0; turn < 14; turn += 1) {
    const before = await dashboard(context);
    if (before.activeRun?.phase !== 'boss') break;
    const reaction = before.activeRun.enemyIntent?.reaction || null;

    if (reaction === preferredReaction) {
      const viewerBefore = before.activeRun.viewer;
      await actAndWait(page, context, `stream-${preferredReaction}`);
      const after = await dashboard(context);
      if (preferredReaction === 'guard') {
        expect(after.activeRun.viewer.successfulGuards).toBeGreaterThan(viewerBefore.successfulGuards);
        expect(after.activeRun.viewer.reactionDamageBonus).toBeGreaterThan(0);
      } else {
        expect(after.activeRun.viewer.successfulInterrupts).toBeGreaterThan(viewerBefore.successfulInterrupts);
        expect(after.activeRun.viewer.focus).toBeGreaterThanOrEqual(viewerBefore.focus);
      }
      provedReaction = true;
      break;
    }

    if (reaction === 'interrupt') await actAndWait(page, context, 'stream-interrupt');
    else if (reaction === 'guard') await actAndWait(page, context, 'stream-guard');
    else await actAndWait(page, context, 'stream-attack');
  }

  expect(provedReaction).toBe(true);
  await expect(page.getByTestId('stream-build-summary')).toContainText(technique.name);
});
