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

async function alternateAttacksUntilPhaseChanges(contexts, pages, expectedPhase, startTurn = 0) {
  let turn = startTurn;
  for (let guard = 0; guard < 60; guard += 1) {
    const state = await dashboard(contexts[0]);
    if (state.activeRun?.phase !== expectedPhase) return turn;

    let page = pages[turn % pages.length];
    await page.reload();
    if (await page.getByTestId('attack').count() === 0) {
      page = pages[(turn + 1) % pages.length];
      await page.reload();
    }
    await expect(page.getByTestId('run-state')).toContainText(`Phase: ${expectedPhase}`);
    await clickAndWait(page, 'attack');
    turn += 1;
  }
  throw new Error(`Local co-op run did not leave ${expectedPhase} within the guard limit.`);
}

async function clickCodexTab(page, category) {
  await page.getByTestId(`codex-tab-${category}`).click();
  await expect(page.getByTestId('codex-status')).not.toHaveText('Loading…');
}

test('standalone local mode supports co-op combat plus the living Codex without Threaded', async ({ browser }) => {
  // This intentionally exercises a complete two-player dungeon, support actions, reward
  // projection, and Codex navigation in one real-browser journey. Auto-strike cadence and
  // repeated page rehydration make 90s too tight on CI even when the product is healthy.
  test.setTimeout(150000);
  const leaderContext = await browser.newContext();
  const partnerContext = await browser.newContext();
  const leader = await leaderContext.newPage();
  const partner = await partnerContext.newPage();

  try {
    await loginLocal(leader, 'a', 'Local Weaver A');
    await loginLocal(partner, 'b', 'Local Weaver B');

    for (const heading of ['Local Weaver A', 'Play', 'Party', 'Gear', 'Achievements', 'World Arc', 'Honey']) {
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
    await expect(leader.getByTestId('start-waiting')).toContainText('ready');
    await expect(leader.getByTestId('start-dungeon')).toHaveCount(0);

    await clickAndWait(partner, 'toggle-ready');
    await leader.reload();
    await expect(leader.getByTestId('party-readiness')).toContainText('All members ready');
    await expect(leader.getByTestId('start-dungeon')).toBeVisible();
    await clickAndWait(leader, 'start-dungeon');

    await expect(leader.getByTestId('run-state')).toContainText('2 Weavers');
    await expect(leader.getByTestId('run-scaling')).toContainText('Enemy HP ×1.65');
    await expect(leader.getByTestId('combat-help')).toContainText('Guard halves the hit');

    await partner.reload();
    await expect(partner.getByTestId('mend-unavailable')).toContainText('Mend appears when an ally is wounded');
    await expect(partner.getByTestId('revive-unavailable')).toContainText('Revive appears when an ally falls');

    for (let index = 0; index < 20; index += 1) await clickAndWait(partner, 'guard');
    await expect(partner.getByTestId('defeated-player')).toContainText('down');
    await expect(partner.getByTestId('combat-actions')).toHaveCount(0);

    await leader.reload();
    await expect(leader.getByTestId('revive')).toBeVisible();
    await expect(leader.getByTestId('revive-target')).toContainText('Local Weaver B');
    await clickAndWait(leader, 'revive');
    await expect(leader.getByTestId('revive-unavailable')).toContainText('Revive used this run');
    const leaderAfterRevive = await leader.getByTestId('run-participant').filter({ hasText: 'Local Weaver A' }).textContent();
    expect(leaderAfterRevive).toMatch(/revives 1/);

    await partner.reload();
    await expect(partner.getByTestId('combat-actions')).toBeVisible();
    await expect(partner.getByTestId('mend')).toBeVisible();
    await expect(partner.getByTestId('mend-target')).toContainText('Local Weaver A');
    await clickAndWait(partner, 'mend');
    const partnerSupport = await partner.getByTestId('run-participant').filter({ hasText: 'Local Weaver B' }).textContent();
    expect(partnerSupport).toMatch(/healing [1-9]\d*/);
    await expect(partner.getByTestId('mend-unavailable')).toContainText('Mend used this encounter');

    await leader.reload();
    const preventedBeforeText = await leader.getByTestId('run-participant').filter({ hasText: 'Local Weaver A' }).textContent();
    const preventedBefore = Number(preventedBeforeText.match(/prevented (\d+)/)?.[1] || 0);
    await clickAndWait(leader, 'guard');
    const preventedAfterText = await leader.getByTestId('run-participant').filter({ hasText: 'Local Weaver A' }).textContent();
    const preventedAfter = Number(preventedAfterText.match(/prevented (\d+)/)?.[1] || 0);
    expect(preventedAfter).toBeGreaterThan(preventedBefore);

    let turn = await alternateAttacksUntilPhaseChanges([leaderContext, partnerContext], [leader, partner], 'combat');
    await leader.reload();
    await expect(leader.getByTestId('run-state')).toContainText('Phase: upgrade');
    await partner.reload();
    await expect(partner.getByTestId('upgrade-waiting')).toBeVisible();

    await clickAndWait(leader, 'upgrade-reinforce');
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
    await expect(leader.getByRole('heading', { name: 'Codex' })).toBeVisible();
    await expect(leader.getByTestId('codex-status')).not.toHaveText('Loading…');
    await expect(leader.getByTestId('codex-count-enemies')).toHaveText('Enemies 3');
    await expect(leader.getByTestId('codex-count-bosses')).toHaveText('Bosses 1');
    await expect(leader.getByTestId('codex-count-lore')).toHaveText('Lore 4');
    await expect(leader.getByTestId('codex-count-achievements')).toHaveText('Achievements 3');
    await expect(leader.getByTestId('codex-count-items')).toHaveText('Items 2');
    await expect(leader.getByTestId('codex-count-history')).toHaveText('History 3');

    await clickCodexTab(leader, 'bosses');
    await expect(leader.getByTestId('codex-entry')).toHaveCount(1);
    await expect(leader.getByTestId('codex-detail-title')).toHaveText('The First Needle');
    await expect(leader.getByTestId('codex-mechanics')).toContainText('Base Hp');
    await expect(leader.getByTestId('codex-mechanics')).toContainText('24');

    await clickCodexTab(leader, 'lore');
    await leader.getByTestId('codex-search').fill('hidden structure');
    await expect(leader.getByTestId('codex-entry')).toHaveCount(1);
    await expect(leader.getByTestId('codex-detail-title')).toHaveText('The Loom');
    await leader.getByTestId('codex-search').fill('');

    await clickCodexTab(leader, 'achievements');
    const hollowAchievement = leader.getByTestId('codex-entry').filter({ hasText: 'Hollow Cleared' });
    await hollowAchievement.click();
    await expect(leader.getByTestId('codex-detail')).toContainText('Status: Unlocked');

    await clickCodexTab(leader, 'items');
    await leader.getByTestId('codex-search').fill(leaderItemName);
    await expect(leader.getByTestId('codex-entry')).toHaveCount(1);
    await expect(leader.getByTestId('codex-detail-title')).toHaveText(leaderItemName);
    await expect(leader.getByTestId('codex-detail-body')).toContainText('recovered from frayed-hollow');
    await leader.getByTestId('codex-search').fill('');

    await clickCodexTab(leader, 'history');
    await expect(leader.getByTestId('codex-entry').filter({ hasText: 'Frayed Hollow cleared' })).toHaveCount(1);
    const relicHistory = leader.getByTestId('codex-entry').filter({ hasText: 'Relic discovered:' }).first();
    await relicHistory.click();
    await expect(leader.getByTestId('codex-related-item')).toBeVisible();
    await leader.getByTestId('codex-related-item').click();
    await expect(leader.getByTestId('codex-tab-items')).toHaveAttribute('aria-pressed', 'true');
    await expect(leader.getByTestId('codex-detail-title')).toContainText(/.+/);

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