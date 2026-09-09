import { test, expect } from '@playwright/test';

async function loginWithThreaded(page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Connect with Threaded' }).click();
  await expect(page.getByRole('heading', { name: 'Fake Threaded' })).toBeVisible();
  await page.getByRole('button', { name: 'Authorize Threadbound' }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
}

async function dashboard(context) {
  const response = await context.request.get('/api/dashboard');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function versionedLocatorAction(page, context, locate) {
  const before = await dashboard(context);
  const runId = before.activeRun?.id;
  const version = before.activeRun?.version ?? -1;
  await page.reload();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  const button = locate();
  await expect(button).toBeVisible({ timeout: 5000 });
  await expect(button).toBeEnabled({ timeout: 5000 });
  await button.click();
  await expect.poll(async () => {
    const after = await dashboard(context);
    if (!after.activeRun) return true;
    if (after.activeRun.id !== runId) return true;
    return after.activeRun.version > version;
  }, { timeout: 5000 }).toBe(true);
}

async function versionedAction(page, context, testId) {
  return versionedLocatorAction(page, context, () => page.getByTestId(testId));
}

async function chooseOfferedPower(page, context, { preferCategory = null } = {}) {
  const state = await dashboard(context);
  expect(state.activeRun?.phase).toBe('upgrade');
  expect(state.runUpgrades).toHaveLength(3);
  const chosen = (preferCategory
    ? state.runUpgrades.find((upgrade) => String(upgrade.category || '').toUpperCase() === String(preferCategory).toUpperCase())
    : null) || state.runUpgrades[0];
  expect(chosen?.id).toBeTruthy();
  const expectedPhase = state.activeRun.runUpgradeResume ? 'combat' : 'boss';
  const beforeVersion = state.activeRun.version;

  await page.reload();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  const button = page.getByTestId('stream-suggestions').getByRole('button', { name: chosen.name, exact:true });
  await expect(button).toBeVisible({ timeout: 5000 });
  await button.click();
  await expect.poll(async () => {
    const after = await dashboard(context);
    return after.activeRun?.phase === expectedPhase && after.activeRun.version > beforeVersion;
  }, { timeout: 5000 }).toBe(true);
  return chosen;
}

async function playUntilPhase(page, context, targetPhase, limit = 100) {
  for (let index = 0; index < limit; index += 1) {
    const state = await dashboard(context);
    const run = state.activeRun;
    if (!run) return null;
    if (run.phase === targetPhase) return run;

    if (run.phase === 'event') {
      await page.reload();
      const choices = run.runEvent?.choices || [];
      const recovery = choices.find((choice) => /anchor|break|quiet|bind/i.test(choice.id)) || choices[0];
      expect(recovery?.id).toBeTruthy();
      await page.getByTestId(`run-event-choice-${recovery.id}`).click();
      await expect.poll(async () => (await dashboard(context)).activeRun?.phase, { timeout: 5000 }).toBe('combat');
      continue;
    }

    // Generated dungeons use the same one-milestone build policy as canonical ones. If a
    // caller is waiting for a later phase, consume only the authoritative offered card.
    if (run.phase === 'upgrade') {
      await chooseOfferedPower(page, context);
      continue;
    }

    if (!['combat', 'boss'].includes(run.phase)) throw new Error(`Unexpected phase ${run.phase} while waiting for ${targetPhase}.`);

    if (run.viewer.hp <= 18 && run.viewer.mendCharges > 0 && run.viewer.hp < run.viewer.maxHp) {
      await versionedLocatorAction(page, context, () => page.getByTestId('stream-suggestions').getByRole('button', { name: 'Mend ally' }));
      continue;
    }
    if (run.enemyIntent) {
      await versionedAction(page, context, run.enemyIntent.reaction === 'interrupt' ? 'stream-interrupt' : 'stream-guard');
      continue;
    }
    await versionedAction(page, context, 'stream-attack');
  }
  throw new Error(`Glasswake run did not reach ${targetPhase} within ${limit} explicit actions.`);
}

test('bundled Glasswake dungeon is discoverable and completable through the same adventure thread', async ({ page, context }) => {
  test.setTimeout(90000);
  await loginWithThreaded(page);
  const before = await dashboard(context);
  const inventoryBefore = before.inventory.length;
  const dustBefore = before.character.threadDust;

  const glasswakeOption = page.getByTestId('dungeon-option').filter({ hasText: 'Mirrorfen Descent' });
  await expect(glasswakeOption).toContainText('The Glasswake');
  const runtimeDungeon = before.dungeons.find((dungeon) => dungeon.id === 'mirrorfen-descent');
  expect(runtimeDungeon).toBeTruthy();
  expect(runtimeDungeon.arcTitle).toBe('The Glasswake');
  expect(runtimeDungeon.sourceManifestRevision).toBeTruthy();

  await page.getByTestId('stream-dungeons').click();
  const dungeonCard = page.getByTestId('stream-command-card');
  await expect(dungeonCard).toContainText('Mirrorfen Descent');
  await dungeonCard.getByTestId('stream-enter-mirrorfen-descent').click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.dungeonId || null, { timeout: 5000 }).toBe('mirrorfen-descent');

  const started = await dashboard(context);
  expect(['glass-skulker', 'shard-choir', 'stitch-leech']).toContain(started.activeRun.enemy.id);
  expect(started.activeRun.dungeonDefinition.encounterVariantIndex).toBeGreaterThanOrEqual(0);
  expect(started.activeRun.runEventSchedule?.events?.length).toBe(2);
  expect(started.activeRun.runPowerDraftsEnabled).toBe(false);

  // Normal fights and the generated discovery flow without stat-card interruptions. The
  // only build decision is the authoritative three-card boss preparation milestone.
  await playUntilPhase(page, context, 'upgrade');
  const bossPrep = await dashboard(context);
  expect(bossPrep.activeRun.runUpgradeResume).toBeNull();
  expect(bossPrep.activeRun.selectedUpgrades).toHaveLength(0);
  expect(bossPrep.runUpgrades).toHaveLength(3);
  await expect(page.getByTestId('stream-action-mode')).toHaveText('BOSS PREPARATION', { timeout:5000 });
  const selected = await chooseOfferedPower(page, context, { preferCategory: 'SUSTAIN' });

  const bossState = await dashboard(context);
  expect(bossState.activeRun.phase).toBe('boss');
  expect(bossState.activeRun.selectedUpgrades).toEqual([selected.id]);
  await expect(page.getByTestId('run-state')).toContainText('The Hollow Mirror');

  await playUntilPhase(page, context, 'complete');
  await expect.poll(async () => (await dashboard(context)).activeRun, { timeout: 5000 }).toBeNull();
  await page.reload();
  const after = await dashboard(context);
  expect(after.inventory.length).toBe(inventoryBefore + 1);
  expect(after.character.threadDust).toBe(dustBefore + 15);
  expect(after.achievements.some((achievement) => achievement.name === 'No Weaver Left Reflected')).toBe(true);
});
