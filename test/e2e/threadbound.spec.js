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
  await expect(page.getByTestId('stream-thread-local')).toBeVisible({ timeout: 5000 });
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
  await expect(reply).toBeVisible({ timeout: 5000 });
  expect(await reply.evaluate((node) => node.parentElement?.dataset.testid)).toBe('adventure-stream-log');
  return reply;
}

async function startFromThread(page, context) {
  const start = page.getByTestId('stream-start-dungeon');
  await expect(start).toBeVisible({ timeout: 5000 });
  expect(await start.evaluate((node) => Boolean(node.closest('[data-testid="adventure-stream-log"]')))).toBe(true);
  await start.click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.id || null, { timeout: 5000 }).not.toBeNull();
}

async function streamAction(page, context, testId) {
  const before = await dashboard(context);
  const runId = before.activeRun?.id;
  const version = before.activeRun?.version ?? -1;
  const action = page.getByTestId(testId);
  await expect(action).toBeVisible({ timeout: 5000 });
  await expect(action).toBeEnabled({ timeout: 5000 });
  expect(await action.evaluate((node) => Boolean(node.closest('[data-testid="adventure-stream-log"]')))).toBe(true);
  await action.click();
  await expect.poll(async () => {
    const after = await dashboard(context);
    if (!after.activeRun) return true;
    if (after.activeRun.id !== runId) return true;
    return after.activeRun.version > version;
  }, { timeout: 5000 }).toBe(true);
}

async function attackFromThread(page, context) {
  return streamAction(page, context, 'stream-attack');
}

async function reactOrAttackFromThread(page, context) {
  const state = await dashboard(context);
  if (state.activeRun?.enemyIntent) {
    const action = state.activeRun.enemyIntent.reaction === 'interrupt' ? 'stream-interrupt' : 'stream-guard';
    await streamAction(page, context, action);
    return 'reaction';
  }
  await attackFromThread(page, context);
  return 'attack';
}

async function actionsUntilPhaseChanges(context, page, expectedPhase, limit = 60) {
  for (let index = 0; index < limit; index += 1) {
    const state = await dashboard(context);
    if (state.activeRun?.phase !== expectedPhase) return state;
    await reactOrAttackFromThread(page, context);
  }
  throw new Error(`Run did not leave ${expectedPhase} within ${limit} explicit actions.`);
}

async function choosePowerDraft(page, context, expectedPhase) {
  const state = await dashboard(context);
  expect(state.activeRun?.phase).toBe('upgrade');
  expect(state.runUpgrades).toHaveLength(3);
  const choice = state.runUpgrades[0];
  const button = page.getByTestId('stream-suggestions').getByRole('button', { name: choice.name, exact: true });
  await expect(button).toBeVisible({ timeout: 5000 });
  expect(await button.evaluate((node) => Boolean(node.closest('[data-testid="adventure-stream-log"]')))).toBe(true);
  const beforeVersion = state.activeRun.version;
  await button.click();
  await expect.poll(async () => {
    const after = await dashboard(context);
    return after.activeRun?.phase === expectedPhase && after.activeRun.version > beforeVersion;
  }, { timeout: 5000 }).toBe(true);
  return choice.id;
}

async function chooseRunDiscovery(page, context) {
  const state = await dashboard(context);
  expect(state.activeRun?.phase).toBe('event');
  await expect(page.getByTestId('run-event-card')).toBeVisible({ timeout: 5000 });
  expect(await page.getByTestId('run-event-card').evaluate((node) => Boolean(node.closest('[data-testid="adventure-stream-log"]')))).toBe(true);
  await expect(page.getByTestId('run-event-name')).not.toHaveText('');
  const choice = state.activeRun.runEvent?.choices?.[0];
  expect(choice?.id).toBeTruthy();
  const beforeVersion = state.activeRun.version;
  await page.getByTestId(`run-event-choice-${choice.id}`).click();
  await expect.poll(async () => {
    const after = await dashboard(context);
    return after.activeRun?.phase === 'combat' && after.activeRun.version > beforeVersion;
  }, { timeout: 5000 }).toBe(true);
  return choice.id;
}

async function normalEncountersThroughDiscovery(context, page) {
  await actionsUntilPhaseChanges(context, page, 'combat');
  expect((await dashboard(context)).activeRun?.phase).toBe('upgrade');
  await choosePowerDraft(page, context, 'combat');
  await actionsUntilPhaseChanges(context, page, 'combat');
  expect((await dashboard(context)).activeRun?.phase).toBe('event');
  await chooseRunDiscovery(page, context);
  await actionsUntilPhaseChanges(context, page, 'combat');
  expect((await dashboard(context)).activeRun?.phase).toBe('upgrade');
}

