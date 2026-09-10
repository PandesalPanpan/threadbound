import { test, expect } from '@playwright/test';

async function loginLocal(page, slot, expectedName) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name:'Local development login' })).toBeVisible();
  await page.getByTestId(`local-login-${slot}`).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  await expect(page.getByTestId('stream-connection')).toHaveText('WebSocket live');
  await expect(page.getByTestId('thread-game-player-name')).toHaveText(expectedName);
  await expect(page.getByTestId('thread-game-header')).toBeVisible();
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
  await expect(reply).toBeVisible({ timeout:5000 });
  return reply;
}

async function createParty(page, context) {
  const reply = await openThreadReply(page, '/party');
  await reply.getByRole('button', { name:'Create party' }).click();
  await expect.poll(async () => (await dashboard(context)).party?.joinCode || null).not.toBeNull();
  return (await dashboard(context)).party.joinCode;
}

async function joinAndReady(page, context, joinCode) {
  const reply = await openThreadReply(page, '/party');
  await reply.getByTestId('stream-party-code').fill(joinCode);
  await reply.getByRole('button', { name:'Join', exact:true }).click();
  await expect.poll(async () => (await dashboard(context)).party?.members?.length || 0).toBe(2);
  await page.getByTestId('stream-command-card').getByRole('button', { name:'Ready', exact:true }).click();
  await expect.poll(async () => {
    const data = await dashboard(context);
    return data.party.members.find((member) => member.playerId === data.character.id)?.ready || false;
  }).toBe(true);
}

async function runAction(page, context, testId) {
  const before = await dashboard(context);
  const action = page.getByTestId('stream-thread-local').getByTestId(testId);
  await expect(action).toBeVisible({ timeout:5000 });
  await action.click();
  await expect.poll(async () => {
    const after = await dashboard(context);
    if (!after.activeRun || after.activeRun.id !== before.activeRun?.id) return true;
    return after.activeRun.version > before.activeRun.version;
  }).toBe(true);
}

async function playSharedRun(contexts, pages) {
  for (let turn = 0; turn < 120; turn += 1) {
    const shared = await dashboard(contexts[0]);
    if (!shared.activeRun) return;
    let index = turn % pages.length;
    let state = await dashboard(contexts[index]);
    if (state.activeRun.viewer.hp <= 0) {
      index = (index + 1) % pages.length;
      state = await dashboard(contexts[index]);
    }
    const downed = state.activeRun.participants.find((participant) => participant.hp <= 0);
    if (downed && state.activeRun.viewer.reviveCharges > 0) {
      await runAction(pages[index], contexts[index], 'stream-revive');
    } else if (!state.activeRun.enemyIntent && state.activeRun.viewer.mendCharges > 0 && state.activeRun.participants.some((participant) => participant.hp > 0 && participant.maxHp - participant.hp >= 10)) {
      const version = state.activeRun.version;
      await pages[index].getByTestId('stream-message').fill('/mend');
      await pages[index].getByTestId('stream-send').click();
      await expect.poll(async () => (await dashboard(contexts[index])).activeRun?.version ?? version + 1).toBeGreaterThan(version);
    } else if (state.activeRun.enemy.hp <= state.character.attackPower) {
      await runAction(pages[index], contexts[index], 'stream-attack');
    } else if (state.activeRun.enemyIntent) {
      await runAction(pages[index], contexts[index], state.activeRun.enemyIntent.reaction === 'interrupt' ? 'stream-interrupt' : 'stream-guard');
    } else {
      await runAction(pages[index], contexts[index], 'stream-attack');
    }
  }
  throw new Error('Local co-op run did not complete within 120 explicit actions.');
}

async function expectCodexCountAtLeast(page, category, minimum) {
  const text = await page.getByTestId(`codex-count-${category}`).textContent();
  expect(Number(text?.match(/\d+/)?.[0] || 0)).toBeGreaterThanOrEqual(minimum);
}

test('standalone local mode supports streamlined chat co-op, rewards, and the living Codex', async ({ browser }) => {
  test.setTimeout(120000);
  const leaderContext = await browser.newContext();
  const partnerContext = await browser.newContext();
  const leader = await leaderContext.newPage();
  const partner = await partnerContext.newPage();

  try {
    await loginLocal(leader, 'a', 'Local Weaver A');
    await loginLocal(partner, 'b', 'Local Weaver B');
    await expect(leader.getByTestId('local-honey-disabled')).toBeHidden();
    const honeyAttempt = await leaderContext.request.post('/api/honey/purchases/training-cache', { headers:{ 'Idempotency-Key':'local-mode-key-123' } });
    expect(honeyAttempt.status()).toBe(409);
    expect((await honeyAttempt.json()).error).toBe('threaded_wallet_unavailable');

    const inviteCode = await createParty(leader, leaderContext);
    await joinAndReady(partner, partnerContext, inviteCode);
    await leader.reload();
    await expect(leader.getByTestId('stream-start-dungeon')).toBeVisible();
    await leader.getByTestId('stream-start-dungeon').click();
    await expect.poll(async () => (await dashboard(leaderContext)).activeRun?.id || null).not.toBeNull();

    const started = await dashboard(leaderContext);
    expect(started.activeRun.participants).toHaveLength(2);
    expect(started.activeRun.streamlinedLoop).toBe(true);
    expect(started.activeRun.streamlinedSkills).toBe(true);
    expect(started.activeRun.runEventSchedule).toBeNull();
    expect(started.activeRun.runUpgradeOfferIds).toEqual([]);
    await expect(leader.getByTestId('stream-build-summary')).toBeHidden();

    await playSharedRun([leaderContext, partnerContext], [leader, partner]);
    const completed = await dashboard(leaderContext);
    expect(completed.activeRun).toBeNull();
    expect(completed.inventory).toHaveLength(1);
    expect(completed.character.threadDust).toBe(15);
    await expect(partner.getByTestId('stream-system-entry').filter({ hasText:/cleared Frayed Hollow/ }).last()).toBeVisible();

    await leader.goto('/codex');
    await expect(leader.getByTestId('codex-status')).not.toHaveText('Loading…');
    await expectCodexCountAtLeast(leader, 'enemies', 6);
    await expectCodexCountAtLeast(leader, 'bosses', 2);
    await expectCodexCountAtLeast(leader, 'items', 1);
    await expectCodexCountAtLeast(leader, 'history', 2);
  } finally {
    await leaderContext.close();
    await partnerContext.close();
  }
});
