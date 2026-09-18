import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

const NAMES = {
  a: 'Local Weaver A',
  b: 'Local Weaver B',
  c: 'Local Weaver C',
  d: 'Local Weaver D',
};

async function login(page, slot) {
  await page.goto('/');
  await page.getByTestId(`local-login-${slot}`).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('threaded-user')).toHaveText(NAMES[slot]);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
}

async function dashboard(context) {
  const response = await context.request.get('/api/dashboard');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function waitForActiveRun(context, timeout = 7000) {
  await expect.poll(async () => (await dashboard(context)).activeRun?.id || null, { timeout }).not.toBeNull();
  return dashboard(context);
}

async function waitForRunVersion(context, runId, version, timeout = 7000) {
  await expect.poll(async () => {
    const state = await dashboard(context);
    return state.activeRun?.id !== runId || (state.activeRun?.version || -1) > version;
  }, { timeout }).toBe(true);
  return dashboard(context);
}

async function sendCommand(page, command) {
  await page.getByTestId('stream-message').fill(command);
  await page.getByTestId('stream-send').click();
}

async function attackFromSimpleSurface(page, context) {
  const before = await dashboard(context);
  expect(before.activeRun?.simpleCombat).toBe(true);
  await expect(page.locator('.simple-loop-action[data-testid="stream-attack"]')).toBeVisible({ timeout: 7000 });
  await page.locator('.simple-loop-action[data-testid="stream-attack"]').click();
  return waitForRunVersion(context, before.activeRun.id, before.activeRun.version);
}

async function finishSimpleRun(contexts) {
  for (let step = 0; step < 80; step += 1) {
    const state = await dashboard(contexts[0].context);
    if (!state.activeRun) return state;
    if (state.activeRun.phase === 'between_encounter') {
      const actor = state.activeRun.participants
        .filter((participant) => participant.hp > 0)
        .map((participant) => contexts.find((candidate) => candidate.playerId === participant.playerId))
        .find(Boolean);
      if (!actor) return state;
      const response = await actor.context.request.post(`/api/runs/${state.activeRun.id}/continue`);
      expect(response.ok()).toBe(true);
      continue;
    }
    const candidates = state.activeRun.participants
      .filter((participant) => participant.hp > 0)
      .map((participant) => contexts.find((candidate) => candidate.playerId === participant.playerId))
      .filter(Boolean);
    if (!candidates.length) return dashboard(contexts[0].context);
    let acted = false;
    for (const candidate of candidates) {
      const response = await candidate.context.request.post(`/api/runs/${state.activeRun.id}/attack`);
      if (response.ok()) {
        acted = true;
        break;
      }
    }
    if (!acted) {
      const latest = await dashboard(contexts[0].context);
      if (!latest.activeRun) return latest;
      throw new Error(`Could not resolve a live party actor for run ${latest.activeRun.id}.`);
    }
  }
  throw new Error('Simple run did not reach a terminal state within 80 attacks.');
}

async function streamEntries(context) {
  const response = await context.request.get('/api/stream?limit=100');
  expect(response.ok()).toBe(true);
  return (await response.json()).entries || [];
}

async function finishLegacyRun(context) {
  for (let step = 0; step < 100; step += 1) {
    const state = await dashboard(context);
    if (!state.activeRun) return state;
    const run = state.activeRun;
    let response;
    if (run.phase === 'upgrade' || run.phase === 'event') {
      const choice = run.phase === 'event' ? run.runEvent?.choices?.[0] : state.runUpgrades?.[0];
      expect(choice?.id).toBeTruthy();
      response = await context.request.post(`/api/runs/${run.id}/upgrade`, { data: { upgradeId: choice.id } });
    } else {
      const reaction = run.enemyIntent?.reaction;
      const action = reaction === 'interrupt' ? 'interrupt' : reaction === 'guard' ? 'guard' : 'attack';
      response = await context.request.post(`/api/runs/${run.id}/${action}`);
    }
    expect(response.ok()).toBe(true);
  }
  throw new Error('Legacy run did not reach a terminal state within 100 actions.');
}

async function visibleSurfaceMetrics(page) {
  return page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    composerHeight: document.querySelector('[data-testid="stream-composer"]')?.getBoundingClientRect().height || 0,
    actionHeights: [...document.querySelectorAll('.simple-loop-actions button:not([hidden])')]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => element.getBoundingClientRect().height),
  }));
}

