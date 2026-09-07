import { test, expect } from '@playwright/test';

async function loginLocal(page, slot, expectedName) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Local development login' })).toBeVisible();
  await page.getByTestId(`local-login-${slot}`).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('auth-source')).toHaveText('local');
  await expect(page.getByTestId('threaded-user')).toHaveText(expectedName);
  await expect(page.getByTestId('local-honey-disabled')).toBeVisible();
  await expect(page.getByTestId('buy-training-cache')).toHaveCount(0);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  await expect(page.getByTestId('stream-connection')).toHaveText('WebSocket live');
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

async function startFromThread(page, context) {
  await page.getByTestId('stream-start-dungeon').click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.id || null, { timeout: 5000 }).not.toBeNull();
}

async function threadAction(page, context, locator) {
  const before = await dashboard(context);
  const runId = before.activeRun?.id;
  const version = before.activeRun?.version ?? -1;
  await locator.click();
  await expect.poll(async () => {
    const after = await dashboard(context);
    if (!after.activeRun) return true;
    if (after.activeRun.id !== runId) return true;
    return after.activeRun.version > version;
  }, { timeout: 5000 }).toBe(true);
}

async function attack(page, context) {
  await threadAction(page, context, page.getByTestId('stream-attack'));
}

async function alternateAttacksUntilPhaseChanges(contexts, pages, expectedPhase, startTurn = 0) {
  let turn = startTurn;
  for (let guard = 0; guard < 70; guard += 1) {
    const state = await dashboard(contexts[0]);
    if (state.activeRun?.phase !== expectedPhase) return turn;
    const index = turn % pages.length;
    const page = pages[index];
    const context = contexts[index];
    await page.reload();
    const viewer = (await dashboard(context)).activeRun?.viewer;
    if (!viewer || viewer.hp <= 0) {
      turn += 1;
      continue;
    }
    await attack(page, context);
    turn += 1;
  }
  throw new Error(`Local co-op run did not leave ${expectedPhase} within the guard limit.`);
}

async function clickCodexTab(page, category) {
  await page.getByTestId(`codex-tab-${category}`).click();
  await expect(page.getByTestId('codex-status')).not.toHaveText('Loading…');
}

