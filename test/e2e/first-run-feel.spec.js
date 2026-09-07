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

async function dashboard(context) {
  const response = await context.request.get('/api/dashboard');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function waitUntilPhaseChanges(context, expectedPhase, timeout = 18000) {
  await expect.poll(async () => (await dashboard(context)).activeRun?.phase, { timeout }).not.toBe(expectedPhase);
  return dashboard(context);
}

test('first 60 seconds explain themselves and keep the core loop inside the adventure thread', async ({ page, context }) => {
  test.setTimeout(60000);
  await loginWithThreaded(page);

  await expect(page.getByTestId('first-run-guide')).toBeVisible();
  await expect(page.getByTestId('stream-start-dungeon')).toContainText('Frayed Hollow');
  await reviewShot(page, '01-first-run');

  await page.getByTestId('stream-start-dungeon').click();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  await expect(page.getByTestId('combat-coach')).toContainText('Auto Strike');
  await expect(page.getByTestId('stream-combat-dock')).toBeVisible();
  await expect(page.getByTestId('stream-combat-status')).toContainText('Auto Strike ON');
  const streamGuard = page.locator('[data-testid="stream-guard"]:visible').first();
  await expect(streamGuard).toBeVisible();
  await expect(page.getByTestId('auto-attack-status')).toBeHidden();
  await expect(page.getByTestId('attack')).toBeHidden();

  await expect(page.getByTestId('damage-feedback')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('combat-feedback')).toContainText('damage');
  await reviewShot(page, '02-combat-feedback', page.locator('#stream'));

  await streamGuard.click();
  await expect(page.getByTestId('stream-system-entry').filter({ hasText: /raised Guard/i }).last()).toBeVisible();

  await waitUntilPhaseChanges(context, 'combat');
  await expect(page.getByTestId('run-state')).toContainText('Phase: upgrade');
  const sharpen = page.getByTestId('stream-suggestions').getByRole('button', { name: 'Sharpen the Thread' });
  await expect(sharpen).toBeVisible();
  await reviewShot(page, '03-upgrade-choice', page.locator('#stream'));
  await sharpen.click();
  await expect(page.getByTestId('run-state')).toContainText('Phase: boss');

  await waitUntilPhaseChanges(context, 'boss');
  await expect(page.getByTestId('reward-reveal')).toBeVisible();
  const rewardName = await page.getByTestId('reward-name').textContent();
  expect(rewardName).toBeTruthy();
  await reviewShot(page, '04-reward-reveal', page.locator('#dungeon'));

  // Equipment management happens in a private replaceable /gear reply inside chat.
  await page.getByTestId('stream-message').fill('/gear');
  await page.getByTestId('stream-send').click();
  const gearCard = page.getByTestId('stream-command-card');
  await expect(gearCard).toContainText(rewardName);
  await expect(gearCard.locator('img[src="/sprites/relic.svg"]').first()).toBeVisible();
  const attackBeforeEquip = Number(await page.getByTestId('attack-power').textContent());
  await gearCard.getByRole('button', { name: 'Equip' }).first().click();
  await expect(gearCard).toContainText('EQUIPPED');
  const attackAfterEquip = Number(await page.getByTestId('attack-power').textContent());
  expect(attackAfterEquip).toBeGreaterThan(attackBeforeEquip);
  await reviewShot(page, '05-equipped-reward', page.locator('#stream'));

  // Start the next loop from the same thread rather than returning to a separate dungeon UI.
  await page.getByTestId('stream-start-dungeon').click();
  await expect(page.getByTestId('run-state')).toContainText('Phase: combat');
  await expect(page.getByTestId('attack-power')).toHaveText(String(attackAfterEquip));
});