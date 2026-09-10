import { test, expect } from '@playwright/test';

async function loginWithThreaded(page) {
  await page.goto('/');
  await page.getByRole('link', { name:'Connect with Threaded' }).click();
  await expect(page.getByRole('heading', { name:'Fake Threaded' })).toBeVisible();
  await page.getByRole('button', { name:'Authorize Threadbound' }).click();
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
  const button = page.getByTestId('stream-thread-local').getByTestId(testId);
  await expect(button).toBeVisible({ timeout:7000 });
  await expect(button).toBeEnabled({ timeout:7000 });
  await button.click();
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

async function reachBoss(page, context, limit = 100) {
  for (let index = 0; index < limit; index += 1) {
    const state = await dashboard(context);
    if (state.activeRun?.phase === 'boss') return state;
    if (state.activeRun?.phase !== 'combat') throw new Error(`Unexpected phase ${state.activeRun?.phase}`);
    await reactiveTurn(page, context);
  }
  throw new Error('Run did not reach boss.');
}

test('chat is the dominant visual surface and private controls contain only current state, actions, skills, and quiet navigation', async ({ page, context }) => {
  test.setTimeout(90000);
  await loginWithThreaded(page);

  const log = page.getByTestId('adventure-stream-log');
  const local = page.getByTestId('stream-thread-local');
  const primary = local.getByTestId('stream-primary-actions');
  const meta = local.getByTestId('stream-meta-actions');
  await expect(log).toBeVisible();
  await expect(local).toBeVisible({ timeout:7000 });
  expect(await local.evaluate((node) => node.parentElement?.dataset.testid)).toBe('adventure-stream-log');
  await expect(page.locator('.stream-hint')).toContainText('The chat is the game');

  // Navigation still exists, but it is a secondary utility strip rather than a competing panel.
  for (const name of ['Dungeons','Status','Gear','Party','Codex','World','Honey']) {
    await expect(meta.getByRole('button', { name })).toBeVisible();
  }

  await local.getByTestId('stream-start-dungeon').click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.phase, { timeout:7000 }).toBe('combat');
  const state = await dashboard(context);
  expect(state.activeRun.streamlinedLoop).toBe(true);

  const snapshot = local.getByTestId('stream-decision-snapshot');
  await expect(snapshot).toBeVisible({ timeout:7000 });
  await expect(local.getByTestId('stream-decision-you-hp')).toHaveText(/\d+ \/ \d+ HP/);
  await expect(local.getByTestId('stream-decision-enemy-hp')).toHaveText(/\d+ \/ \d+ HP/);

  // The always-visible dashboard duplication is gone. Consequence preview belongs to the
  // action hover/focus treatment instead of being repeated in stacked cards.
  await expect(page.getByTestId('stream-action-forecast')).toBeHidden();
  await expect(page.locator('.ux-transition-state')).toHaveCount(0);
  await expect(page.getByTestId('stream-build-summary')).toBeHidden();

  await expect(primary.getByTestId('stream-attack')).toBeVisible();
  await expect(primary.getByTestId('stream-guard')).toBeHidden();
  await expect(primary.getByTestId('combat-skill-panel')).toBeVisible({ timeout:7000 });

  const localBox = await local.boundingBox();
  const logBox = await log.boundingBox();
  expect(localBox).not.toBeNull();
  expect(logBox).not.toBeNull();
  expect(localBox.height).toBeLessThan(logBox.height * 0.65);

  // A relevant telegraph changes the small immediate action budget without adding a new panel.
  await actAndWait(page, context, 'stream-attack');
  await expect(primary.getByTestId('stream-interrupt')).toBeVisible({ timeout:7000 });
  await expect(primary.getByTestId('stream-guard')).toBeHidden();

  const bossData = await reachBoss(page, context);
  expect(bossData.activeRun.phase).toBe('boss');
  expect(bossData.activeRun.selectedUpgrades).toEqual([]);
  expect(bossData.activeRun.runEventHistory).toEqual([]);
  expect(bossData.activeRun.runAttackBonus).toBe(0);
  await expect(page.getByTestId('stream-build-summary')).toBeHidden();
  await expect(page.getByTestId('run-event-card')).toHaveCount(0);
  await expect(local.getByTestId('stream-decision-snapshot')).toBeVisible();
});
