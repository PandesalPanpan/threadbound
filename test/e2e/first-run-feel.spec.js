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
  await page.waitForTimeout(350);
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

async function attackUntilPhaseChanges(page, context, expectedPhase, maxActions = 20) {
  for (let index = 0; index < maxActions; index += 1) {
    const state = await dashboard(context);
    if (state.activeRun?.phase !== expectedPhase) return state;
    const attack = page.getByTestId('stream-attack');
    await expect(attack).toBeVisible();
    await attack.click();
    await expect.poll(async () => (await dashboard(context)).activeRun?.version ?? -1, { timeout: 5000 }).toBeGreaterThan(state.activeRun.version);
  }
  throw new Error(`Run stayed in ${expectedPhase} after ${maxActions} explicit attacks.`);
}

test('first 60 seconds explain a discrete command-result loop inside the adventure thread', async ({ page, context }) => {
  test.setTimeout(70000);
  await loginWithThreaded(page);

  await expect(page.getByTestId('first-run-guide')).toContainText('Each attack is a deliberate turn');
  await expect(page.getByTestId('stream-start-dungeon')).toContainText('Frayed Hollow');
  await expect(page.locator('.stream-hint')).toContainText('result of every action');
  await reviewShot(page, '01-first-run');

  await page.getByTestId('stream-start-dungeon').click();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  await expect(page.getByTestId('combat-coach')).toContainText('Nothing attacks automatically');
  await expect(page.getByTestId('stream-combat-dock')).toBeHidden();
  await expect(page.getByTestId('stream-attack')).toBeVisible();
  await expect(page.getByTestId('stream-guard')).toBeVisible();

  const beforeIdle = await dashboard(context);
  const enemyHpBeforeIdle = beforeIdle.activeRun.enemy.hp;
  const versionBeforeIdle = beforeIdle.activeRun.version;
  await page.waitForTimeout(2400);
  const afterIdle = await dashboard(context);
  expect(afterIdle.activeRun.enemy.hp).toBe(enemyHpBeforeIdle);
  expect(afterIdle.activeRun.version).toBe(versionBeforeIdle);

  await page.getByTestId('stream-attack').click();
  const firstResult = page.getByTestId('stream-system-entry').filter({ hasText: /attacked Frayed Wisp/i }).last();
  await expect(firstResult).toBeVisible();
  await expect(firstResult).toContainText(/Frayed Wisp \d+\/12/);
  await expect(firstResult).toContainText(/\d+\/40/);
  await reviewShot(page, '02-explicit-attack-result', page.locator('#stream'));

  await page.getByTestId('stream-guard').click();
  await expect(page.getByTestId('stream-system-entry').filter({ hasText: /guarded/i }).last()).toBeVisible();

  await attackUntilPhaseChanges(page, context, 'combat');
  await expect(page.getByTestId('run-state')).toContainText('Phase: upgrade');
  const sharpen = page.getByTestId('stream-suggestions').getByRole('button', { name: 'Sharpen the Thread' });
  await expect(sharpen).toBeVisible();
  await reviewShot(page, '03-upgrade-choice', page.locator('#stream'));
  await sharpen.click();
  await expect(page.getByTestId('run-state')).toContainText('Phase: boss');
  await expect(page.getByTestId('stream-system-entry').filter({ hasText: /First Needle awakens/i }).last()).toBeVisible();

  await attackUntilPhaseChanges(page, context, 'boss');
  await expect(page.getByTestId('reward-reveal')).toBeVisible();
  const rewardName = await page.getByTestId('reward-name').textContent();
  expect(rewardName).toBeTruthy();
  await reviewShot(page, '04-reward-reveal', page.locator('#dungeon'));

  await page.getByTestId('stream-message').fill('/gear');
  await page.getByTestId('stream-send').click();
  const gearCard = page.getByTestId('stream-command-card');
  await expect(gearCard).toContainText(rewardName);
  await expect(gearCard.locator('img[src="/sprites/relic.svg"]').first()).toBeVisible();
  const attackBeforeEquip = (await dashboard(context)).character.attackPower;
  await gearCard.getByRole('button', { name: 'Equip' }).first().click();
  await expect(gearCard).toContainText('EQUIPPED');
  await expect.poll(async () => (await dashboard(context)).character.attackPower).toBeGreaterThan(attackBeforeEquip);
  const attackAfterEquip = (await dashboard(context)).character.attackPower;

  await page.getByTestId('stream-message').fill('/status');
  await page.getByTestId('stream-send').click();
  await expect(page.getByTestId('stream-command-card')).toContainText(`ATK ${attackAfterEquip}`);
  await expect(page.getByTestId('stream-command-card')).toContainText(rewardName);
  await reviewShot(page, '05-equipped-reward', page.locator('#stream'));

  await page.getByTestId('stream-start-dungeon').click();
  await expect(page.getByTestId('run-state')).toContainText('Phase: combat');
  await expect.poll(async () => (await dashboard(context)).character.attackPower).toBe(attackAfterEquip);
});
