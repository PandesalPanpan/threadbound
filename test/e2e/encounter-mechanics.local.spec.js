import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const REVIEW_DIR = 'ux-review';

async function reviewShot(page, name) {
  mkdirSync(REVIEW_DIR, { recursive: true });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${REVIEW_DIR}/${name}.png` });
}

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

function preferredOfferedPower(state) {
  const offered = state.runUpgrades || [];
  expect(offered).toHaveLength(3);
  return [...offered].sort((left, right) => Number(left.attackBonus || 0) - Number(right.attackBonus || 0)
    || Number(right.heal || 0) - Number(left.heal || 0)
    || String(left.id).localeCompare(String(right.id)))[0];
}

test('Phase II marks a wounded ally and another Weaver can protect them from the thread', async ({ browser }) => {
  test.setTimeout(60000);
  const leaderContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const partnerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const leader = await leaderContext.newPage();
  const partner = await partnerContext.newPage();

  try {
    await loginLocal(leader, 'a', 'Local Weaver A');
    await loginLocal(partner, 'b', 'Local Weaver B');
    const leaderPlayerId = (await dashboard(leaderContext)).character.id;
    const partnerPlayerId = (await dashboard(partnerContext)).character.id;

    const created = await post(leaderContext, '/api/party/create');
    await post(partnerContext, '/api/party/join', { joinCode: created.party.joinCode });
    await post(partnerContext, '/api/party/ready', { ready: true });
    const started = await post(leaderContext, '/api/dungeons/frayed-hollow/start');
    const runId = started.run.id;

    // Clear the normal encounters through public command routes while reacting to every
    // telegraph. Repeated power drafts and the discovery are real aggregate pauses, so
    // resolve each using only choices returned by the authoritative dashboard. This
    // mechanics fixture deliberately takes the lowest-attack offer so draft variance does
    // not dominate the boss threshold behavior being exercised below.
    for (let guard = 0; guard < 100; guard += 1) {
      const state = await dashboard(leaderContext);
      const phase = state.activeRun?.phase;
      if (phase === 'event') {
        const choices = state.activeRun.runEvent?.choices || [];
        const safeChoice = choices.find((choice) => /bind|quiet/i.test(choice.id)) || choices[0];
        expect(safeChoice?.id).toBeTruthy();
        await post(leaderContext, `/api/runs/${encodeURIComponent(runId)}/upgrade`, { upgradeId: safeChoice.id });
        expect((await dashboard(leaderContext)).activeRun?.phase).toBe('combat');
        continue;
      }
      if (phase === 'upgrade') {
        if (!state.activeRun.runUpgradeResume) break;
        const power = preferredOfferedPower(state);
        await post(leaderContext, `/api/runs/${encodeURIComponent(runId)}/upgrade`, { upgradeId: power.id });
        expect((await dashboard(leaderContext)).activeRun?.phase).toBe('combat');
        continue;
      }
      if (phase !== 'combat') break;
      const actorContext = guard % 2 === 0 ? leaderContext : partnerContext;
      const actorState = await dashboard(actorContext);
      const action = actorState.activeRun.enemyIntent
        ? actorState.activeRun.enemyIntent.reaction === 'interrupt' ? 'interrupt' : 'guard'
        : 'attack';
      await directAction(actorContext, runId, action);
    }

    const finalDraft = await dashboard(leaderContext);
    expect(finalDraft.activeRun?.phase).toBe('upgrade');
    expect(finalDraft.activeRun.runUpgradeResume).toBeNull();
    const finalPower = preferredOfferedPower(finalDraft);
    await post(leaderContext, `/api/runs/${encodeURIComponent(runId)}/upgrade`, { upgradeId: finalPower.id });
    expect((await dashboard(leaderContext)).activeRun?.phase).toBe('boss');

    // Make B the clearly vulnerable Weaver, then drive the boss from authoritative state
    // instead of assuming a fixed number of hits. Draft attack bonuses can move the exact
    // 50% crossing action. Any Phase-I telegraph is cancelled safely; once the aggregate
    // reports Phase II, its two-action cadence deterministically produces Threadmark first.
    await directAction(partnerContext, runId, 'guard');
    for (let step = 0; step < 12; step += 1) {
      const boss = (await dashboard(leaderContext)).activeRun;
      if (boss.enemy.battlePhase >= 2) break;
      if (boss.enemyIntent) {
        await directAction(leaderContext, runId, 'interrupt');
        continue;
      }
      await directAction(partnerContext, runId, 'attack');
    }

    let state = await dashboard(leaderContext);
    expect(state.activeRun.enemy.battlePhase).toBe(2);
    expect(state.activeRun.enemy.phaseName).toBe('Unraveling');

    for (let step = 0; step < 3 && !state.activeRun.enemyIntent; step += 1) {
      await directAction(partnerContext, runId, 'attack');
      state = await dashboard(leaderContext);
    }
    expect(state.activeRun.enemyIntent?.id).toBe('threadmark-lunge');

    const marked = state.activeRun.participants.find((participant) => participant.playerId === partnerPlayerId);
    expect(marked).toBeTruthy();
    expect(marked.hp).toBeGreaterThan(0);
    expect(state.activeRun.enemyIntent.targetPlayerId).toBe(partnerPlayerId);
    const markedHpBefore = marked.hp;
    const leaderBefore = state.activeRun.participants.find((participant) => participant.playerId === leaderPlayerId);
    expect(leaderBefore).toBeTruthy();

    await leader.reload();
    await partner.reload();
    await expect(leader.getByTestId('boss-phase-badge')).toContainText('PHASE II', { timeout: 5000 });
    await expect(leader.getByTestId('boss-phase-badge')).toContainText('UNRAVELING');
    await expect(leader.getByTestId('threadmark-warning')).toContainText('PROTECT LOCAL WEAVER B');
    const protect = leader.getByTestId('stream-guard');
    await expect(protect).toHaveText('Protect Local Weaver B');
    await expect(protect).toHaveAttribute('aria-label', 'Protect Local Weaver B from Threadmark');
    await reviewShot(leader, 'combat-v2-phase-two-protect-decision');

    const versionBefore = state.activeRun.version;
    await protect.click();
    await expect.poll(async () => (await dashboard(leaderContext)).activeRun?.version, { timeout: 5000 }).toBeGreaterThan(versionBefore);

    const after = await dashboard(leaderContext);
    const markedAfter = after.activeRun.participants.find((participant) => participant.playerId === partnerPlayerId);
    const leaderAfter = after.activeRun.participants.find((participant) => participant.playerId === leaderPlayerId);
    expect(markedAfter.hp).toBe(markedHpBefore);
    expect(leaderAfter.hp).toBeLessThan(leaderBefore.hp);
    expect(leaderAfter.successfulGuards).toBe(leaderBefore.successfulGuards + 1);
    expect(after.activeRun.enemyIntent).toBeNull();

    const receipt = leader.getByTestId('stream-system-entry').last();
    await expect(receipt.locator('.stream-rich-summary')).toContainText('protected Local Weaver B from Threadmark', { timeout: 5000 });
    await expect(receipt.getByText('Local Weaver B PROTECTED', { exact: false })).toBeVisible();
    await expect(partner.getByTestId('run-participant').filter({ hasText: 'Local Weaver B' })).toContainText(`HP ${markedHpBefore}/${markedAfter.maxHp}`, { timeout: 5000 });
    await reviewShot(leader, 'combat-v2-phase-two-protection-result');
  } finally {
    await leaderContext.close();
    await partnerContext.close();
  }
});
