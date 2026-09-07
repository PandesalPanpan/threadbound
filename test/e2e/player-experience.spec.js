import { test, expect } from '@playwright/test';

async function loginWithThreaded(page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Connect with Threaded' }).click();
  await expect(page.getByRole('heading', { name: 'Fake Threaded' })).toBeVisible();
  await page.getByRole('button', { name: 'Authorize Threadbound' }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
}

async function clickAndWait(page, testId) {
  await page.getByTestId(testId).click();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
}

async function dashboard(context) {
  const response = await context.request.get('/api/dashboard');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function clickThreadAction(page, context, testId) {
  const before = await dashboard(context);
  const version = before.activeRun?.version ?? -1;
  await page.getByTestId(testId).click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.version ?? -1, { timeout: 5000 }).toBeGreaterThan(version);
}

async function startFromThread(page, context) {
  await page.getByTestId('stream-start-dungeon').click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.id || null, { timeout: 5000 }).not.toBeNull();
}

async function actUntilPhaseChanges(context, page, phase, limit = 30) {
  for (let index = 0; index < limit; index += 1) {
    const state = await dashboard(context);
    if (state.activeRun?.phase !== phase) return state;
    await clickThreadAction(page, context, 'stream-attack');
  }
  throw new Error(`Run did not leave ${phase} within ${limit} actions.`);
}

function confirmedRunSnapshot(data) {
  return {
    id: data.activeRun?.id,
    phase: data.activeRun?.phase,
    version: data.activeRun?.version,
    enemyHp: data.activeRun?.enemy?.hp ?? null,
    encounterIndex: data.activeRun?.encounterIndex,
  };
}

test('PX-40/41 Tab Closer: unfinished solo run survives refresh and closing the page', async ({ page, context }) => {
  await loginWithThreaded(page);
  await startFromThread(page, context);
  await clickThreadAction(page, context, 'stream-attack');

  const beforeRefresh = confirmedRunSnapshot(await dashboard(context));
  expect(beforeRefresh.id).toBeTruthy();
  expect(beforeRefresh.phase).toBe('combat');

  await page.reload();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  await expect(page.getByTestId('run-state')).toContainText('Phase: combat');
  expect(confirmedRunSnapshot(await dashboard(context))).toEqual(beforeRefresh);

  await page.close();
  const returningPage = await context.newPage();
  await returningPage.goto('/game');
  await expect(returningPage.getByTestId('app-status')).toHaveText('Ready');
  await expect(returningPage.getByTestId('run-state')).toContainText('Phase: combat');
  expect(confirmedRunSnapshot(await dashboard(context))).toEqual(beforeRefresh);

  await clickThreadAction(returningPage, context, 'stream-attack');
  const afterResume = confirmedRunSnapshot(await dashboard(context));
  expect(afterResume.id).toBe(beforeRefresh.id);
  expect(afterResume.version).toBeGreaterThan(beforeRefresh.version);
});

test('PX-42/43 Commuter: offline thread action cannot mutate confirmed run state and reconnect resumes it', async ({ page, context }) => {
  await loginWithThreaded(page);
  await startFromThread(page, context);
  await clickThreadAction(page, context, 'stream-attack');

  const confirmedBeforeOffline = confirmedRunSnapshot(await dashboard(context));
  expect(confirmedBeforeOffline.id).toBeTruthy();

  await context.setOffline(true);
  await page.getByTestId('stream-attack').click();
  await expect(page.getByTestId('stream-error')).toBeVisible();
  await expect(page.getByTestId('stream-error')).toContainText(/fetch|network|offline|connection/i);

  await context.setOffline(false);
  const authoritativeAfterReconnect = confirmedRunSnapshot(await dashboard(context));
  expect(authoritativeAfterReconnect).toEqual(confirmedBeforeOffline);

  await page.reload();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  await expect(page.getByTestId('run-state')).toContainText(`Phase: ${confirmedBeforeOffline.phase}`);
  expect(confirmedRunSnapshot(await dashboard(context))).toEqual(confirmedBeforeOffline);

  await clickThreadAction(page, context, 'stream-attack');
  const afterContinuedPlay = confirmedRunSnapshot(await dashboard(context));
  expect(afterContinuedPlay.id).toBe(confirmedBeforeOffline.id);
  expect(afterContinuedPlay.version).toBeGreaterThan(confirmedBeforeOffline.version);
});

