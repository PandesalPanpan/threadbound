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
  await page.waitForTimeout(450);
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

async function clickAndWait(page, testId) {
  await page.getByTestId(testId).click();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
}

async function dashboard(context) {
  const response = await context.request.get('/api/dashboard');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function waitUntilPhaseChanges(context, expectedPhase, timeout = 18000) {
  await expect.poll(async () => (await dashboard(context)).activeRun?.phase, { timeout }).not.toBe(expectedPhase);
  return dashboard(context);
}

test('first 60 seconds explain themselves, feel responsive, reveal a reward, and invite another run', async ({ page, context }) => {
  test.setTimeout(60000);
  await loginWithThreaded(page);

  await expect(page.getByTestId('first-run-guide')).toBeVisible();
  await expect(page.getByTestId('first-run-guide')).toContainText('Enter Frayed Hollow');
  await expect(page.getByTestId('start-dungeon')).toHaveText('Enter Frayed Hollow');
  await expect(page.getByTestId('stream-empty')).toBeVisible();
  await reviewShot(page, '01-first-run');

  await clickAndWait(page, 'start-dungeon');
  await expect(page.getByTestId('combat-coach')).toBeVisible();
  await expect(page.getByTestId('combat-coach')).toContainText('Auto Strike');
  await expect(page.getByTestId('combat-coach')).toContainText('Guard');
  await expect(page.getByTestId('stream-combat-dock')).toBeVisible();
  await expect(page.getByTestId('stream-combat-status')).toContainText('Auto Strike ON');
  await expect(page.getByTestId('stream-guard')).toBeVisible();
  await expect(page.getByTestId('auto-attack-status')).toBeHidden();
  await expect(page.getByTestId('attack')).toBeHidden();

  await expect(page.getByTestId('damage-feedback')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('combat-feedback')).toContainText('damage');
  await expect(page.getByTestId('retaliation-feedback')).toHaveCount(1);
  await reviewShot(page, '02-combat-feedback', page.locator('#stream'));

  if (await page.getByTestId('stream-guard').isVisible()) {
    await page.getByTestId('stream-guard').click();
    await expect(page.getByTestId('app-status')).toHaveText('Ready');
    await expect(page.getByTestId('combat-feedback')).toContainText(/Guard|absorbed/i);
  }

  await waitUntilPhaseChanges(context, 'combat');
  await expect(page.getByTestId('run-state')).toContainText('Phase: upgrade');
  await expect(page.getByTestId('upgrade-intro')).toContainText('Choose what the boss fight becomes');
  await expect(page.getByTestId('upgrade-sharpen')).toHaveText('Choose +3 Attack');
  await expect(page.getByTestId('upgrade-reinforce')).toHaveText('Choose +12 HP');
  await expect(page.getByText('+3 attack for every strike this run.')).toBeVisible();
  await expect(page.getByText('Restore 12 HP to every party member before the boss.')).toBeVisible();
  await reviewShot(page, '03-upgrade-choice', page.locator('#dungeon'));

  await clickAndWait(page, 'upgrade-sharpen');
  await expect(page.getByTestId('run-state')).toContainText('Phase: boss');

  await waitUntilPhaseChanges(context, 'boss');
  await expect(page.getByTestId('reward-reveal')).toBeVisible();
  await expect(page.getByTestId('reward-name')).not.toHaveText('');
  await expect(page.getByTestId('reward-equip')).toBeVisible();
  await expect(page.getByTestId('run-again')).toBeVisible();
  await reviewShot(page, '04-reward-reveal', page.locator('#dungeon'));

  const attackBeforeEquip = Number(await page.getByTestId('attack-power').textContent());
  await clickAndWait(page, 'reward-equip');
  const attackAfterEquip = Number(await page.getByTestId('attack-power').textContent());
  expect(attackAfterEquip).toBeGreaterThan(attackBeforeEquip);
  await expect(page.getByTestId('reward-power-gain')).toContainText(`Attack ${attackBeforeEquip}`);
  await expect(page.getByTestId('reward-equip')).toHaveCount(0);
  await reviewShot(page, '05-equipped-reward', page.locator('#dungeon'));

  await clickAndWait(page, 'run-again');
  await expect(page.getByTestId('run-state')).toContainText('Phase: combat');
  await expect(page.getByTestId('reward-reveal')).toHaveCount(0);
  await expect(page.getByTestId('attack-power')).toHaveText(String(attackAfterEquip));
});