async function alternateReactiveTurnsUntilPhaseChanges(contexts, pages, expectedPhase, startTurn = 0) {
  let turn = startTurn;
  for (let guard = 0; guard < 90; guard += 1) {
    const state = await dashboard(contexts[0]);
    if (state.activeRun?.phase !== expectedPhase) return turn;

    let index = turn % pages.length;
    let actorState = await dashboard(contexts[index]);
    if ((actorState.activeRun?.viewer?.hp ?? 0) <= 0) {
      index = (index + 1) % pages.length;
      actorState = await dashboard(contexts[index]);
    }
    if ((actorState.activeRun?.viewer?.hp ?? 0) <= 0) throw new Error('No living co-op actor remains for the browser acceptance flow.');

    const page = pages[index];
    const context = contexts[index];
    const downed = actorState.activeRun.participants.find((participant) => participant.hp <= 0);
    if (downed && actorState.activeRun.viewer.reviveCharges > 0) {
      const revive = page.getByTestId('stream-suggestions').getByRole('button', { name: 'Revive ally' });
      await expect(revive).toBeVisible({ timeout: 5000 });
      await revive.click();
      await expect.poll(async () => (await dashboard(context)).activeRun?.version, { timeout: 5000 }).toBeGreaterThan(actorState.activeRun.version);
      turn += 1;
      continue;
    }

    if (!actorState.activeRun.enemyIntent && actorState.activeRun.viewer.mendCharges > 0) {
      const wounded = actorState.activeRun.participants
        .filter((participant) => participant.hp > 0 && participant.maxHp - participant.hp >= 8)
        .sort((left, right) => (left.hp / left.maxHp) - (right.hp / right.maxHp))[0];
      if (wounded) {
        const mend = page.getByTestId('stream-suggestions').getByRole('button', { name: 'Mend ally' });
        await expect(mend).toBeVisible({ timeout: 5000 });
        await expect(mend).toBeEnabled({ timeout: 5000 });
        await mend.click();
        await expect.poll(async () => (await dashboard(context)).activeRun?.version, { timeout: 5000 }).toBeGreaterThan(actorState.activeRun.version);
        turn += 1;
        continue;
      }
    }

    await reactOrAttackFromThread(page, context);
    turn += 1;
  }
  throw new Error(`Co-op run did not leave ${expectedPhase} within the guard limit.`);
}

async function expectCountAtLeast(locator, minimum) {
  const text = await locator.textContent();
  const count = Number(text.match(/\d+/)?.[0] || 0);
  expect(count).toBeGreaterThanOrEqual(minimum);
}

async function createPartyThroughThread(page, context) {
  let reply = await openThreadReply(page, '/party');
  await reply.getByRole('button', { name: 'Create party' }).click();
  await expect.poll(async () => (await dashboard(context)).party?.joinCode || null, { timeout: 5000 }).not.toBeNull();
  reply = page.getByTestId('stream-command-card');
  const party = (await dashboard(context)).party;
  expect(party?.joinCode).toMatch(/^[A-Z0-9]{6}$/);
  await expect(reply).toContainText(party.joinCode);
  return party.joinCode;
}

async function joinPartyThroughThread(page, context, joinCode) {
  const reply = await openThreadReply(page, '/party');
  await reply.getByTestId('stream-party-code').fill(joinCode.toLowerCase());
  await reply.getByRole('button', { name: 'Join', exact: true }).click();
  await expect.poll(async () => (await dashboard(context)).party?.members?.length || 0, { timeout: 5000 }).toBe(2);
  await page.getByTestId('stream-command-card').getByRole('button', { name: 'Ready', exact: true }).click();
  await expect.poll(async () => (await dashboard(context)).party?.members?.find((member) => member.playerId === (await dashboard(context)).character.id)?.ready || false, { timeout: 5000 }).toBe(true);
}

test('Threaded login -> responsive dungeon thread -> build drafts -> discovery -> inline gear -> codex -> equip -> idempotent Honey spend', async ({ page, context }) => {
  await loginWithThreaded(page);
  const before = await dashboard(context);
  expect(before.wallet.balance).toBe(100);
  expect(before.character.attackPower).toBe(6);
  const worldBefore = before.world.frayedHollowClears;

  await startFromThread(page, context);
  await expect(page.getByTestId('combat-help')).toContainText('explicit');
  await expect(page.getByTestId('combat-coach')).toContainText('Nothing attacks automatically');
  await normalEncountersThroughDiscovery(context, page);
  await choosePowerDraft(page, context, 'boss');
  await actionsUntilPhaseChanges(context, page, 'boss');

  const completed = await dashboard(context);
  expect(completed.inventory).toHaveLength(1);
  expect(completed.character.threadDust).toBe(15);
  expect(completed.world.frayedHollowClears).toBe(worldBefore + 1);
  expect(completed.achievements).toHaveLength(2);

  const gearReply = await openThreadReply(page, '/gear');
  await expect(gearReply.locator('.thread-gear-list')).toBeVisible();
  await expect(gearReply.getByTestId('stream-gear-item')).toHaveCount(1);
  const rewardName = completed.inventory[0].name;
  await expect(gearReply).toContainText(rewardName);
  await gearReply.getByRole('button', { name: 'Equip' }).click();
  await expect.poll(async () => (await dashboard(context)).character.attackPower, { timeout: 5000 }).toBeGreaterThan(6);
  const upgradedAttack = (await dashboard(context)).character.attackPower;
  expect(upgradedAttack).toBeGreaterThan(6);
  expect((await dashboard(context)).achievements).toHaveLength(3);

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
  const reloaded = await dashboard(context);
  expect(reloaded.wallet.balance).toBe(75);
  expect(reloaded.inventory).toHaveLength(2);
  await expect(page.getByTestId('stream-thread-local')).toBeVisible({ timeout: 5000 });

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
  expect((await dashboard(context)).activeRun?.phase).toBe('combat');
  expect((await dashboard(context)).character.attackPower).toBe(upgradedAttack);
});

