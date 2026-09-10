import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const REVIEW_DIR = 'ux-review';

async function login(page) {
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

async function screenshot(page, name) {
  mkdirSync(REVIEW_DIR, { recursive: true });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${REVIEW_DIR}/${name}.png`, fullPage: true });
}

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('new player loop is Hunt -> permanent gear -> hard attack-only dungeon', async ({ page, context }) => {
  await login(page);

  await expect(page.getByTestId('stream-hunt')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('stream-start-dungeon')).toBeVisible();
  await expect(page.getByTestId('stream-inventory')).toBeVisible();
  await expect(page.getByTestId('stream-guard')).toHaveCount(0);
  await expect(page.getByTestId('stream-interrupt')).toHaveCount(0);
  await expect(page.getByTestId('combat-skill-panel')).toHaveCount(0);
  await expect(page.getByTestId('stream-message')).toHaveAttribute('placeholder', 'Message party or /hunt…');

  const initial = await dashboard(context);
  expect(initial.character.attackPower).toBe(6);
  expect(initial.simpleLoop.dungeonReadiness[0].recommendedAttack).toBe(9);
  await expect(page.getByTestId('stream-start-dungeon')).toContainText('6/9');

  await page.getByTestId('stream-hunt').click();
  const huntReceipt = page.getByTestId('stream-system-entry').filter({ hasText: /found and killed/i }).last();
  await expect(huntReceipt).toBeVisible({ timeout: 5000 });
  await expect(huntReceipt).toContainText('Thread Dust');
  await expect(huntReceipt).toContainText(/remaining HP is \d+\/40/);
  const afterHunt = await dashboard(context);
  expect(afterHunt.character.threadDust).toBeGreaterThan(0);
  await screenshot(page, 'simple-loop-hunt');

  await page.getByTestId('stream-start-dungeon').click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.simpleCombat || false, { timeout: 5000 }).toBe(true);
  const run = await dashboard(context);
  expect(run.activeRun.enemy.maxHp).toBe(24);
  expect(run.runUpgrades).toEqual([]);
  expect(run.combatSkills).toEqual([]);
  expect(run.actionPreviews).toBeNull();
  expect(run.activeRun.enemyIntent).toBeNull();

  await expect(page.getByTestId('stream-attack')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('stream-hunt')).toHaveCount(0);
  await expect(page.getByTestId('stream-message')).toHaveAttribute('placeholder', 'Message party or /attack…');
  await expect(page.getByText('no temporary combat buffs')).toBeVisible();

  const hpBefore = run.activeRun.enemy.hp;
  await page.getByTestId('stream-attack').click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.enemy?.hp ?? -1, { timeout: 5000 }).not.toBe(hpBefore);
  const afterAttack = await dashboard(context);
  expect(afterAttack.activeRun.enemyIntent).toBeNull();
  expect(afterAttack.activeRun.viewer.focus).toBe(0);
  expect(afterAttack.activeRun.selectedUpgrades).toEqual([]);

  await page.getByTestId('stream-message').fill('/guard');
  await page.getByTestId('stream-send').click();
  await expect(page.getByTestId('stream-error')).toContainText('uses /attack only');
  await screenshot(page, 'simple-loop-dungeon');
});

test('inventory and wiki Codex stay one tap away from the simple loop', async ({ page }) => {
  await login(page);

  await page.getByTestId('stream-inventory').click();
  await expect(page.locator('body')).toHaveAttribute('data-game-view', 'gear');
  await expect(page.locator('#inventory')).toBeVisible();

  await page.getByTestId('mobile-game-nav').getByText('Codex', { exact: true }).click();
  await expect(page).toHaveURL(/\/codex$/);
  await expect(page.getByTestId('codex-search')).toBeVisible();
  await expect(page.getByTestId('codex-detail')).toBeVisible();
  await expect(page.locator('.wiki-breadcrumbs')).toBeVisible();
  await expect(page.locator('.wiki-infobox')).toBeVisible();
  await screenshot(page, 'simple-loop-codex');
});
