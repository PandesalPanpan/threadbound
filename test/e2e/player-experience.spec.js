import { test, expect } from '@playwright/test';

async function loginWithThreaded(page) {
  await page.goto('/');
  await page.getByRole('link', { name:'Connect with Threaded' }).click();
  await expect(page.getByRole('heading', { name:'Fake Threaded' })).toBeVisible();
  await page.getByRole('button', { name:'Authorize Threadbound' }).click();
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

async function reactiveThreadAction(page, context) {
  const state = await dashboard(context);
  const reaction = state.activeRun?.enemyIntent?.reaction;
  if (reaction === 'interrupt') return clickThreadAction(page, context, 'stream-interrupt');
  if (reaction === 'guard') return clickThreadAction(page, context, 'stream-guard');
  return clickThreadAction(page, context, 'stream-attack');
}

async function startFromThread(page, context) {
  const start = page.getByTestId('stream-thread-local').getByTestId('stream-start-dungeon');
  await expect(start).toBeVisible({ timeout:7000 });
  await start.click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.id || null, { timeout:7000 }).not.toBeNull();
}

async function reachBoss(page, context, limit = 100) {
  for (let index = 0; index < limit; index += 1) {
    const state = await dashboard(context);
    if (state.activeRun?.phase === 'boss') return state;
    if (state.activeRun?.phase !== 'combat') throw new Error(`Unexpected pre-boss phase: ${state.activeRun?.phase}`);
    await reactiveThreadAction(page, context);
  }
  throw new Error('Run did not reach the boss.');
}

function confirmedRunSnapshot(data) {
  return {
    id:data.activeRun?.id,
    phase:data.activeRun?.phase,
    version:data.activeRun?.version,
    enemyHp:data.activeRun?.enemy?.hp ?? null,
    encounterIndex:data.activeRun?.encounterIndex,
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
  expect(confirmedRunSnapshot(await dashboard(context))).toEqual(beforeRefresh);
  await expect(page.getByTestId('stream-thread-local')).toBeVisible({ timeout:7000 });

  await page.close();
  const returningPage = await context.newPage();
  await returningPage.goto('/game');
  await expect(returningPage.getByTestId('app-status')).toHaveText('Ready');
  expect(confirmedRunSnapshot(await dashboard(context))).toEqual(beforeRefresh);

  await reactiveThreadAction(returningPage, context);
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
  const state = await dashboard(context).catch(() => null);
  void state;
  const reactionButton = page.getByTestId('stream-thread-local').getByTestId('stream-interrupt');
  await expect(reactionButton).toBeVisible({ timeout:7000 });
  await reactionButton.click();
  await expect(page.getByTestId('stream-error')).toBeVisible();
  await expect(page.getByTestId('stream-error')).toContainText(/fetch|network|offline|connection/i);

  await context.setOffline(false);
  const authoritativeAfterReconnect = confirmedRunSnapshot(await dashboard(context));
  expect(authoritativeAfterReconnect).toEqual(confirmedBeforeOffline);

  await page.reload();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  expect(confirmedRunSnapshot(await dashboard(context))).toEqual(confirmedBeforeOffline);

  await reactiveThreadAction(page, context);
  const afterContinuedPlay = confirmedRunSnapshot(await dashboard(context));
  expect(afterContinuedPlay.id).toBe(confirmedBeforeOffline.id);
  expect(afterContinuedPlay.version).toBeGreaterThan(confirmedBeforeOffline.version);
});

test('PX-44 Interrupted Decision Maker: refresh never invents the removed run-power or discovery phases', async ({ page, context }) => {
  test.setTimeout(90000);
  await loginWithThreaded(page);
  await startFromThread(page, context);

  let data = await dashboard(context);
  expect(data.activeRun.streamlinedLoop).toBe(true);
  expect(data.activeRun.runEventSchedule).toBeNull();
  expect(data.activeRun.runUpgradeOfferIds).toEqual([]);
  expect(data.runUpgrades || []).toEqual([]);

  // Refresh during ordinary combat: the same authoritative state returns without a rerolled choice.
  await reactiveThreadAction(page, context);
  const midCombat = confirmedRunSnapshot(await dashboard(context));
  await page.reload();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  expect(confirmedRunSnapshot(await dashboard(context))).toEqual(midCombat);
  await expect(page.getByTestId('run-event-card')).toHaveCount(0);
  await expect(page.getByTestId('stream-build-summary')).toBeHidden();

  data = await reachBoss(page, context);
  expect(data.activeRun.phase).toBe('boss');
  expect(data.activeRun.runEventHistory).toEqual([]);
  expect(data.activeRun.selectedUpgrades).toEqual([]);
  expect(data.runUpgrades || []).toEqual([]);
  const bossSnapshot = confirmedRunSnapshot(data);

  await page.reload();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  const afterBossReload = await dashboard(context);
  expect(confirmedRunSnapshot(afterBossReload)).toEqual(bossSnapshot);
  expect(afterBossReload.activeRun.selectedUpgrades).toEqual([]);
  expect(afterBossReload.activeRun.runUpgradeOfferIds).toEqual([]);
  await expect(page.getByTestId('stream-build-summary')).toBeHidden();
});

test('PX-36/45 Flaky Co-op Partner: one player can disconnect and rejoin the same shared chat run', async ({ browser }) => {
  test.setTimeout(90000);
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
    await expect(partner.getByTestId('app-status')).toHaveText('Ready');
    expect((await dashboard(partnerContext)).activeRun.id).toBe(started.id);
    await expect(partner.getByTestId('stream-thread-local')).toBeVisible({ timeout:7000 });

    await partnerContext.setOffline(true);
    await reactiveThreadAction(leader, leaderContext);
    const whilePartnerAway = confirmedRunSnapshot(await dashboard(leaderContext));
    expect(whilePartnerAway.id).toBe(started.id);
    expect(whilePartnerAway.version).toBeGreaterThan(started.version);

    await partnerContext.setOffline(false);
    await partner.reload();
    await expect(partner.getByTestId('app-status')).toHaveText('Ready');
    const partnerRestored = confirmedRunSnapshot(await dashboard(partnerContext));
    expect(partnerRestored).toEqual(whilePartnerAway);

    await reactiveThreadAction(partner, partnerContext);
    const afterPartnerReturns = confirmedRunSnapshot(await dashboard(partnerContext));
    expect(afterPartnerReturns.id).toBe(started.id);
    expect(afterPartnerReturns.version).toBeGreaterThan(whilePartnerAway.version);
  } finally {
    await leaderContext.close();
    await partnerContext.close();
  }
});