test('PX-44 Interrupted Decision Maker: refreshing at the thread upgrade choice preserves the unresolved decision', async ({ page, context }) => {
  await loginWithThreaded(page);
  await startFromThread(page, context);
  await actUntilPhaseChanges(context, page, 'combat');

  const beforeRefresh = confirmedRunSnapshot(await dashboard(context));
  expect(beforeRefresh.phase).toBe('upgrade');
  await expect(page.getByTestId('stream-suggestions').getByRole('button', { name: 'Sharpen the Thread' })).toBeVisible();
  await expect(page.getByTestId('stream-suggestions').getByRole('button', { name: 'Reinforce the Weave' })).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  expect(confirmedRunSnapshot(await dashboard(context))).toEqual(beforeRefresh);
  await expect(page.getByTestId('run-state')).toContainText('Phase: upgrade');
  await expect(page.getByTestId('stream-suggestions').getByRole('button', { name: 'Sharpen the Thread' })).toBeVisible();

  await page.getByTestId('stream-suggestions').getByRole('button', { name: 'Sharpen the Thread' }).click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.phase, { timeout: 5000 }).toBe('boss');
  await expect(page.getByTestId('run-state')).toContainText('Phase: boss');
});

test('PX-36/45 Flaky Co-op Partner: one player can disconnect, leader continues through thread, partner rejoins same shared run', async ({ browser }) => {
  const leaderContext = await browser.newContext();
  const partnerContext = await browser.newContext();
  const leader = await leaderContext.newPage();
  const partner = await partnerContext.newPage();

  try {
    await loginWithThreaded(leader);
    await loginWithThreaded(partner);

    await clickAndWait(leader, 'create-party');
    const inviteCode = (await leader.getByTestId('party-code').textContent()).trim();
    await partner.getByTestId('party-code-input').fill(inviteCode);
    await clickAndWait(partner, 'join-party');
    await clickAndWait(partner, 'toggle-ready');

    await leader.reload();
    await expect(leader.getByTestId('app-status')).toHaveText('Ready');
    await startFromThread(leader, leaderContext);
    const started = confirmedRunSnapshot(await dashboard(leaderContext));

    await partner.reload();
    await expect(partner.getByTestId('run-state')).toContainText('2 Weavers');
    expect((await dashboard(partnerContext)).activeRun.id).toBe(started.id);

    await partnerContext.setOffline(true);
    await clickThreadAction(leader, leaderContext, 'stream-attack');
    const whilePartnerAway = confirmedRunSnapshot(await dashboard(leaderContext));
    expect(whilePartnerAway.id).toBe(started.id);
    expect(whilePartnerAway.version).toBeGreaterThan(started.version);

    await partnerContext.setOffline(false);
    await partner.reload();
    await expect(partner.getByTestId('app-status')).toHaveText('Ready');
    await expect(partner.getByTestId('run-state')).toContainText('2 Weavers');
    const partnerRestored = confirmedRunSnapshot(await dashboard(partnerContext));
    expect(partnerRestored).toEqual(whilePartnerAway);

    await clickThreadAction(partner, partnerContext, 'stream-attack');
    const afterPartnerReturns = confirmedRunSnapshot(await dashboard(partnerContext));
    expect(afterPartnerReturns.id).toBe(started.id);
    expect(afterPartnerReturns.version).toBeGreaterThan(whilePartnerAway.version);
  } finally {
    await leaderContext.close();
    await partnerContext.close();
  }
});