test('mobile dungeon surface carries authoritative HP into a distinct boss state', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();

  try {
    await login(page, 'c');
    const entry = page.getByTestId('simple-dungeon-card');
    await expect(entry).toHaveAttribute('data-state', 'entry');
    await expect(entry.getByTestId('dungeon-name')).toHaveText('Frayed Hollow');
    await expect(entry.getByTestId('dungeon-entry-combat-rule')).toContainText('Attack only');
    await expect(entry).toContainText('Your run HP stays with you between rooms');

    const metrics = await visibleSurfaceMetrics(page);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewport);
    expect(metrics.composerHeight).toBeGreaterThanOrEqual(44);
    for (const height of metrics.actionHeights) expect(height).toBeGreaterThanOrEqual(44);

    await sendCommand(page, 'dungeon');
    const started = await waitForActiveRun(context);
    expect(started.activeRun.simpleCombat).toBe(true);
    await expect(page.getByTestId('stream-system-entry').filter({ hasText: /entered Frayed Hollow/i }).last()).toBeVisible({ timeout: 7000 });
    await expect(page.getByTestId('simple-dungeon-card')).toHaveAttribute('data-state', 'combat');
    await expect(page.getByTestId('dungeon-enemy-name')).toHaveText(started.activeRun.enemy.name);
    await expect(page.getByTestId('dungeon-enemy-hp')).toHaveText(`${started.activeRun.enemy.hp} / ${started.activeRun.enemy.maxHp} HP`);
    await expect(page.getByTestId('dungeon-player-hp')).toHaveText(`${started.activeRun.viewer.hp} / ${started.activeRun.viewer.maxHp} HP`);
    await expect(page.locator('.simple-loop-action')).toHaveCount(1);
    await expect(page.getByTestId('stream-guard')).toHaveCount(0);
    await expect(page.getByTestId('stream-interrupt')).toHaveCount(0);
    await expect(page.getByTestId('stream-mend')).toHaveCount(0);
    await expect(page.getByTestId('stream-revive')).toHaveCount(0);

    const firstAttackState = await attackFromSimpleSurface(page, context);
    expect(firstAttackState.activeRun.enemy.hp).toBeLessThan(started.activeRun.enemy.hp);
    await expect(page.getByTestId('dungeon-enemy-hp')).toHaveText(`${firstAttackState.activeRun.enemy.hp} / ${firstAttackState.activeRun.enemy.maxHp} HP`);
    const runId = firstAttackState.activeRun.id;
    const hpAfterAttack = firstAttackState.activeRun.viewer.hp;

    await page.getByTestId('stream-message').fill('draft survives reload only by user action');
    await page.reload();
    await expect(page.getByTestId('app-status')).toHaveText('Ready');
    const reloaded = await dashboard(context);
    expect(reloaded.activeRun.id).toBe(runId);
    expect(reloaded.activeRun.viewer.hp).toBe(hpAfterAttack);
    await expect(page.getByTestId('dungeon-player-hp')).toHaveText(`${hpAfterAttack} / ${reloaded.activeRun.viewer.maxHp} HP`);
    await expect(page.getByTestId('stream-message')).toHaveValue('');

    let state = reloaded;
    let usedPotion = false;
    while (state.activeRun && !['boss', 'failed'].includes(state.activeRun.phase)) {
      if (state.activeRun.phase === 'between_encounter') {
        const hpBeforeDecision = state.activeRun.viewer.hp;
        await expect(page.getByTestId('simple-dungeon-card')).toHaveAttribute('data-state', 'between_encounter');
        await expect(page.getByTestId('stream-continue')).toBeVisible();
        if (!usedPotion && (await dashboard(context)).character.healthPotions > 0) {
          await page.getByTestId('stream-dungeon-potion').click();
          state = await waitForRunVersion(context, state.activeRun.id, state.activeRun.version);
          expect(state.activeRun.viewer.hp).toBeGreaterThan(hpBeforeDecision);
          usedPotion = true;
        } else {
          await page.getByTestId('stream-continue').click();
          state = await waitForRunVersion(context, state.activeRun.id, state.activeRun.version);
          expect(state.activeRun.viewer.hp).toBe(hpBeforeDecision);
        }
        continue;
      }
      const roomBefore = state.activeRun.encounterIndex;
      const hpBeforeRoom = state.activeRun.viewer.hp;
      do {
        state = await attackFromSimpleSurface(page, context);
        if (!state.activeRun) break;
      } while (state.activeRun.phase === 'combat' && state.activeRun.encounterIndex === roomBefore);
      if (state.activeRun?.phase === 'between_encounter') {
        expect(state.activeRun.viewer.hp).toBeGreaterThan(0);
        expect(state.activeRun.viewer.hp).toBeLessThanOrEqual(state.activeRun.viewer.maxHp);
        expect(hpBeforeRoom).toBeGreaterThan(0);
      }
      if (state.activeRun?.phase === 'combat' && state.activeRun.encounterIndex > roomBefore) {
        expect(state.activeRun.viewer.hp).toBeGreaterThan(0);
        expect(state.activeRun.viewer.hp).toBeLessThanOrEqual(state.activeRun.viewer.maxHp);
        expect(hpBeforeRoom).toBeGreaterThan(0);
      }
    }

    expect(state.activeRun?.phase).toBe('boss');
    await expect(page.getByTestId('simple-dungeon-card')).toHaveAttribute('data-state', 'boss');
    await expect(page.getByTestId('dungeon-room')).toContainText('Room 4 of 4');
    await expect(page.getByTestId('dungeon-enemy-hp')).toHaveText(`${state.activeRun.enemy.hp} / ${state.activeRun.enemy.maxHp} HP`);
    await expect(page.getByTestId('dungeon-player-hp')).toHaveText(`${state.activeRun.viewer.hp} / ${state.activeRun.viewer.maxHp} HP`);

    await mkdir('test-results/presentation-v2', { recursive: true });
    await page.screenshot({ path: 'test-results/presentation-v2/dungeon-390x844.png', fullPage: false });

    await page.setViewportSize({ width: 1440, height: 960 });
    await page.reload();
    await expect(page.getByTestId('app-status')).toHaveText('Ready');
    await expect(page.getByTestId('simple-dungeon-card')).toHaveAttribute('data-state', 'boss');
    await expect(page.locator('#character')).toBeHidden();
    await expect(page.locator('#dungeon')).toBeHidden();
    await expect(page.locator('.desktop-rail, .live-context-rail, [data-testid="live-context-rail"]')).toHaveCount(0);
    const desktopMetrics = await visibleSurfaceMetrics(page);
    expect(desktopMetrics.scrollWidth).toBeLessThanOrEqual(desktopMetrics.viewport);
    await page.screenshot({ path: 'test-results/presentation-v2/dungeon-1440x960.png', fullPage: true });

    const terminal = await dashboard(context);
    if (terminal.activeRun) await finishSimpleRun([{ context, playerId: terminal.character.id }]);
  } finally {
    await context.close();
  }
});