test('standalone local mode supports thread-driven co-op combat plus the living Codex without Threaded', async ({ browser }) => {
  test.setTimeout(150000);
  const leaderContext = await browser.newContext();
  const partnerContext = await browser.newContext();
  const leader = await leaderContext.newPage();
  const partner = await partnerContext.newPage();

  try {
    await loginLocal(leader, 'a', 'Local Weaver A');
    await loginLocal(partner, 'b', 'Local Weaver B');

    for (const heading of ['Local Weaver A', 'Current Adventure', 'Party', 'Gear', 'Achievements', 'World Arc', 'Honey']) {
      await expect(leader.getByRole('heading', { name: heading })).toBeVisible();
    }
    await expect(leader.getByTestId('nav-codex')).toBeVisible();

    const honeyAttempt = await leaderContext.request.post('/api/honey/purchases/training-cache', { headers: { 'Idempotency-Key': 'local-mode-key-123' } });
    expect(honeyAttempt.status()).toBe(409);
    expect((await honeyAttempt.json()).error).toBe('threaded_wallet_unavailable');

    await clickAndWait(leader, 'create-party');
    const inviteCode = (await leader.getByTestId('party-code').textContent()).trim();
    await partner.getByTestId('party-code-input').fill(inviteCode);
    await clickAndWait(partner, 'join-party');
    await expect(partner.getByTestId('party-member')).toHaveCount(2);

    await leader.reload();
    await expect(leader.getByTestId('stream-start-dungeon')).toHaveCount(0);
    await clickAndWait(partner, 'toggle-ready');
    await leader.reload();
    await expect(leader.getByTestId('party-readiness')).toContainText('All members ready');
    await expect(leader.getByTestId('stream-start-dungeon')).toBeVisible();
    await startFromThread(leader, leaderContext);

    await expect(leader.getByTestId('run-state')).toContainText('2 Weavers');
    await expect(leader.getByTestId('run-scaling')).toContainText('Enemy HP ×1.65');
    await expect(leader.getByTestId('combat-help')).toContainText('explicit');
    await expect(leader.getByTestId('stream-combat-dock')).toBeHidden();

    // Deliberately let the partner absorb retaliation through explicit Guard turns.
    await partner.reload();
    for (let index = 0; index < 30; index += 1) {
      const state = await dashboard(partnerContext);
      if ((state.activeRun?.viewer?.hp ?? 0) <= 0) break;
      await threadAction(partner, partnerContext, partner.getByTestId('stream-guard'));
    }
    const downState = await dashboard(partnerContext);
    expect(downState.activeRun.viewer.hp).toBe(0);
    await partner.reload();
    await expect(partner.getByTestId('defeated-player')).toContainText('down');
    await expect(partner.getByTestId('stream-attack')).toHaveCount(0);

    await leader.reload();
    const revive = leader.getByTestId('stream-suggestions').getByRole('button', { name: 'Revive ally' });
    await expect(revive).toBeVisible();
    await threadAction(leader, leaderContext, revive);
    const leaderRow = leader.getByTestId('run-participant').filter({ hasText: 'Local Weaver A' });
    await expect(leaderRow).toContainText('revives 1');

    // Wound the leader explicitly, then let the partner use the contextual Mend action.
    await threadAction(leader, leaderContext, leader.getByTestId('stream-guard'));
    await partner.reload();
    const mend = partner.getByTestId('stream-suggestions').getByRole('button', { name: 'Mend ally' });
    await expect(mend).toBeVisible();
    await threadAction(partner, partnerContext, mend);
    const partnerRow = partner.getByTestId('run-participant').filter({ hasText: 'Local Weaver B' });
    await expect.poll(async () => {
      const text = await partnerRow.textContent();
      return Number(text?.match(/healing (\d+)/)?.[1] || 0);
    }, { timeout: 5000 }).toBeGreaterThan(0);

    await leader.reload();
    const preventedBeforeText = await leader.getByTestId('run-participant').filter({ hasText: 'Local Weaver A' }).textContent();
    const preventedBefore = Number(preventedBeforeText.match(/prevented (\d+)/)?.[1] || 0);
    await threadAction(leader, leaderContext, leader.getByTestId('stream-guard'));
    const preventedRow = leader.getByTestId('run-participant').filter({ hasText: 'Local Weaver A' });
    await expect.poll(async () => {
      const text = await preventedRow.textContent();
      return Number(text?.match(/prevented (\d+)/)?.[1] || 0);
    }, { timeout: 5000 }).toBeGreaterThan(preventedBefore);

    let turn = await alternateAttacksUntilPhaseChanges([leaderContext, partnerContext], [leader, partner], 'combat');
    await leader.reload();
    await expect(leader.getByTestId('run-state')).toContainText('Phase: upgrade');
    await partner.reload();
    await expect(partner.getByTestId('upgrade-intro')).toContainText('Waiting');

    const reinforce = leader.getByTestId('stream-suggestions').getByRole('button', { name: 'Reinforce the Weave' });
    await threadAction(leader, leaderContext, reinforce);
    turn = await alternateAttacksUntilPhaseChanges([leaderContext, partnerContext], [leader, partner], 'boss', turn);
    expect(turn).toBeGreaterThan(0);

    await leader.reload();
    await partner.reload();
    await expect(leader.getByTestId('inventory-item')).toHaveCount(1);
    await expect(partner.getByTestId('inventory-item')).toHaveCount(1);
    await expect(leader.getByTestId('thread-dust')).toHaveText('15');
    await expect(partner.getByTestId('thread-dust')).toHaveText('15');
    await expect(leader.getByTestId('party-readiness')).toContainText('Waiting');

    const leaderItemName = (await leader.getByTestId('inventory-item').first().locator('h3').textContent()).trim();
    await leader.getByTestId('nav-codex').click();
    await expect(leader).toHaveURL(/\/codex/);
    await expect(leader.getByTestId('codex-status')).not.toHaveText('Loading…');
    await expect(leader.getByTestId('codex-count-enemies')).toHaveText('Enemies 3');
    await expect(leader.getByTestId('codex-count-bosses')).toHaveText('Bosses 1');
    await expect(leader.getByTestId('codex-count-lore')).toHaveText('Lore 4');
    await expect(leader.getByTestId('codex-count-achievements')).toHaveText('Achievements 3');
    await expect(leader.getByTestId('codex-count-items')).toHaveText('Items 2');
    await expect(leader.getByTestId('codex-count-history')).toHaveText('History 3');

    await clickCodexTab(leader, 'bosses');
    await expect(leader.getByTestId('codex-detail-title')).toHaveText('The First Needle');
    await expect(leader.getByTestId('codex-mechanics')).toContainText('24');

    await clickCodexTab(leader, 'lore');
    await leader.getByTestId('codex-search').fill('hidden structure');
    await expect(leader.getByTestId('codex-entry')).toHaveCount(1);
    await expect(leader.getByTestId('codex-detail-title')).toHaveText('The Loom');
    await leader.getByTestId('codex-search').fill('');

    await clickCodexTab(leader, 'achievements');
    await leader.getByTestId('codex-entry').filter({ hasText: 'Hollow Cleared' }).click();
    await expect(leader.getByTestId('codex-detail')).toContainText('Status: Unlocked');

    await clickCodexTab(leader, 'items');
    await leader.getByTestId('codex-search').fill(leaderItemName);
    await expect(leader.getByTestId('codex-detail-title')).toHaveText(leaderItemName);
    await expect(leader.getByTestId('codex-detail-body')).toContainText('recovered from frayed-hollow');
    await leader.getByTestId('codex-search').fill('');

    await clickCodexTab(leader, 'history');
    await expect(leader.getByTestId('codex-entry').filter({ hasText: 'Frayed Hollow cleared' })).toHaveCount(1);
    const relicHistory = leader.getByTestId('codex-entry').filter({ hasText: 'Relic discovered:' }).first();
    await relicHistory.click();
    await expect(leader.getByTestId('codex-related-item')).toBeVisible();

    await leader.getByTestId('nav-game').click();
    await expect(leader).toHaveURL(/\/game$/);
    await expect(leader.getByTestId('app-status')).toHaveText('Ready');

    await partner.getByRole('button', { name: 'Sign out' }).click();
    await expect(partner).toHaveURL(/\/$/);
    await expect(partner.getByRole('heading', { name: 'Local development login' })).toBeVisible();
  } finally {
    await leaderContext.close();
    await partnerContext.close();
  }
});