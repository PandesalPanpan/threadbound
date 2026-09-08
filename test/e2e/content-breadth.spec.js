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

  await playUntilPhase(page, context, 'upgrade');
  await page.reload();
  await page.getByTestId('stream-suggestions').getByRole('button', { name: 'Reinforce the Weave' }).click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.phase, { timeout: 5000 }).toBe('boss');
  await expect(page.getByTestId('run-state')).toContainText('The Hollow Mirror');

  await playUntilPhase(page, context, 'complete');
  await expect.poll(async () => (await dashboard(context)).activeRun, { timeout: 5000 }).toBeNull();
  await page.reload();
  const after = await dashboard(context);
  expect(after.inventory.length).toBe(inventoryBefore + 1);
  expect(after.character.threadDust).toBe(dustBefore + 15);
  await expect(page.getByTestId('achievement').filter({ hasText: 'No Weaver Left Reflected' })).toBeVisible();
});
