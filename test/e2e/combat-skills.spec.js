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
  if (!state.activeRun?.enemyIntent) return false;
  await page.reload();
  if (state.activeRun.enemyIntent.reaction === 'interrupt') await action(page, context, 'stream-interrupt');
  else await action(page, context, 'stream-guard');
  return true;
}

async function finishCurrentCombatPhase(page, context, limit = 24) {
  for (let turn = 0; turn < limit; turn += 1) {
    const state = await dashboard(context);
    if (state.activeRun?.phase !== 'combat') return state.activeRun?.phase || null;
    if ((state.activeRun.viewer?.hp ?? 0) <= 0) throw new Error('The skills proxy player was downed before the encounter finished.');

    await page.reload();
    if (state.activeRun.enemyIntent) {
      if (state.activeRun.enemyIntent.reaction === 'interrupt') await action(page, context, 'stream-interrupt');
      else await action(page, context, 'stream-guard');
    } else {
      await action(page, context, 'stream-attack');
    }
  }
  throw new Error(`The skills proxy did not leave combat within ${limit} explicit actions.`);
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

async function resolveRunEventIfPresent(leader, leaderContext, partner = null) {
  const state = await dashboard(leaderContext);
  if (state.activeRun?.phase !== 'event') return null;

  await leader.reload();
  await expect(leader.getByTestId('run-event-card')).toBeVisible({ timeout: 7000 });
  await expect(leader.getByTestId('run-event-name')).not.toHaveText('');
  if (partner) {
    await partner.reload();
    await expect(partner.getByTestId('run-event-waiting')).toContainText('Waiting for the party leader', { timeout: 7000 });
  }

  // Keep this skill-focused journey's existing Focus expectations stable by preferring
  // the recovery path, which never grants extra Focus (and clamps a loss at zero).
  const choices = state.activeRun.runEvent?.choices || [];
  const choice = choices.find((candidate) => /bind|quiet/i.test(candidate.id)) || choices[0];
  expect(choice?.id).toBeTruthy();
  await clickVersioned(leader, leaderContext, leader.getByTestId(`run-event-choice-${choice.id}`));
  await expect.poll(async () => (await dashboard(leaderContext)).activeRun?.phase, { timeout: 7000 }).toBe('combat');
  return choice.id;
}

async function chooseRunPowerDraft(leader, leaderContext, { preferMinimalAttack = false } = {}) {
  const state = await dashboard(leaderContext);
  expect(state.activeRun?.phase).toBe('upgrade');
  expect(state.runUpgrades).toHaveLength(3);
  const candidates = [...state.runUpgrades];
  if (preferMinimalAttack) {
    candidates.sort((left, right) => Number(left.attackBonus || 0) - Number(right.attackBonus || 0)
      || Number(right.heal || 0) - Number(left.heal || 0)
      || String(left.id).localeCompare(String(right.id)));
  }
  const chosen = candidates[0];
  expect(chosen?.id).toBeTruthy();
  const expectedPhase = state.activeRun.runUpgradeResume ? 'combat' : 'boss';
  const beforeVersion = state.activeRun.version;

  await leader.reload();
  const button = leader.getByTestId('stream-suggestions').getByRole('button', { name: chosen.name });
  await expect(button).toBeVisible({ timeout: 7000 });
  await button.click();
  await expect.poll(async () => {
    const after = await dashboard(leaderContext);
    return after.activeRun?.phase === expectedPhase && after.activeRun.version > beforeVersion;
  }, { timeout: 7000 }).toBe(true);
  return chosen;
}

async function ensureViewerWounded(page, context, minimumMissingHp = 5) {
  for (let guard = 0; guard < 12; guard += 1) {
    const state = await dashboard(context);
    const viewer = state.activeRun?.viewer;
    if (!viewer || !['combat', 'boss'].includes(state.activeRun.phase)) throw new Error('Cannot prepare party-heal fixture outside combat.');
    if (viewer.hp <= 0) throw new Error('Party-heal fixture downed a Weaver while preparing damage.');
    if (viewer.maxHp - viewer.hp >= minimumMissingHp) return viewer;

    await page.reload();
    if (state.activeRun.enemyIntent?.reaction === 'interrupt') await action(page, context, 'stream-interrupt');
    else await action(page, context, 'stream-guard');
  }
  throw new Error(`Could not wound Weaver by ${minimumMissingHp} HP without leaving combat.`);
}

async function ensureViewerFocus(page, context, minimumFocus = 3) {
  for (let step = 0; step < 8; step += 1) {
    const state = await dashboard(context);
    const viewer = state.activeRun?.viewer;
    if (!viewer || !['combat', 'boss'].includes(state.activeRun.phase)) throw new Error('Cannot build Focus outside combat.');
    if (viewer.hp <= 0) throw new Error('Focus preparation downed the acting Weaver.');
    if (viewer.focus >= minimumFocus) return viewer.focus;

    await page.reload();
    if (state.activeRun.enemyIntent) {
      if (state.activeRun.enemyIntent.reaction === 'interrupt') await action(page, context, 'stream-interrupt');
      else await action(page, context, 'stream-guard');
    } else {
      // A normal attack is the baseline Focus generator and keeps this acceptance journey
      // on the same public thread surface as a real player.
      await action(page, context, 'stream-attack');
    }
  }
  throw new Error(`Could not build ${minimumFocus} Focus without leaving combat.`);
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

    // Build Weaver A's two Focus first without assuming a particular crit roll. Then let
    // Weaver B finish the encounter through whatever telegraphs the authoritative state
    // actually produces. This keeps the journey stable even when a critical shortens the
    // number of damaging actions needed to finish the Wisp.
    await action(leader, leaderContext, 'stream-attack');
    await reactToIntent(leader, leaderContext);
    for (let turn = 0; turn < 12; turn += 1) {
      const state = await dashboard(partnerContext);
      if (state.activeRun?.encounterIndex !== 0 || state.activeRun?.phase !== 'combat') break;
      if (state.activeRun.enemyIntent) await reactToIntent(partner, partnerContext);
      else await action(partner, partnerContext, 'stream-attack');
    }
    await expect.poll(async () => (await dashboard(leaderContext)).activeRun?.encounterIndex, { timeout: 7000 }).toBe(1);

    // Encounter one now pays out a build draft. Choose the lowest-attack offered card so
    // this skill-specific fixture preserves its damage pacing while proving Focus survives
    // the aggregate's draft/reload boundary.
    const firstDraft = await dashboard(leaderContext);
    expect(firstDraft.activeRun.phase).toBe('upgrade');
    expect(firstDraft.activeRun.runUpgradeResume).toBeTruthy();
    await chooseRunPowerDraft(leader, leaderContext, { preferMinimalAttack: true });
    await expect.poll(async () => (await dashboard(leaderContext)).activeRun?.phase, { timeout: 7000 }).toBe('combat');

    // Weaver A creates Exposed, then refreshes: status + cooldown must survive reconstruction.
    await leader.reload();
    const focusBeforePiercing = (await dashboard(leaderContext)).activeRun.viewer.focus;
    expect(focusBeforePiercing).toBeGreaterThanOrEqual(2);
    await expect(leader.getByTestId('skill-piercing-stitch')).toBeEnabled();
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

    // The midpoint discovery is part of the authoritative run lifecycle. Resolve it
    // through the leader UI, prove the partner sees the shared wait state, then continue
    // the cooldown contract from the exact persisted combat state that resumes afterward.
    await resolveRunEventIfPresent(leader, leaderContext, partner);

    // Piercing Stitch's cooldown advances only on Weaver A's later actions. Weaver B uses
    // Guard between those actions so the control action cannot accidentally end the
    // encounter through a critical hit.
    await leader.reload();
    await expect(leader.getByTestId('skill-piercing-stitch-state')).toHaveText('Cooldown 2');
    await action(leader, leaderContext, 'stream-attack');
    let cooldownState = await dashboard(leaderContext);
    expect(cooldownState.activeRun.viewer.skillCooldowns['piercing-stitch']).toBe(1);
    await partner.reload();
    await action(partner, partnerContext, 'stream-guard');
    cooldownState = await dashboard(leaderContext);
    expect(cooldownState.activeRun.viewer.skillCooldowns['piercing-stitch']).toBe(1);
    await leader.reload();
    await action(leader, leaderContext, 'stream-attack');
    cooldownState = await dashboard(leaderContext);
    expect(Number(cooldownState.activeRun.viewer.skillCooldowns['piercing-stitch'] || 0)).toBe(0);
    expect(cooldownState.activeRun.viewer.focus).toBeGreaterThanOrEqual(2);
    if (cooldownState.activeRun.phase === 'combat') {
      await leader.reload();
      await expect(leader.getByTestId('skill-piercing-stitch')).toBeEnabled();
    }

    // Finish the third encounter with the same intent-aware loop a real player follows.
    // Use Weaver B so Weaver A's resource state remains available for the subsequent
    // party-heal assertions instead of being changed just to advance a fixture.
    if ((await dashboard(partnerContext)).activeRun?.phase === 'combat') await finishCurrentCombatPhase(partner, partnerContext);
    await expect.poll(async () => (await dashboard(leaderContext)).activeRun?.phase, { timeout: 7000 }).toBe('upgrade');

    const finalDraft = await dashboard(leaderContext);
    expect(finalDraft.activeRun.runUpgradeResume).toBeNull();
    await chooseRunPowerDraft(leader, leaderContext, { preferMinimalAttack: true });
    await expect.poll(async () => (await dashboard(leaderContext)).activeRun?.phase, { timeout: 7000 }).toBe('boss');

    // Draft healing can enter the boss with either Weaver close to full HP. Prepare a
    // deterministic party-heal fixture through real thread actions: both living Weavers
    // must be missing at least one full Mending Chorus tick and the caster must have its
    // three-Focus cost before the skill is used.
    await ensureViewerWounded(partner, partnerContext, 5);
    await ensureViewerWounded(leader, leaderContext, 5);
    await ensureViewerFocus(leader, leaderContext, 3);
    const beforeChorus = await dashboard(leaderContext);
    const leaderBefore = beforeChorus.activeRun.participants.find((p) => p.playerId === beforeChorus.activeRun.viewer.playerId);
    const partnerBefore = beforeChorus.activeRun.participants.find((p) => p.playerId !== beforeChorus.activeRun.viewer.playerId);
    expect(leaderBefore.maxHp - leaderBefore.hp).toBeGreaterThanOrEqual(5);
    expect(partnerBefore.maxHp - partnerBefore.hp).toBeGreaterThanOrEqual(5);
    expect(beforeChorus.activeRun.viewer.focus).toBeGreaterThanOrEqual(3);
    const focusBeforeChorus = beforeChorus.activeRun.viewer.focus;
    const healingBefore = leaderBefore.healingDone;

    await leader.reload();
    await expect(leader.getByTestId('skill-mending-chorus')).toBeEnabled();
    await skill(leader, leaderContext, 'mending-chorus');
    const afterChorus = await dashboard(leaderContext);
    const leaderAfter = afterChorus.activeRun.participants.find((p) => p.playerId === afterChorus.activeRun.viewer.playerId);
    const partnerAfter = afterChorus.activeRun.participants.find((p) => p.playerId !== afterChorus.activeRun.viewer.playerId);
    expect(leaderAfter.healingDone - healingBefore).toBe(10);
    expect(leaderAfter.hp + partnerAfter.hp).toBeGreaterThan(leaderBefore.hp + partnerBefore.hp);

    const chorusEntry = leader.getByTestId('stream-system-entry').filter({ hasText: /Mending Chorus/ }).last();
    await expect(chorusEntry).toContainText(/restored 10 total party HP/i);
    const focusAfterChorus = focusBeforeChorus - 3;
    await expect(leader.getByTestId('skill-focus')).toHaveText(`Focus ${focusAfterChorus}/4`);
    await expect(leader.getByTestId('skill-mending-chorus-state')).toHaveText('Cooldown 3');
    await reviewShot(leader, `combat-v2-skills-chorus-${authSource}`);

    // Refresh/reconnect must reconstruct the exact resource and cooldown persisted by the
    // aggregate rather than relying on a hard-coded pre-draft Focus value.
    await leader.reload();
    await expect(leader.getByTestId('combat-skill-panel')).toBeVisible();
    await expect(leader.getByTestId('skill-focus')).toHaveText(`Focus ${focusAfterChorus}/4`);
    await expect(leader.getByTestId('skill-mending-chorus-state')).toHaveText('Cooldown 3');
  } finally {
    await leaderContext.close();
    await partnerContext.close();
  }
});
