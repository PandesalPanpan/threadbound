import { test, expect } from '@playwright/test';

async function loginWithThreaded(page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Connect with Threaded' }).click();
  await expect(page.getByRole('heading', { name: 'Fake Threaded' })).toBeVisible();
  await page.getByRole('button', { name: 'Authorize Threadbound' }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('threaded-user')).toContainText('E2E Weaver');
  await expect(page.locator('#status')).toHaveText('Ready');
}

async function clickAndWait(page, testId) {
  await page.getByTestId(testId).click();
  await expect(page.locator('#status')).toHaveText('Ready');
}

async function dashboard(context) {
  const response = await context.request.get('/api/dashboard');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function alternateAttacksUntilPhaseChanges(contexts, pages, expectedPhase, startTurn = 0) {
  let turn = startTurn;
  for (let guard = 0; guard < 40; guard += 1) {
    const state = await dashboard(contexts[0]);
    if (state.activeRun?.phase !== expectedPhase) return turn;
    const page = pages[turn % pages.length];
    await page.reload();
    await expect(page.getByTestId('run-state')).toContainText(`Phase: ${expectedPhase}`);
    await clickAndWait(page, 'attack');
    turn += 1;
  }
  throw new Error(`Co-op run did not leave ${expectedPhase} within the guard limit.`);
}

test('Threaded login -> solo dungeon -> generated loot -> equip -> idempotent Honey spend', async ({ page }) => {
  await loginWithThreaded(page);
  await expect(page.getByTestId('honey-balance')).toHaveText('100');
  await expect(page.getByTestId('attack-power')).toHaveText('6');
  const worldBefore = Number(await page.getByTestId('world-progress').textContent());

  await clickAndWait(page, 'start-dungeon');
  for (let index = 0; index < 6; index += 1) await clickAndWait(page, 'attack');
  await expect(page.getByTestId('run-state')).toContainText('Phase: upgrade');

  await clickAndWait(page, 'upgrade-sharpen');
  await expect(page.getByTestId('run-state')).toContainText('Phase: boss');
  for (let index = 0; index < 3; index += 1) await clickAndWait(page, 'attack');

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

  await clickAndWait(page, 'start-dungeon');
  await expect(page.getByTestId('run-state')).toContainText('Phase: combat');
  await expect(page.getByTestId('attack-power')).not.toHaveText('6');
});

test('two browser sessions form a party and complete one shared scaled dungeon', async ({ browser }) => {
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
    await expect(partner.getByTestId('party-readiness')).toContainText('Waiting');

    await clickAndWait(partner, 'toggle-ready');
    await expect(partner.getByTestId('party-readiness')).toContainText('All members ready');

    await leader.reload();
    await expect(leader.getByTestId('party-member')).toHaveCount(2);
    await expect(leader.getByTestId('party-readiness')).toContainText('All members ready');
    await clickAndWait(leader, 'start-dungeon');

    await expect(leader.getByTestId('run-state')).toContainText('2 players');
    await expect(leader.getByTestId('run-scaling')).toContainText('Enemy HP ×1.65');
    await expect(leader.getByTestId('run-participant')).toHaveCount(2);

    await partner.reload();
    await expect(partner.getByTestId('run-state')).toContainText('2 players');
    await expect(partner.getByTestId('party-readiness')).toContainText('locked');

    await clickAndWait(leader, 'attack');
    await partner.reload();
    await clickAndWait(partner, 'attack');
    await leader.reload();
    const contributionRows = await leader.getByTestId('run-participant').allTextContents();
    expect(contributionRows.every((row) => /contribution [1-9]\d*/.test(row))).toBe(true);

    let turn = await alternateAttacksUntilPhaseChanges([leaderContext, partnerContext], [leader, partner], 'combat', 2);
    await leader.reload();
    await expect(leader.getByTestId('run-state')).toContainText('Phase: upgrade');
    await partner.reload();
    await expect(partner.getByTestId('upgrade-waiting')).toBeVisible();

    await clickAndWait(leader, 'upgrade-sharpen');
    await expect(leader.getByTestId('run-state')).toContainText('Phase: boss');
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
    await expect(leader.getByTestId('party-member').filter({ hasText: 'Leader · Ready' })).toHaveCount(1);
    await expect(partner.getByTestId('party-member').filter({ hasText: 'Not ready' })).toHaveCount(1);
  } finally {
    await leaderContext.close();
    await partnerContext.close();
  }
});
