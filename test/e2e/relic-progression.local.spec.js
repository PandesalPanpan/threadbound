import { test, expect } from '@playwright/test';

async function dashboard(page) {
  const response = await page.request.get('/api/dashboard');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function post(page, path, data = undefined) {
  const response = await page.request.post(path, data === undefined ? undefined : { data });
  if (!response.ok()) throw new Error(`${path} failed (${response.status()}): ${await response.text()}`);
  return response.json();
}

async function clearSoloRun(page) {
  await post(page, '/api/dungeons/frayed-hollow/start');
  for (let step = 0; step < 120; step += 1) {
    const state = await dashboard(page);
    const run = state.activeRun;
    if (!run) return state;
    if (run.phase === 'failed') throw new Error('Solo progression setup wiped before earning a relic.');
    if (run.phase === 'event') {
      const choice = run.runEvent?.choices?.find((candidate) => /quiet|bind|safe|mend/i.test(`${candidate.id} ${candidate.name}`)) || run.runEvent?.choices?.[0];
      if (!choice) throw new Error('Run event exposed no choice.');
      await post(page, `/api/runs/${run.id}/upgrade`, { upgradeId: choice.id });
      continue;
    }
    if (run.phase === 'upgrade') {
      await post(page, `/api/runs/${run.id}/upgrade`, { upgradeId: 'reinforce' });
      continue;
    }
    if (!['combat', 'boss'].includes(run.phase)) throw new Error(`Unexpected run phase: ${run.phase}`);
    if ((run.viewer?.hp ?? 0) <= 0) throw new Error('Solo Weaver is down.');

    if (run.enemyIntent) {
      if (run.enemyIntent.reaction === 'interrupt') await post(page, `/api/runs/${run.id}/interrupt`);
      else await post(page, `/api/runs/${run.id}/guard`);
      continue;
    }
    if (run.viewer.hp <= 18 && run.viewer.mendCharges > 0) {
      await post(page, `/api/runs/${run.id}/mend`, { targetPlayerId: run.viewer.playerId });
      continue;
    }
    await post(page, `/api/runs/${run.id}/attack`);
  }
  throw new Error('Solo run did not finish within the action guard.');
}

async function openGear(page) {
  await page.reload();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  await page.getByTestId('mobile-game-nav').getByText('Gear', { exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-game-view', 'gear');
  await expect(page.getByTestId('inventory-item').first()).toBeVisible();
}

test('mobile Gear can permanently attune and Temper an earned relic with Thread Dust', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  await page.getByTestId('local-login-a').click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');

  const completed = await clearSoloRun(page);
  expect(completed.activeRun).toBeNull();
  expect(completed.character.threadDust).toBe(15);
  expect(completed.inventory).toHaveLength(1);

  await openGear(page);
  const before = await dashboard(page);
  const relic = before.inventory[0];
  const originalAttack = relic.attackBonus;
  expect(relic.progression.level).toBe(0);
  expect(relic.progression.nextCost).toBe(8);

  const bulwark = page.getByTestId(`temper-${relic.id}-bulwark`);
  await expect(bulwark).toBeVisible({ timeout: 5000 });
  await expect(bulwark).toContainText('Bulwark Weave');
  const box = await bulwark.boundingBox();
  expect(box?.height || 0).toBeGreaterThanOrEqual(44);
  await expect(page.getByTestId(`temper-${relic.id}-disruptor`)).toBeVisible();
  await expect(page.getByTestId(`temper-${relic.id}-executioner`)).toBeVisible();
  await expect(page.getByTestId(`temper-${relic.id}-mender`)).toBeVisible();

  await bulwark.click();
  await expect.poll(async () => (await dashboard(page)).character.threadDust, { timeout: 5000 }).toBe(7);
  const after = await dashboard(page);
  const upgraded = after.inventory.find((item) => item.id === relic.id);
  expect(upgraded.attackBonus).toBe(originalAttack + 1);
  expect(upgraded.effect.upgradeLevel).toBe(1);
  expect(upgraded.effect.attunementCode).toBe('bulwark');
  expect(upgraded.progression.attunement.name).toBe('Bulwark Weave');

  await openGear(page);
  const progress = page.getByTestId(`relic-progress-${relic.id}`).first();
  await expect(progress).toContainText(upgraded.progression.canUpgrade ? `TEMPER 1/${upgraded.progression.maxLevel}` : `MASTERWORK 1/${upgraded.progression.maxLevel}`);
  await expect(progress).toContainText('Bulwark Weave');
  await expect(page.getByTestId('thread-dust')).toHaveText('7');

  const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(bodyWidth).toBeLessThanOrEqual(390);
});
