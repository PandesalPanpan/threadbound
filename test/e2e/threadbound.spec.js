import { test, expect } from '@playwright/test';

async function loginWithThreaded(page) {
  await page.goto('/');
  await page.getByRole('link', { name:'Connect with Threaded' }).click();
  await expect(page.getByRole('heading', { name:'Fake Threaded' })).toBeVisible();
  await page.getByRole('button', { name:'Authorize Threadbound' }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('auth-source')).toHaveText('threaded');
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  await expect(page.getByTestId('stream-thread-local')).toBeVisible({ timeout:7000 });
}

async function dashboard(context) {
  const response = await context.request.get('/api/dashboard');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function openThreadReply(page, command) {
  await page.getByTestId('stream-message').fill(command);
  await page.getByTestId('stream-send').click();
  const reply = page.getByTestId('stream-command-card');
  await expect(reply).toBeVisible({ timeout:7000 });
  expect(await reply.evaluate((node) => node.parentElement?.dataset.testid)).toBe('adventure-stream-log');
  return reply;
}

async function startFromThread(page, context) {
  const start = page.getByTestId('stream-thread-local').getByTestId('stream-start-dungeon');
  await expect(start).toBeVisible({ timeout:7000 });
  await start.click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.id || null, { timeout:7000 }).not.toBeNull();
}

async function streamAction(page, context, testId) {
  const before = await dashboard(context);
  const runId = before.activeRun?.id;
  const version = before.activeRun?.version ?? -1;
  const action = page.getByTestId('stream-thread-local').getByTestId(testId);
  await expect(action).toBeVisible({ timeout:7000 });
  await expect(action).toBeEnabled({ timeout:7000 });
  await action.click();
  await expect.poll(async () => {
    const after = await dashboard(context);
    if (!after.activeRun || after.activeRun.id !== runId) return true;
    return (after.activeRun.version ?? -1) > version;
  }, { timeout:7000 }).toBe(true);
}

async function reactOrAttackFromThread(page, context) {
  const state = await dashboard(context);
  if (state.activeRun?.enemyIntent) {
    return streamAction(page, context, state.activeRun.enemyIntent.reaction === 'interrupt' ? 'stream-interrupt' : 'stream-guard');
  }
  return streamAction(page, context, 'stream-attack');
}

async function actionsUntilPhase(context, page, targetPhase, limit = 100) {
  for (let index = 0; index < limit; index += 1) {
    const state = await dashboard(context);
    if (!state.activeRun || state.activeRun.phase === targetPhase) return state;
    if (!['combat','boss'].includes(state.activeRun.phase)) throw new Error(`Unexpected phase ${state.activeRun.phase}.`);
    await reactOrAttackFromThread(page, context);
  }
  throw new Error(`Run did not reach ${targetPhase}.`);
}

async function expectCountAtLeast(locator, minimum) {
  const text = await locator.textContent();
  const count = Number(text?.match(/\d+/)?.[0] || 0);
  expect(count).toBeGreaterThanOrEqual(minimum);
}

async function createPartyThroughThread(page, context) {
  let reply = await openThreadReply(page, '/party');
  await reply.getByRole('button', { name:'Create party' }).click();
  await expect.poll(async () => (await dashboard(context)).party?.joinCode || null, { timeout:7000 }).not.toBeNull();
  reply = page.getByTestId('stream-command-card');
  const party = (await dashboard(context)).party;
  expect(party?.joinCode).toMatch(/^[A-Z0-9]{6}$/);
  await expect(reply).toContainText(party.joinCode);
  return party.joinCode;
}

async function joinPartyThroughThread(page, context, joinCode) {
  const reply = await openThreadReply(page, '/party');
  await reply.getByTestId('stream-party-code').fill(joinCode.toLowerCase());
  await reply.getByRole('button', { name:'Join', exact:true }).click();
  await expect.poll(async () => (await dashboard(context)).party?.members?.length || 0, { timeout:7000 }).toBe(2);
  await page.getByTestId('stream-command-card').getByRole('button', { name:'Ready', exact:true }).click();
  await expect.poll(async () => {
    const state = await dashboard(context);
    return state.party?.members?.find((member) => member.playerId === state.character.id)?.ready || false;
  }, { timeout:7000 }).toBe(true);
}

