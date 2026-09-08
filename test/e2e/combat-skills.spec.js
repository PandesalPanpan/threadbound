import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const LOCAL_NAMES = { a: 'Local Weaver A', b: 'Local Weaver B' };
const REVIEW_DIR = 'ux-review';

async function reviewShot(page, name) {
  mkdirSync(REVIEW_DIR, { recursive: true });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${REVIEW_DIR}/${name}.png` });
}

async function login(page, slot) {
  await page.goto('/');
  const local = page.getByTestId(`local-login-${slot}`);
  if (await local.count()) {
    await local.click();
    await expect(page).toHaveURL(/\/game$/);
    await expect(page.getByTestId('threaded-user')).toHaveText(LOCAL_NAMES[slot]);
  } else {
    await page.getByRole('link', { name: 'Connect with Threaded' }).click();
    await expect(page.getByRole('heading', { name: 'Fake Threaded' })).toBeVisible();
    await page.getByRole('button', { name: 'Authorize Threadbound' }).click();
    await expect(page).toHaveURL(/\/game$/);
    await expect(page.getByTestId('threaded-user')).toContainText('E2E Weaver');
  }
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
}

async function dashboard(context) {
  const response = await context.request.get('/api/dashboard');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function clickVersioned(page, context, locator) {
  const before = await dashboard(context);
  const runId = before.activeRun?.id;
  const version = before.activeRun?.version ?? -1;
  await locator.click();
  await expect.poll(async () => {
    const after = await dashboard(context);
    if (!after.activeRun) return true;
    if (after.activeRun.id !== runId) return true;
    return after.activeRun.version > version;
  }, { timeout: 7000 }).toBe(true);
}

async function action(page, context, testId) {
  await clickVersioned(page, context, page.getByTestId(testId));
}

async function skill(page, context, skillId) {
  const button = page.getByTestId(`skill-${skillId}`);
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await clickVersioned(page, context, button);
}

async function reactToIntent(page, context) {
  const state = await dashboard(context);
  expect(state.activeRun?.enemyIntent).toBeTruthy();
  await page.reload();
  if (state.activeRun.enemyIntent.reaction === 'interrupt') await action(page, context, 'stream-interrupt');
  else await action(page, context, 'stream-guard');
}

async function formParty(leader, leaderContext, partner, partnerContext) {
  // Party creation/navigation has dedicated E2E coverage. Build the authenticated shared
  // run through the HTTP boundary here so this mobile-first journey measures combat UX.
  const created = await leaderContext.request.post('/api/party/create');
  expect(created.ok()).toBe(true);
  const createdBody = await created.json();
  const code = createdBody.party?.joinCode;
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  const joined = await partnerContext.request.post('/api/party/join', { data: { joinCode: code } });
  expect(joined.ok()).toBe(true);
  const ready = await partnerContext.request.post('/api/party/ready', { data: { ready: true } });
  expect(ready.ok()).toBe(true);

  await leader.reload();
  await expect(leader.getByTestId('stream-start-dungeon')).toBeVisible();
  await leader.getByTestId('stream-start-dungeon').click();
  await expect.poll(async () => (await dashboard(leaderContext)).activeRun?.id || null, { timeout: 7000 }).not.toBeNull();
  // The standalone-local transport does not receive the API-created party lifecycle
  // notifications on this page connection. Reload once after the run exists so both auth
  // modes begin the actual combat journey from the same persisted authoritative state.
  await leader.reload();
  await partner.reload();
  expect((await dashboard(partnerContext)).activeRun?.id).toBe((await dashboard(leaderContext)).activeRun?.id);
}

test('Focus, cooldowns, reconnect persistence, cross-player combos, and party healing are playable from the thread', async ({ browser }) => {
  test.setTimeout(90000);
  const leaderContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const partnerContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const leader = await leaderContext.newPage();
  const partner = await partnerContext.newPage();

  try {
    await login(leader, 'a');
    await login(partner, 'b');
    const authSource = (await dashboard(leaderContext)).authSource;
    await formParty(leader, leaderContext, partner, partnerContext);

    await expect(leader.getByTestId('combat-skill-panel')).toBeVisible();
    await expect(leader.getByTestId('skill-focus')).toHaveText('Focus 0/4');
    await expect(leader.getByTestId('skill-piercing-stitch')).toBeDisabled();
    await expect(leader.getByTestId('skill-piercing-stitch-state')).toHaveText('Need 2 Focus');
    const skillButtonBox = await leader.getByTestId('skill-piercing-stitch').boundingBox();
    expect(skillButtonBox).not.toBeNull();
    expect(skillButtonBox.height).toBeGreaterThanOrEqual(44);
    expect(await leader.getByTestId('combat-skill-panel').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();

    // First encounter: both players build Focus while still respecting the first telegraph.
    await action(leader, leaderContext, 'stream-attack');
    await partner.reload();
    await action(partner, partnerContext, 'stream-attack');
    await leader.reload();
    await action(leader, leaderContext, 'stream-attack');
    await reactToIntent(partner, partnerContext);
    await action(partner, partnerContext, 'stream-attack');
    await expect.poll(async () => (await dashboard(leaderContext)).activeRun?.encounterIndex, { timeout: 7000 }).toBe(1);

    // Weaver A creates Exposed, then refreshes: status + cooldown must survive reconstruction.
    await leader.reload();
    await expect(leader.getByTestId('skill-focus')).toHaveText('Focus 2/4');
    await skill(leader, leaderContext, 'piercing-stitch');
    await expect(leader.getByTestId('enemy-status-exposed')).toContainText('EXPOSED');
    await expect(leader.getByTestId('skill-piercing-stitch-state')).toHaveText('Cooldown 2');
    await expect(leader.getByTestId('skill-piercing-stitch')).toBeDisabled();
    await reviewShot(leader, `combat-v2-skills-exposed-${authSource}`);
    await leader.reload();
    await expect(leader.getByTestId('enemy-status-exposed')).toContainText('EXPOSED');
    await expect(leader.getByTestId('skill-piercing-stitch-state')).toHaveText('Cooldown 2');

    // Weaver B sees the same setup and cashes it in with a cross-player finisher.
    await partner.reload();
    await expect(partner.getByTestId('enemy-status-exposed')).toContainText('combo ready');
    await expect(partner.getByTestId('skill-severing-knot')).toContainText('COMBO');
    await skill(partner, partnerContext, 'severing-knot');
    await expect.poll(async () => (await dashboard(partnerContext)).activeRun?.encounterIndex, { timeout: 7000 }).toBe(2);
    const comboEntry = partner.getByTestId('stream-system-entry').filter({ hasText: /Severing Knot/ }).last();
    await expect(comboEntry).toContainText(/COMBO Exposed \+4 damage/i);

    // Piercing Stitch's cooldown only advances on Weaver A's own later actions.
    await leader.reload();
    await expect(leader.getByTestId('skill-piercing-stitch-state')).toHaveText('Cooldown 2');
    await action(leader, leaderContext, 'stream-attack');
    await expect(leader.getByTestId('skill-piercing-stitch-state')).toHaveText('Cooldown 1');
    await partner.reload();
    await action(partner, partnerContext, 'stream-attack');
    await leader.reload();
    await action(leader, leaderContext, 'stream-attack');
    await expect(leader.getByTestId('skill-piercing-stitch-state')).toHaveText('2 Focus');
    await expect(leader.getByTestId('skill-piercing-stitch')).toBeEnabled();

    // Finish the third encounter reactively rather than bypassing its telegraph.
    const thirdState = await dashboard(partnerContext);
    if (thirdState.activeRun?.enemyIntent) await reactToIntent(partner, partnerContext);
    else {
      await partner.reload();
      await action(partner, partnerContext, 'stream-attack');
      const maybeIntent = await dashboard(partnerContext);
      if (maybeIntent.activeRun?.phase === 'combat' && maybeIntent.activeRun?.enemyIntent) await reactToIntent(partner, partnerContext);
    }
    if ((await dashboard(partnerContext)).activeRun?.phase === 'combat') {
      await partner.reload();
      await action(partner, partnerContext, 'stream-attack');
    }
    await expect.poll(async () => (await dashboard(leaderContext)).activeRun?.phase, { timeout: 7000 }).toBe('upgrade');

    await leader.reload();
    await leader.getByTestId('stream-suggestions').getByRole('button', { name: 'Sharpen the Thread' }).click();
    await expect.poll(async () => (await dashboard(leaderContext)).activeRun?.phase, { timeout: 7000 }).toBe('boss');

    // Deliberately wound both Weavers, then turn Focus into a party-wide recovery.
    await partner.reload();
    await action(partner, partnerContext, 'stream-guard');
    await leader.reload();
    await action(leader, leaderContext, 'stream-attack');
    const beforeChorus = await dashboard(leaderContext);
    const leaderBefore = beforeChorus.activeRun.participants.find((p) => p.playerId === beforeChorus.activeRun.viewer.playerId);
    const partnerBefore = beforeChorus.activeRun.participants.find((p) => p.playerId !== beforeChorus.activeRun.viewer.playerId);
    expect(leaderBefore.hp).toBeLessThan(leaderBefore.maxHp);
    expect(partnerBefore.hp).toBeLessThan(partnerBefore.maxHp);
    const healingBefore = leaderBefore.healingDone;

    await leader.reload();
    await expect(leader.getByTestId('skill-focus')).toHaveText('Focus 3/4');
    await skill(leader, leaderContext, 'mending-chorus');
    const afterChorus = await dashboard(leaderContext);
    const leaderAfter = afterChorus.activeRun.participants.find((p) => p.playerId === afterChorus.activeRun.viewer.playerId);
    const partnerAfter = afterChorus.activeRun.participants.find((p) => p.playerId !== afterChorus.activeRun.viewer.playerId);
    expect(leaderAfter.healingDone - healingBefore).toBeGreaterThanOrEqual(10);
    expect(partnerAfter.hp).toBeGreaterThan(partnerBefore.hp);
    expect(leaderAfter.hp + partnerAfter.hp).toBeGreaterThan(leaderBefore.hp + partnerBefore.hp);

    const chorusEntry = leader.getByTestId('stream-system-entry').filter({ hasText: /Mending Chorus/ }).last();
    await expect(chorusEntry).toContainText(/restored 10 total party HP/i);
    await expect(leader.getByTestId('skill-focus')).toHaveText('Focus 0/4');
    await expect(leader.getByTestId('skill-mending-chorus-state')).toHaveText('Cooldown 3');
    await reviewShot(leader, `combat-v2-skills-chorus-${authSource}`);

    // Refresh/reconnect must reconstruct the resource and cooldown from persisted run state.
    await leader.reload();
    await expect(leader.getByTestId('combat-skill-panel')).toBeVisible();
    await expect(leader.getByTestId('skill-focus')).toHaveText('Focus 0/4');
    await expect(leader.getByTestId('skill-mending-chorus-state')).toHaveText('Cooldown 3');
  } finally {
    await leaderContext.close();
    await partnerContext.close();
  }
});
