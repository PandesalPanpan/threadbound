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
    if (run.phase === 'failed') throw new Error('Solo progression setup wiped before earning equipment.');
    if (run.phase === 'event') {
      const choice = run.runEvent?.choices?.find((candidate) => /quiet|bind|safe|mend/i.test(`${candidate.id} ${candidate.name}`)) || run.runEvent?.choices?.[0];
      if (!choice) throw new Error('Run event exposed no choice.');
      await post(page, `/api/runs/${run.id}/upgrade`, { upgradeId: choice.id });
      continue;
    }
    if (run.phase === 'upgrade') {
      const offered = state.runUpgrades || [];
      const power = offered.find((candidate) => String(candidate.category || '').toUpperCase() === 'SUSTAIN') || offered[0];
      if (!power) throw new Error('Run power draft exposed no offered power.');
      await post(page, `/api/runs/${run.id}/upgrade`, { upgradeId: power.id });
      continue;
    }
    if (!['combat', 'boss'].includes(run.phase)) throw new Error(`Unexpected run phase: ${run.phase}`);
    if ((run.viewer?.hp ?? 0) <= 0) throw new Error('Solo player is down.');

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

async function openInventory(page) {
  await page.reload();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  await page.getByTestId('mobile-game-nav').getByText('Inventory', { exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-game-view', 'gear');
  await expect(page.getByTestId('inventory-item').first()).toBeVisible();
}

test('mobile Inventory can Upgrade earned equipment with Gold without tactical attunement choices', async ({ page }) => {
  test.setTimeout(120000);
  let browserDashboardRequests = 0;
  page.on('request', (request) => {
    try {
      if (new URL(request.url()).pathname === '/api/dashboard') browserDashboardRequests += 1;
    } catch {}
  });

  await page.goto('/');
  await page.getByTestId('local-login-a').click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');

  const completed = await clearSoloRun(page);
  expect(completed.activeRun).toBeNull();
  expect(completed.character.gold).toBe(15);
  expect(completed.inventory).toHaveLength(1);

  await openInventory(page);
  const before = await dashboard(page);
  const equipment = before.inventory[0];
  const originalAttack = equipment.attackBonus;
  expect(equipment.progression.level).toBe(0);
  expect(equipment.progression.nextCost).toBe(8);

  const upgrade = page.getByTestId(`upgrade-${equipment.id}`);
  await expect(upgrade).toBeVisible({ timeout: 5000 });
  await expect(upgrade).toContainText('Upgrade 1/');
  await expect(upgrade).toContainText('+1 Attack');
  await expect(upgrade).toContainText('8 Gold');
  const box = await upgrade.boundingBox();
  expect(box?.height || 0).toBeGreaterThanOrEqual(44);
  await expect(page.locator('[data-testid^="temper-"]')).toHaveCount(0);
  await expect(page.getByText(/Bulwark Weave|Disruptor Weave|Executioner Weave|Mender Weave/)).toHaveCount(0);

  // Once the owner UI and equipment enhancer settle, the enhancer must not observe its
  // own chips/actions and continuously refetch the dashboard.
  await page.waitForTimeout(250);
  browserDashboardRequests = 0;
  await page.waitForTimeout(450);
  expect(browserDashboardRequests).toBeLessThanOrEqual(1);

  await upgrade.click();
  await expect.poll(async () => (await dashboard(page)).character.gold, { timeout: 5000 }).toBe(7);
  const after = await dashboard(page);
  const upgraded = after.inventory.find((item) => item.id === equipment.id);
  expect(upgraded.attackBonus).toBe(originalAttack + 1);
  expect(upgraded.effect.upgradeLevel).toBe(1);
  expect(upgraded.effect.attunementCode ?? null).toBeNull();
  expect(upgraded.progression.attunement).toBeNull();

  await openInventory(page);
  const progress = page.getByTestId(`equipment-progress-${equipment.id}`).first();
  await expect(progress).toContainText(upgraded.progression.canUpgrade ? `UPGRADE 1/${upgraded.progression.maxLevel}` : `MAX 1/${upgraded.progression.maxLevel}`);
  await expect(progress).not.toContainText(/Bulwark|Disruptor|Executioner|Mender/);
  await expect(page.getByTestId('thread-dust')).toHaveText('7');
  await expect(page.locator('body')).not.toContainText('Relic pouch');
  await expect(page.locator('body')).not.toContainText(/\bTemper\b/);

  const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(bodyWidth).toBeLessThanOrEqual(390);

  // A run fixes the equipment loadout. Even re-equipping the same owned item through the
  // compatibility route is rejected until that run ends, so another item cannot swap in.
  await post(page, `/api/items/${equipment.id}/equip`);
  await post(page, '/api/dungeons/frayed-hollow/start');
  const blockedEquip = await page.request.post(`/api/items/${equipment.id}/equip`);
  expect(blockedEquip.status()).toBe(409);
  expect((await blockedEquip.json()).error).toBe('item_equip_during_run');
  const locked = await dashboard(page);
  expect(locked.activeRun).not.toBeNull();
  expect(locked.character.equippedItem.id).toBe(equipment.id);
});
