import { test, expect } from '@playwright/test';

async function loginLocal(page, slot, expectedName) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Local development login' })).toBeVisible();
  await page.getByTestId(`local-login-${slot}`).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('threaded-user')).toHaveText(expectedName);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  await expect(page.getByTestId('stream-connection')).toHaveText('WebSocket live');
}

async function dashboard(context) {
  const response = await context.request.get('/api/dashboard');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function post(context, path, body = null) {
  const response = await context.request.post(path, body === null ? {} : { data: body });
  expect(response.ok()).toBe(true);
  return response.json();
}

async function directAction(context, runId, action) {
  return post(context, `/api/runs/${encodeURIComponent(runId)}/${action}`);
}

test('Phase II marks a wounded ally and another Weaver can protect them from the thread', async ({ browser }) => {
  test.setTimeout(60000);
  const leaderContext = await browser.newContext();
  const partnerContext = await browser.newContext();
  const leader = await leaderContext.newPage();
  const partner = await partnerContext.newPage();

  try {
    await loginLocal(leader, 'a', 'Local Weaver A');
    await loginLocal(partner, 'b', 'Local Weaver B');

    const created = await post(leaderContext, '/api/party/create');
    await post(partnerContext, '/api/party/join', { joinCode: created.party.joinCode });
    await post(partnerContext, '/api/party/ready', { ready: true });
    const started = await post(leaderContext, '/api/dungeons/frayed-hollow/start');
    const runId = started.run.id;

    // Clear the normal encounters through the same public command routes while reacting
    // to every telegraph. The browser assertion below stays focused on the new mechanic.
    for (let guard = 0; guard < 60; guard += 1) {
      const state = await dashboard(leaderContext);
      if (state.activeRun?.phase !== 'combat') break;
      const actorContext = guard % 2 === 0 ? leaderContext : partnerContext;
      const actorState = await dashboard(actorContext);
      const action = actorState.activeRun.enemyIntent
        ? actorState.activeRun.enemyIntent.reaction === 'interrupt' ? 'interrupt' : 'guard'
        : 'attack';
      await directAction(actorContext, runId, action);
    }
    expect((await dashboard(leaderContext)).activeRun?.phase).toBe('upgrade');

    await post(leaderContext, `/api/runs/${encodeURIComponent(runId)}/upgrade`, { upgradeId: 'reinforce' });
    expect((await dashboard(leaderContext)).activeRun?.phase).toBe('boss');

    // Make B the clearly vulnerable Weaver using legal combat actions. Five partner
    // attacks cross the 50% boss threshold; the Phase-I telegraph between them is
    // deliberately interrupted by A so the next Phase-II intent is Threadmark.
    await directAction(partnerContext, runId, 'guard');
    await directAction(partnerContext, runId, 'attack');
    await directAction(partnerContext, runId, 'attack');
    await directAction(partnerContext, runId, 'attack');
    let state = await dashboard(leaderContext);
    expect(state.activeRun.enemyIntent).not.toBeNull();
    await directAction(leaderContext, runId, 'interrupt');
    await directAction(partnerContext, runId, 'attack');
    await directAction(partnerContext, runId, 'attack');

    state = await dashboard(leaderContext);
    expect(state.activeRun.enemy.battlePhase).toBe(2);
    expect(state.activeRun.enemy.phaseName).toBe('Unraveling');
    expect(state.activeRun.enemyIntent?.id).toBe('threadmark-lunge');
    const marked = state.activeRun.participants.find((participant) => participant.playerId === 'local:b');
    expect(state.activeRun.enemyIntent.targetPlayerId).toBe('local:b');
    const markedHpBefore = marked.hp;
    const leaderBefore = state.activeRun.participants.find((participant) => participant.playerId === 'local:a');

    await expect(leader.getByTestId('boss-phase-badge')).toContainText('PHASE II', { timeout: 5000 });
    await expect(leader.getByTestId('boss-phase-badge')).toContainText('UNRAVELING');
    await expect(leader.getByTestId('threadmark-warning')).toContainText('PROTECT LOCAL WEAVER B');
    const protect = leader.getByTestId('stream-guard');
    await expect(protect).toHaveText('Protect Local Weaver B');
    await expect(protect).toHaveAttribute('aria-label', 'Protect Local Weaver B from Threadmark');

    const versionBefore = state.activeRun.version;
    await protect.click();
    await expect.poll(async () => (await dashboard(leaderContext)).activeRun?.version, { timeout: 5000 }).toBeGreaterThan(versionBefore);

    const after = await dashboard(leaderContext);
    const markedAfter = after.activeRun.participants.find((participant) => participant.playerId === 'local:b');
    const leaderAfter = after.activeRun.participants.find((participant) => participant.playerId === 'local:a');
    expect(markedAfter.hp).toBe(markedHpBefore);
    expect(leaderAfter.hp).toBeLessThan(leaderBefore.hp);
    expect(leaderAfter.successfulGuards).toBe(leaderBefore.successfulGuards + 1);
    expect(after.activeRun.enemyIntent).toBeNull();

    const receipt = leader.getByTestId('stream-system-entry').last();
    await expect(receipt.locator('.stream-rich-summary')).toContainText('protected Local Weaver B from Threadmark', { timeout: 5000 });
    await expect(receipt.getByText('Local Weaver B PROTECTED', { exact: false })).toBeVisible();
    await expect(partner.getByTestId('run-participant').filter({ hasText: 'Local Weaver B' })).toContainText(`HP ${markedHpBefore}/${markedAfter.maxHp}`, { timeout: 5000 });
  } finally {
    await leaderContext.close();
    await partnerContext.close();
  }
});