test('two browser sessions get viewer-specific controls while sharing one durable combat thread', async ({ browser }) => {
  test.setTimeout(100000);
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
    await expect.poll(async () => (await dashboard(leaderContext)).party?.allReady || false, { timeout: 5000 }).toBe(true);

    await startFromThread(leader, leaderContext);
    const leaderRun = (await dashboard(leaderContext)).activeRun;
    const partnerRun = (await dashboard(partnerContext)).activeRun;
    expect(leaderRun.participants).toHaveLength(2);
    expect(partnerRun.participants).toHaveLength(2);
    await expect(leader.getByTestId('stream-thread-local')).toBeVisible();
    await expect(partner.getByTestId('stream-thread-local')).toBeVisible();

    await attackFromThread(leader, leaderContext);
    await attackFromThread(partner, partnerContext);
    const leaderReceipts = leader.getByTestId('stream-system-entry').filter({ hasText: /attacked/i });
    const partnerReceipts = partner.getByTestId('stream-system-entry').filter({ hasText: /attacked/i });
    await expect(leaderReceipts).toHaveCount(2, { timeout: 5000 });
    await expect(partnerReceipts).toHaveCount(2, { timeout: 5000 });

    let turn = await alternateReactiveTurnsUntilPhaseChanges([leaderContext, partnerContext], [leader, partner], 'combat', 2);
    expect((await dashboard(leaderContext)).activeRun?.phase).toBe('upgrade');
    await expect(leader.getByTestId('stream-suggestions').locator('button.run-power-card:not([hidden])')).toHaveCount(3, { timeout: 5000 });
    await expect(partner.getByTestId('stream-suggestions').locator('button.run-power-card:not([hidden])')).toHaveCount(0);
    await choosePowerDraft(leader, leaderContext, 'combat');
    await expect.poll(async () => (await dashboard(partnerContext)).activeRun?.phase, { timeout: 5000 }).toBe('combat');

    turn = await alternateReactiveTurnsUntilPhaseChanges([leaderContext, partnerContext], [leader, partner], 'combat', turn);
    const discovery = await dashboard(leaderContext);
    expect(discovery.activeRun?.phase).toBe('event');
    await expect(leader.getByTestId('run-event-card')).toBeVisible({ timeout: 5000 });
    await expect(partner.getByTestId('run-event-waiting')).toContainText('Waiting for the party leader', { timeout: 5000 });
    const choice = discovery.activeRun.runEvent.choices[0];
    await leader.getByTestId(`run-event-choice-${choice.id}`).click();
    await expect.poll(async () => (await dashboard(partnerContext)).activeRun?.phase, { timeout: 5000 }).toBe('combat');

    turn = await alternateReactiveTurnsUntilPhaseChanges([leaderContext, partnerContext], [leader, partner], 'combat', turn);
    expect((await dashboard(leaderContext)).activeRun?.phase).toBe('upgrade');
    await choosePowerDraft(leader, leaderContext, 'boss');
    await expect.poll(async () => (await dashboard(partnerContext)).activeRun?.phase, { timeout: 5000 }).toBe('boss');

    turn = await alternateReactiveTurnsUntilPhaseChanges([leaderContext, partnerContext], [leader, partner], 'boss', turn);
    expect(turn).toBeGreaterThan(2);

    const completedState = await dashboard(leaderContext);
    expect(completedState.activeRun).toBeNull();
    expect(completedState.inventory).toHaveLength(1);
    expect(completedState.character.threadDust).toBe(15);
    expect(completedState.world.frayedHollowClears).toBe(worldBefore + 1);

    await leader.reload();
    await partner.reload();
    const leaderAfter = await dashboard(leaderContext);
    const partnerAfter = await dashboard(partnerContext);
    expect(leaderAfter.inventory).toHaveLength(1);
    expect(partnerAfter.inventory).toHaveLength(1);
    expect(leaderAfter.character.threadDust).toBe(15);
    expect(partnerAfter.character.threadDust).toBe(15);
    expect(leaderAfter.world.frayedHollowClears).toBe(worldBefore + 1);
    expect(partnerAfter.world.frayedHollowClears).toBe(worldBefore + 1);
    expect(leaderAfter.achievements.some((achievement) => achievement.name === 'Hollow Cleared')).toBe(true);
    expect(partnerAfter.achievements.some((achievement) => achievement.name === 'Hollow Cleared')).toBe(true);

    const leaderParty = await openThreadReply(leader, '/party');
    const partnerParty = await openThreadReply(partner, '/party');
    await expect(leaderParty).toContainText('Not ready');
    await expect(partnerParty).toContainText('Not ready');
  } finally {
    await leaderContext.close();
    await partnerContext.close();
  }
});