test('party dungeon updates both browsers, preserves drafts, reconnects, and exposes both HP rows', async ({ browser }) => {
  const leaderContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const partnerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const leader = await leaderContext.newPage();
  const partner = await partnerContext.newPage();
  const leaderIdentity = { context: leaderContext, playerId: null };
  const partnerIdentity = { context: partnerContext, playerId: null };

  try {
    await login(leader, 'c');
    await login(partner, 'd');
    const created = await leaderContext.request.post('/api/party/create');
    expect(created.ok()).toBe(true);
    const joinCode = (await created.json()).party.joinCode;
    expect((await partnerContext.request.post('/api/party/join', { data: { joinCode } })).ok()).toBe(true);
    expect((await partnerContext.request.post('/api/party/ready', { data: { ready: true } })).ok()).toBe(true);
    await leader.reload();
    await partner.reload();

    await sendCommand(leader, 'dungeon');
    const leaderStarted = await waitForActiveRun(leaderContext);
    const partnerStarted = await waitForActiveRun(partnerContext);
    leaderIdentity.playerId = leaderStarted.character.id;
    partnerIdentity.playerId = partnerStarted.character.id;
    expect(partnerStarted.activeRun.id).toBe(leaderStarted.activeRun.id);
    expect(leaderStarted.activeRun.participants).toHaveLength(2);
    await expect(leader.getByTestId('dungeon-party-member')).toHaveCount(2);
    await expect(partner.getByTestId('dungeon-party-member')).toHaveCount(2);
    await expect(leader.getByTestId('dungeon-player-hp')).toContainText('40 / 40 HP');
    await expect(leader.locator('.simple-loop-action')).toHaveCount(1);
    await expect(leader.getByTestId('stream-guard')).toHaveCount(0);

    await leader.getByTestId('stream-message').fill('partner draft stays during realtime');
    const beforePartnerAttack = await dashboard(leaderContext);
    await partner.getByTestId('stream-attack').click();
    const afterPartnerAttack = await waitForRunVersion(leaderContext, beforePartnerAttack.activeRun.id, beforePartnerAttack.activeRun.version);
    expect(afterPartnerAttack.activeRun.enemy.hp).toBeLessThan(beforePartnerAttack.activeRun.enemy.hp);
    await expect(leader.getByTestId('stream-message')).toHaveValue('partner draft stays during realtime');
    await expect(leader.getByTestId('dungeon-enemy-hp')).toHaveText(`${afterPartnerAttack.activeRun.enemy.hp} / ${afterPartnerAttack.activeRun.enemy.maxHp} HP`);

    await leaderContext.setOffline(true);
    const beforeReconnect = await dashboard(partnerContext);
    await partner.getByTestId('stream-attack').click();
    const partnerAfterReconnectAction = await waitForRunVersion(partnerContext, beforeReconnect.activeRun.id, beforeReconnect.activeRun.version);
    await leaderContext.setOffline(false);
    await expect.poll(async () => leader.locator('[data-testid="dungeon-enemy-hp"]').textContent(), { timeout: 10000 }).toBe(`${partnerAfterReconnectAction.activeRun.enemy.hp} / ${partnerAfterReconnectAction.activeRun.enemy.maxHp} HP`);
    await expect(leader.getByTestId('stream-message')).toHaveValue('partner draft stays during realtime');

    const reloadedRunId = (await dashboard(leaderContext)).activeRun.id;
    await leader.reload();
    await pageReady(leader);
    const afterReload = await dashboard(leaderContext);
    expect(afterReload.activeRun.id).toBe(reloadedRunId);
    await expect(leader.getByTestId('dungeon-player-hp')).toHaveText(`${afterReload.activeRun.viewer.hp} / ${afterReload.activeRun.viewer.maxHp} HP`);

    await finishSimpleRun([leaderIdentity, partnerIdentity]);
  } finally {
    await leaderContext.setOffline(false).catch(() => {});
    try {
      if ((await dashboard(leaderContext)).activeRun) await finishSimpleRun([leaderIdentity, partnerIdentity]);
    } catch {
      // The test assertion is the useful failure; teardown should not mask it.
    }
    await leaderContext.close();
    await partnerContext.close();
  }
});

