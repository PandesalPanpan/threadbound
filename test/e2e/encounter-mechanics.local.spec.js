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

    // Clear normal encounters through public command routes while reacting to every
    // telegraph. The streamlined run moves directly into the boss without draft pauses.
    for (let guard = 0; guard < 100; guard += 1) {
      const state = await dashboard(leaderContext);
      const phase = state.activeRun?.phase;
      if (phase !== 'combat') break;
      let actorContext = guard % 2 === 0 ? leaderContext : partnerContext;
      let actorState = await dashboard(actorContext);
      if (actorState.activeRun.viewer.hp <= 0) {
        actorContext = actorContext === leaderContext ? partnerContext : leaderContext;
        actorState = await dashboard(actorContext);
      }
      expect(actorState.activeRun.viewer.hp).toBeGreaterThan(0);
      const downed = actorState.activeRun.participants.find((participant) => participant.hp <= 0);
      if (downed && actorState.activeRun.viewer.reviveCharges > 0) {
        await post(actorContext, `/api/runs/${encodeURIComponent(runId)}/revive`, { targetPlayerId:downed.playerId });
        continue;
      }
      const action = actorState.activeRun.enemyIntent
        ? actorState.activeRun.enemyIntent.reaction === 'interrupt' ? 'interrupt' : 'guard'
        : 'attack';
      await directAction(actorContext, runId, action);
    }

    const bossStart = await dashboard(leaderContext);
    expect(bossStart.activeRun?.phase).toBe('boss');
    expect(bossStart.activeRun.runEventHistory).toEqual([]);
    expect(bossStart.activeRun.selectedUpgrades).toEqual([]);
    expect(bossStart.runUpgrades || []).toEqual([]);

    // Make B the clearly vulnerable Weaver, then drive the boss from authoritative state
    // instead of assuming a fixed number of hits. Any Phase-I telegraph is cancelled
    // safely; once the aggregate
    // reports Phase II, its two-action cadence deterministically produces Threadmark first.
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