async function alternatePartyTurns(contexts, pages, targetPhase, startTurn = 0) {
  let turn = startTurn;
  for (let guard = 0; guard < 120; guard += 1) {
    const shared = await dashboard(contexts[0]);
    if (!shared.activeRun || shared.activeRun.phase === targetPhase) return turn;
    if (!['combat','boss'].includes(shared.activeRun.phase)) throw new Error(`Unexpected co-op phase ${shared.activeRun.phase}.`);

    let index = turn % pages.length;
    let state = await dashboard(contexts[index]);
    if ((state.activeRun.viewer.hp ?? 0) <= 0) {
      index = (index + 1) % pages.length;
      state = await dashboard(contexts[index]);
    }
    if ((state.activeRun.viewer.hp ?? 0) <= 0) throw new Error('No living co-op actor remains.');

    const local = pages[index].getByTestId('stream-thread-local');
    const downed = state.activeRun.participants.find((participant) => participant.hp <= 0);
    if (downed && state.activeRun.viewer.reviveCharges > 0) {
      const revive = local.getByRole('button', { name:'Revive ally' });
      await expect(revive).toBeVisible({ timeout:7000 });
      const version = state.activeRun.version;
      await revive.click();
      await expect.poll(async () => (await dashboard(contexts[index])).activeRun?.version ?? -1, { timeout:7000 }).toBeGreaterThan(version);
      turn += 1;
      continue;
    }

    if (!state.activeRun.enemyIntent && state.activeRun.viewer.mendCharges > 0) {
      const wounded = state.activeRun.participants.find((participant) => participant.hp > 0 && participant.maxHp - participant.hp >= 10);
      if (wounded) {
        const mend = local.getByRole('button', { name:'Mend ally' });
        if (await mend.isVisible().catch(() => false)) {
          const version = state.activeRun.version;
          await mend.click();
          await expect.poll(async () => (await dashboard(contexts[index])).activeRun?.version ?? -1, { timeout:7000 }).toBeGreaterThan(version);
          turn += 1;
          continue;
        }
      }
    }

    await reactOrAttackFromThread(pages[index], contexts[index]);
    turn += 1;
  }
  throw new Error(`Co-op run did not reach ${targetPhase}.`);
}

test('Threaded login -> simple dungeon chat -> direct boss -> gear -> Codex -> idempotent Honey spend', async ({ page, context }) => {
  test.setTimeout(110000);
  await loginWithThreaded(page);
  const before = await dashboard(context);
  expect(before.wallet.balance).toBe(100);
  const inventoryBefore = before.inventory.length;
  const worldBefore = before.world.frayedHollowClears;

  await startFromThread(page, context);
  let state = await dashboard(context);
  expect(state.activeRun.streamlinedLoop).toBe(true);
  expect(state.activeRun.runEventSchedule).toBeNull();
  expect(state.activeRun.runPowerDraftsEnabled).toBe(false);
  expect(state.activeRun.selectedUpgrades).toEqual([]);
  await expect(page.getByTestId('stream-build-summary')).toBeHidden();

  await actionsUntilPhase(context, page, 'boss');
  state = await dashboard(context);
  expect(state.activeRun.phase).toBe('boss');
  expect(state.activeRun.runAttackBonus).toBe(0);
  expect(state.activeRun.runEventHistory).toEqual([]);
  expect(state.runUpgrades || []).toEqual([]);

  await actionsUntilPhase(context, page, 'complete');
  const completed = await dashboard(context);
  expect(completed.activeRun).toBeNull();
  expect(completed.inventory.length).toBe(inventoryBefore + 1);
  expect(completed.character.threadDust).toBeGreaterThanOrEqual(15);
  expect(completed.world.frayedHollowClears).toBe(worldBefore + 1);

  const gearReply = await openThreadReply(page, '/gear');
  await expect(gearReply.locator('.thread-gear-list')).toBeVisible();
  const rewardName = completed.inventory.at(-1).name;
  await expect(gearReply).toContainText(rewardName);
  const attackBeforeEquip = completed.character.attackPower;
  await gearReply.getByRole('button', { name:'Equip' }).last().click();
  await expect.poll(async () => (await dashboard(context)).character.attackPower, { timeout:7000 }).toBeGreaterThan(attackBeforeEquip);
  const upgradedAttack = (await dashboard(context)).character.attackPower;

  const key = `e2e-streamlined-${Date.now()}`;
  const request = page.context().request;
  const first = await request.post('/api/honey/purchases/training-cache', { headers:{ 'Idempotency-Key':key } });
  expect(first.status()).toBe(201);
  const firstBody = await first.json();
  expect(firstBody.grant_applied).toBe(true);

  const retry = await request.post('/api/honey/purchases/training-cache', { headers:{ 'Idempotency-Key':key } });
  expect(retry.status()).toBe(200);
  const retryBody = await retry.json();
  expect(retryBody.grant_applied).toBe(false);
  expect(retryBody.threaded_transaction_id).toBe(firstBody.threaded_transaction_id);

  await page.reload();
  await expect(page.getByTestId('stream-thread-local')).toBeVisible({ timeout:7000 });
  const reloaded = await dashboard(context);
  expect(reloaded.character.attackPower).toBe(upgradedAttack);
  expect(reloaded.inventory.length).toBe(inventoryBefore + 2);

  await page.getByTestId('nav-codex').click();
  await expect(page).toHaveURL(/\/codex/);
  await expect(page.getByTestId('codex-status')).not.toHaveText('Loading…');
  await expectCountAtLeast(page.getByTestId('codex-count-items'), 2);
  await expectCountAtLeast(page.getByTestId('codex-count-history'), 2);
  await page.getByTestId('nav-game').click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
});

