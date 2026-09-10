import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

const reviewDir = 'ux-review';

async function reviewShot(page, name, locator = null) {
  mkdirSync(reviewDir, { recursive: true });
  await page.waitForTimeout(250);
  const options = { path: `${reviewDir}/${name}.png` };
  if (locator) await locator.screenshot(options);
  else await page.screenshot(options);
}

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

async function actionAndWait(page, context, testId) {
  const state = await dashboard(context);
  const version = state.activeRun?.version ?? -1;
  const action = page.getByTestId(testId);
  await expect(action).toBeVisible({ timeout:7000 });
  await expect(action).toBeEnabled({ timeout:7000 });
  await action.click();
  await expect.poll(async () => {
    const after = await dashboard(context);
    if (!after.activeRun || after.activeRun.id !== state.activeRun?.id) return true;
    return after.activeRun.version > version;
  }, { timeout:7000 }).toBe(true);
}

async function reactiveTurn(page, context) {
  const state = await dashboard(context);
  const reaction = state.activeRun?.enemyIntent?.reaction;
  if (reaction === 'interrupt') return actionAndWait(page, context, 'stream-interrupt');
  if (reaction === 'guard') return actionAndWait(page, context, 'stream-guard');
  return actionAndWait(page, context, 'stream-attack');
}

async function playUntilPhase(page, context, phase, limit = 120) {
  for (let turn = 0; turn < limit; turn += 1) {
    const state = await dashboard(context);
    if (!state.activeRun) return null;
    if (state.activeRun.phase === phase) return state.activeRun;
    if (!['combat','boss'].includes(state.activeRun.phase)) throw new Error(`Unexpected phase ${state.activeRun.phase}.`);
    await reactiveTurn(page, context);
  }
  throw new Error(`Run did not reach ${phase}.`);
}

test('first run is a shared RPG chat: contextual actions, direct boss, reward, then gear', async ({ page, context }) => {
  test.setTimeout(90000);
  await loginWithThreaded(page);

  await expect(page.getByTestId('stream-thread-local')).toBeVisible({ timeout:7000 });
  await expect(page.getByTestId('stream-start-dungeon')).toContainText('Frayed Hollow');
  await expect(page.locator('.stream-hint')).toContainText('The chat is the game');
  await reviewShot(page, '01-first-run-streamlined');

  await page.getByTestId('stream-start-dungeon').click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.phase, { timeout:7000 }).toBe('combat');
  const started = await dashboard(context);
  expect(started.activeRun.streamlinedLoop).toBe(true);
  expect(started.activeRun.runEventSchedule).toBeNull();
  expect(started.activeRun.runUpgradeOfferIds).toEqual([]);
  expect(started.activeRun.selectedUpgrades).toEqual([]);
  await expect(page.getByTestId('stream-build-summary')).toBeHidden();

  const local = page.getByTestId('stream-thread-local');
  await expect(local.getByTestId('stream-attack')).toBeVisible();
  expect(await local.evaluate((node) => Boolean(node.closest('[data-testid="adventure-stream-log"]')))).toBe(true);

  const beforeIdle = await dashboard(context);
  await page.waitForTimeout(800);
  const afterIdle = await dashboard(context);
  expect(afterIdle.activeRun.enemy.hp).toBe(beforeIdle.activeRun.enemy.hp);
  expect(afterIdle.activeRun.version).toBe(beforeIdle.activeRun.version);

  await actionAndWait(page, context, 'stream-attack');
  const firstResult = page.getByTestId('stream-system-entry').filter({ hasText:/attacked Frayed Wisp/i }).last();
  await expect(firstResult).toBeVisible({ timeout:7000 });
  await reviewShot(page, '02-first-attack-streamlined', page.locator('#stream'));

  const boss = await playUntilPhase(page, context, 'boss');
  expect(boss.enemy.isBoss).toBe(true);
  expect(boss.enemy.name).toBe('The First Needle');
  expect(boss.runAttackBonus).toBe(0);
  expect(boss.runEventHistory).toEqual([]);
  expect(boss.selectedUpgrades).toEqual([]);
  await expect(page.getByTestId('stream-build-summary')).toBeHidden();
  await reviewShot(page, '03-direct-boss', page.locator('#stream'));

  await playUntilPhase(page, context, 'complete');
  await expect.poll(async () => (await dashboard(context)).activeRun, { timeout:7000 }).toBeNull();
  const completed = await dashboard(context);
  expect(completed.inventory.length).toBeGreaterThan(0);
  const rewardName = completed.inventory.at(-1).name;
  expect(rewardName).toBeTruthy();
  await expect(page.getByTestId('stream-system-entry').filter({ hasText:rewardName }).last()).toBeVisible({ timeout:7000 });
  await reviewShot(page, '04-reward-in-thread', page.locator('#stream'));

  await page.getByTestId('stream-message').fill('/gear');
  await page.getByTestId('stream-send').click();
  const gearCard = page.getByTestId('stream-command-card');
  await expect(gearCard).toContainText(rewardName);
  expect(await gearCard.evaluate((node) => node.parentElement?.dataset.testid)).toBe('adventure-stream-log');

  const attackBeforeEquip = completed.character.attackPower;
  await gearCard.getByRole('button', { name:'Equip' }).first().click();
  await expect(gearCard).toContainText('EQUIPPED');
  await expect.poll(async () => (await dashboard(context)).character.attackPower, { timeout:7000 }).toBeGreaterThan(attackBeforeEquip);
  await reviewShot(page, '05-equipped-reward', page.locator('#stream'));
});
