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

async function versionedAction(page, context, testId) {
  const before = await dashboard(context);
  const runId = before.activeRun?.id;
  const version = before.activeRun?.version ?? -1;
  const button = page.getByTestId(testId);
  await expect(button).toBeVisible({ timeout:7000 });
  await expect(button).toBeEnabled({ timeout:7000 });
  await button.click();
  await expect.poll(async () => {
    const after = await dashboard(context);
    if (!after.activeRun || after.activeRun.id !== runId) return true;
    return after.activeRun.version > version;
  }, { timeout:7000 }).toBe(true);
}

async function versionedCommand(page, context, command) {
  const before = await dashboard(context);
  const runId = before.activeRun?.id;
  const version = before.activeRun?.version ?? -1;
  await page.getByTestId('stream-message').fill(command);
  await page.getByTestId('stream-send').click();
  await expect.poll(async () => {
    const after = await dashboard(context);
    if (!after.activeRun || after.activeRun.id !== runId) return true;
    return after.activeRun.version > version;
  }, { timeout:7000 }).toBe(true);
}

async function playUntilPhase(page, context, targetPhase, limit = 120) {
  for (let index = 0; index < limit; index += 1) {
    const state = await dashboard(context);
    const run = state.activeRun;
    if (!run) return targetPhase === 'complete' ? null : null;
    if (run.phase === targetPhase) return run;
    if (!['combat', 'boss'].includes(run.phase)) throw new Error(`Unexpected phase ${run.phase} while waiting for ${targetPhase}.`);

    if (run.enemy.hp <= state.character.attackPower) {
      await versionedAction(page, context, 'stream-attack');
    } else if (!run.enemyIntent && run.viewer.mendCharges > 0 && run.viewer.maxHp - run.viewer.hp >= 10) {
      await versionedCommand(page, context, '/mend');
    } else if (run.enemyIntent) {
      await versionedAction(page, context, run.enemyIntent.reaction === 'interrupt' ? 'stream-interrupt' : 'stream-guard');
    } else {
      await versionedAction(page, context, 'stream-attack');
    }
  }
  throw new Error(`Glasswake run did not reach ${targetPhase} within ${limit} explicit actions.`);
}

test('bundled Glasswake dungeon is discoverable and completable through the same streamlined adventure thread', async ({ page, context }) => {
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

  await page.getByTestId('stream-message').fill('/dungeons');
  await page.getByTestId('stream-send').click();
  const dungeonCard = page.getByTestId('stream-command-card');
  await expect(dungeonCard).toContainText('Mirrorfen Descent');
  await dungeonCard.getByTestId('stream-enter-mirrorfen-descent').click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.dungeonId || null, { timeout:7000 }).toBe('mirrorfen-descent');

  const started = await dashboard(context);
  expect(['glass-skulker', 'shard-choir', 'stitch-leech']).toContain(started.activeRun.enemy.id);
  expect(started.activeRun.dungeonDefinition.encounterVariantIndex).toBeGreaterThanOrEqual(0);
  // Generated content can retain legacy event vocabulary in its manifest, but a new run no
  // longer snapshots or interrupts itself with those random run choices.
  expect(started.activeRun.streamlinedLoop).toBe(true);
  expect(started.activeRun.runEventSchedule).toBeNull();
  expect(started.activeRun.runPowerDraftsEnabled).toBe(false);
  expect(started.activeRun.runUpgradeOfferIds).toEqual([]);
  await expect(page.getByTestId('stream-build-summary')).toBeHidden();

  await playUntilPhase(page, context, 'boss');
  const bossState = await dashboard(context);
  expect(bossState.activeRun.phase).toBe('boss');
  expect(bossState.activeRun.selectedUpgrades).toEqual([]);
  expect(bossState.runUpgrades || []).toEqual([]);
  await expect(page.getByTestId('run-state')).toContainText('The Hollow Mirror');

  await playUntilPhase(page, context, 'complete');
  await expect.poll(async () => (await dashboard(context)).activeRun, { timeout:7000 }).toBeNull();
  await page.reload();
  const after = await dashboard(context);
  expect(after.inventory.length).toBe(inventoryBefore + 1);
  expect(after.character.threadDust).toBe(dustBefore + 15);
  expect(after.achievements.some((achievement) => achievement.name === 'No Weaver Left Reflected')).toBe(true);
});