test('two browser sessions share one durable streamlined combat thread with viewer-specific controls', async ({ browser }) => {
  test.setTimeout(120000);
  const leaderContext = await browser.newContext();
  const partnerContext = await browser.newContext();
  const leader = await leaderContext.newPage();
  const partner = await partnerContext.newPage();

  try {
    await loginWithThreaded(leader);
    await loginWithThreaded(partner);
    const worldBefore = (await dashboard(leaderContext)).world.frayedHollowClears;

    const inviteCode = await createPartyThroughThread(leader, leaderContext);
    await joinPartyThroughThread(partner, partnerContext, inviteCode);
    await expect.poll(async () => (await dashboard(leaderContext)).party?.allReady || false, { timeout:7000 }).toBe(true);

    await startFromThread(leader, leaderContext);
    const leaderRun = (await dashboard(leaderContext)).activeRun;
    const partnerRun = (await dashboard(partnerContext)).activeRun;
    expect(leaderRun.id).toBe(partnerRun.id);
    expect(leaderRun.participants).toHaveLength(2);
    expect(leaderRun.streamlinedLoop).toBe(true);
    expect(leaderRun.runEventSchedule).toBeNull();
    await expect(leader.getByTestId('stream-thread-local')).toBeVisible();
    await expect(partner.getByTestId('stream-thread-local')).toBeVisible();

    const leaderReceiptsBefore = await leader.getByTestId('stream-system-entry').filter({ hasText:/attacked/i }).count();
    await reactOrAttackFromThread(leader, leaderContext);
    await expect.poll(async () => partner.getByTestId('stream-system-entry').filter({ hasText:/attacked/i }).count(), { timeout:7000 }).toBeGreaterThanOrEqual(leaderReceiptsBefore + 1);

    // Partner consumes the shared authoritative reaction; both dashboards converge on the same version.
    await reactOrAttackFromThread(partner, partnerContext);
    await expect.poll(async () => (await dashboard(partnerContext)).activeRun?.version, { timeout:7000 }).toBe((await dashboard(leaderContext)).activeRun.version);

    let turn = await alternatePartyTurns([leaderContext, partnerContext], [leader, partner], 'boss', 2);
    const bossLeader = (await dashboard(leaderContext)).activeRun;
    const bossPartner = (await dashboard(partnerContext)).activeRun;
    expect(bossLeader.phase).toBe('boss');
    expect(bossPartner.phase).toBe('boss');
    expect(bossLeader.id).toBe(bossPartner.id);
    expect(bossLeader.selectedUpgrades).toEqual([]);
    expect(bossLeader.runEventHistory).toEqual([]);
    await expect(leader.getByTestId('stream-build-summary')).toBeHidden();
    await expect(partner.getByTestId('stream-build-summary')).toBeHidden();

    turn = await alternatePartyTurns([leaderContext, partnerContext], [leader, partner], 'complete', turn);
    expect(turn).toBeGreaterThan(2);
    await expect.poll(async () => (await dashboard(leaderContext)).activeRun, { timeout:7000 }).toBeNull();
    await expect.poll(async () => (await dashboard(partnerContext)).activeRun, { timeout:7000 }).toBeNull();

    const leaderAfter = await dashboard(leaderContext);
    const partnerAfter = await dashboard(partnerContext);
    expect(leaderAfter.inventory.length).toBeGreaterThan(0);
    expect(partnerAfter.inventory.length).toBeGreaterThan(0);
    expect(leaderAfter.world.frayedHollowClears).toBe(worldBefore + 1);
    expect(partnerAfter.world.frayedHollowClears).toBe(worldBefore + 1);
    expect(leaderAfter.achievements.some((achievement) => achievement.name === 'Hollow Cleared')).toBe(true);
    expect(partnerAfter.achievements.some((achievement) => achievement.name === 'Hollow Cleared')).toBe(true);
  } finally {
    await leaderContext.close();
    await partnerContext.close();
  }
});
