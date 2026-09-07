import { test, expect } from '@playwright/test';

async function loginWithThreaded(page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Connect with Threaded' }).click();
  await expect(page.getByRole('heading', { name: 'Fake Threaded' })).toBeVisible();
  await page.getByRole('button', { name: 'Authorize Threadbound' }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('threaded-user')).toContainText('E2E Weaver');
  await expect(page.getByTestId('auth-source')).toHaveText('threaded');
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

async function startFromThread(page, context) {
  await page.getByTestId('stream-start-dungeon').click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.id || null, { timeout: 5000 }).not.toBeNull();
}

async function attackFromThread(page, context) {
  const before = await dashboard(context);
  const version = before.activeRun?.version ?? -1;
  await page.getByTestId('stream-attack').click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.version ?? -1, { timeout: 5000 }).toBeGreaterThan(version);
}

async function attacksUntilPhaseChanges(context, page, expectedPhase, limit = 40) {
  for (let index = 0; index < limit; index += 1) {
    const state = await dashboard(context);
    if (state.activeRun?.phase !== expectedPhase) return;
    await attackFromThread(page, context);
  }
  throw new Error(`Run did not leave ${expectedPhase} within ${limit} explicit attacks.`);
}

async function alternateAttacksUntilPhaseChanges(contexts, pages, expectedPhase, startTurn = 0) {
  let turn = startTurn;
  for (let guard = 0; guard < 60; guard += 1) {
    const state = await dashboard(contexts[0]);
    if (state.activeRun?.phase !== expectedPhase) return turn;
    const index = turn % pages.length;
    const page = pages[index];
    const context = contexts[index];
    await page.reload();
    await expect(page.getByTestId('run-state')).toContainText(`Phase: ${expectedPhase}`);
    await attackFromThread(page, context);
    turn += 1;
  }
  throw new Error(`Co-op run did not leave ${expectedPhase} within the guard limit.`);
}

async function expectCountAtLeast(locator, minimum) {
  const text = await locator.textContent();
  const count = Number(text.match(/\d+/)?.[0] || 0);
  expect(count).toBeGreaterThanOrEqual(minimum);
}

test('Threaded login -> discrete dungeon thread -> generated loot -> codex -> equip -> idempotent Honey spend', async ({ page, context }) => {
  await loginWithThreaded(page);
  await expect(page.getByTestId('honey-balance')).toHaveText('100');
  await expect(page.getByTestId('attack-power')).toHaveText('6');
  const worldBefore = Number(await page.getByTestId('world-progress').textContent());

  await startFromThread(page, context);
  await expect(page.getByTestId('combat-help')).toContainText('explicit');
  await expect(page.getByTestId('combat-coach')).toContainText('Nothing attacks automatically');
  await attacksUntilPhaseChanges(context, page, 'combat');
  await expect(page.getByTestId('run-state')).toContainText('Phase: upgrade');

  await page.getByTestId('stream-suggestions').getByRole('button', { name: 'Sharpen the Thread' }).click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.phase, { timeout: 5000 }).toBe('boss');
  await attacksUntilPhaseChanges(context, page, 'boss');

  await expect(page.getByTestId('inventory-item')).toHaveCount(1);
  await expect(page.getByTestId('thread-dust')).toHaveText('15');
  await expect(page.getByTestId('world-progress')).toHaveText(String(worldBefore + 1));
  await expect(page.getByTestId('achievement')).toHaveCount(2);

  await page.getByRole('button', { name: 'Equip' }).first().click();
  await expect(page.getByTestId('attack-power')).not.toHaveText('6');
  const upgradedAttack = Number(await page.getByTestId('attack-power').textContent());
  expect(upgradedAttack).toBeGreaterThan(6);
  await expect(page.getByTestId('achievement')).toHaveCount(3);

  const key = 'e2e-retry-same-key';
  const request = page.context().request;
  const first = await request.post('/api/honey/purchases/training-cache', { headers: { 'Idempotency-Key': key } });
  expect(first.status()).toBe(201);
  const firstBody = await first.json();
  expect(firstBody.grant_applied).toBe(true);
  expect(firstBody.wallet.balance).toBe(75);

  const retry = await request.post('/api/honey/purchases/training-cache', { headers: { 'Idempotency-Key': key } });
  expect(retry.status()).toBe(200);
  const retryBody = await retry.json();
  expect(retryBody.grant_applied).toBe(false);
  expect(retryBody.threaded_transaction_id).toBe(firstBody.threaded_transaction_id);
  expect(retryBody.wallet.balance).toBe(75);

  await page.reload();
  await expect(page.getByTestId('honey-balance')).toHaveText('75');
  await expect(page.getByTestId('inventory-item')).toHaveCount(2);

  await page.getByTestId('nav-codex').click();
  await expect(page).toHaveURL(/\/codex/);
  await expect(page.getByTestId('codex-status')).not.toHaveText('Loading…');
  await expectCountAtLeast(page.getByTestId('codex-count-items'), 2);
  await expectCountAtLeast(page.getByTestId('codex-count-history'), 2);
  await page.getByTestId('codex-tab-items').click();
  await page.getByTestId('codex-search').fill('Demo Training Sword');
  await expect(page.getByTestId('codex-entry')).toHaveCount(1);
  await expect(page.getByTestId('codex-detail-title')).toHaveText('Demo Training Sword');
  await expect(page.getByTestId('codex-detail')).toContainText('honey-purchase');
  await page.getByTestId('nav-game').click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');

  await startFromThread(page, context);
  await expect(page.getByTestId('run-state')).toContainText('Phase: combat');
  await expect(page.getByTestId('attack-power')).not.toHaveText('6');
});