async function pageReady(page) {
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
}

test('a failed simple run leaves one failure receipt and makes authoritative healing explicit', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  try {
    await login(page, 'b');
    // Dungeon run HP is separate from carried character HP. Create real, persisted
    // attrition first so the post-run Heal panel has an authoritative next action.
    await sendCommand(page, 'hunt');
    await expect(page.getByTestId('stream-system-entry').filter({ hasText: /Victory — .* defeated/i }).last()).toBeVisible({ timeout: 7000 });
    let failedRunId = null;
    for (let attempt = 0; attempt < 6 && !failedRunId; attempt += 1) {
      await sendCommand(page, 'dungeon');
      const started = await waitForActiveRun(context);
      for (let step = 0; step < 40; step += 1) {
        const state = await dashboard(context);
        if (!state.activeRun) break;
        if (state.activeRun.phase === 'between_encounter') {
          const continued = await context.request.post(`/api/runs/${state.activeRun.id}/continue`);
          expect(continued.ok()).toBe(true);
        } else {
          await attackFromSimpleSurface(page, context);
        }
      }
      const entries = await streamEntries(context);
      if (entries.some((entry) => entry.runId === started.activeRun.id && /fell in Frayed Hollow/i.test(entry.body))) {
        failedRunId = started.activeRun.id;
      }
    }
    expect(failedRunId).toBeTruthy();
    await expect.poll(async () => (await dashboard(context)).activeRun || null, { timeout: 7000 }).toBeNull();
    await expect(page.getByTestId('stream-system-entry').filter({ hasText: /fell in Frayed Hollow/i }).last()).toBeVisible({ timeout: 7000 });
    await sendCommand(page, 'rest');
    await expect(page.getByTestId('simple-recovery-use-potion')).toBeVisible();
    const beforeHeal = await dashboard(context);
    await page.getByTestId('simple-recovery-use-potion').click();
    await expect(page.getByTestId('stream-system-entry').filter({ hasText: /used a health potion/i }).last()).toBeVisible({ timeout: 7000 });
    await expect.poll(async () => (await dashboard(context)).character.currentHealth).toBeGreaterThan(beforeHeal.character.currentHealth);
  } finally {
    await context.close();
  }
});

test('legacy tactical completion still projects one concise clear receipt during the migration', async ({ page, context }) => {
  await login(page, 'a');
  const started = await context.request.post('/api/dungeons/frayed-hollow/start');
  expect(started.ok()).toBe(true);
  const terminal = await finishLegacyRun(context);
  expect(terminal.activeRun).toBeNull();
  await expect(page.getByTestId('stream-system-entry').filter({ hasText: /cleared Frayed Hollow/i }).last()).toBeVisible({ timeout: 10000 });
});