test('two browser sessions form a party and complete one shared scaled dungeon through the thread', async ({ browser }) => {
  const leaderContext = await browser.newContext();
  const partnerContext = await browser.newContext();
  const leader = await leaderContext.newPage();
  const partner = await partnerContext.newPage();

  try {
    await loginWithThreaded(leader);
    await loginWithThreaded(partner);
    const worldBefore = Number(await leader.getByTestId('world-progress').textContent());

    await clickAndWait(leader, 'create-party');
    const inviteCode = (await leader.getByTestId('party-code').textContent()).trim();
    expect(inviteCode).toMatch(/^[A-Z0-9]{6}$/);

    await partner.getByTestId('party-code-input').fill(inviteCode.toLowerCase());
    await clickAndWait(partner, 'join-party');
    await expect(partner.getByTestId('party-member')).toHaveCount(2);
    await clickAndWait(partner, 'toggle-ready');

    await leader.reload();
    await expect(leader.getByTestId('party-readiness')).toContainText('All members ready');
    await startFromThread(leader, leaderContext);

    await expect(leader.getByTestId('run-state')).toContainText('2 Weavers');
    await expect(leader.getByTestId('run-scaling')).toContainText('Enemy HP ×1.65');
    await expect(leader.getByTestId('run-participant')).toHaveCount(2);

    await partner.reload();
    await expect(partner.getByTestId('run-state')).toContainText('2 Weavers');
    await expect(partner.getByTestId('party-readiness')).toContainText('locked');

    await attackFromThread(leader, leaderContext);
    await partner.reload();
    await attackFromThread(partner, partnerContext);
    await leader.reload();
    const contributionRows = await leader.getByTestId('run-participant').allTextContents();
    expect(contributionRows.every((row) => /damage [1-9]\d*/.test(row))).toBe(true);

    let turn = await alternateAttacksUntilPhaseChanges([leaderContext, partnerContext], [leader, partner], 'combat', 2);
    await leader.reload();
    await expect(leader.getByTestId('run-state')).toContainText('Phase: upgrade');
    await partner.reload();
    await expect(partner.getByTestId('upgrade-intro')).toContainText('Waiting');

    await leader.getByTestId('stream-suggestions').getByRole('button', { name: 'Sharpen the Thread' }).click();
    await expect.poll(async () => (await dashboard(leaderContext)).activeRun?.phase, { timeout: 5000 }).toBe('boss');
    turn = await alternateAttacksUntilPhaseChanges([leaderContext, partnerContext], [leader, partner], 'boss', turn);
    expect(turn).toBeGreaterThan(2);

    await leader.reload();
    await partner.reload();
    await expect(leader.getByTestId('inventory-item')).toHaveCount(1);
    await expect(partner.getByTestId('inventory-item')).toHaveCount(1);
    await expect(leader.getByTestId('thread-dust')).toHaveText('15');
    await expect(partner.getByTestId('thread-dust')).toHaveText('15');
    await expect(leader.getByTestId('world-progress')).toHaveText(String(worldBefore + 1));
    await expect(partner.getByTestId('world-progress')).toHaveText(String(worldBefore + 1));
    await expect(leader.getByTestId('achievement').filter({ hasText: 'Hollow Cleared' })).toHaveCount(1);
    await expect(partner.getByTestId('achievement').filter({ hasText: 'Hollow Cleared' })).toHaveCount(1);

    await expect(leader.getByTestId('party-readiness')).toContainText('Waiting');
    await expect(partner.getByTestId('party-readiness')).toContainText('Waiting');
  } finally {
    await leaderContext.close();
    await partnerContext.close();
  }
});
