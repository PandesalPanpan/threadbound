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
    await expect.poll(async () => {
      const after = await dashboard(context);
      if (!after.activeRun) return true;
      if (after.activeRun.id !== state.activeRun.id) return true;
      return after.activeRun.version > state.activeRun.version;
    }, { timeout: 5000 }).toBe(true);
  }
  throw new Error(`Run stayed in ${expectedPhase} after ${maxActions} explicit attacks.`);
}

async function choosePower(page, context, shotName) {
  const state = await dashboard(context);
  expect(state.activeRun?.phase).toBe('upgrade');
  expect(state.runUpgrades).toHaveLength(3);
  const cards = page.getByTestId('stream-suggestions').locator('button.run-power-card:not([hidden])');
  await expect(cards).toHaveCount(3);
  for (const card of await cards.all()) {
    await expect(card.locator('.run-power-description')).not.toBeEmpty();
    await expect(card.locator('.run-power-effect').first()).toBeVisible();
  }
  await reviewShot(page, shotName, page.locator('#stream'));
  const expectedPhase = state.activeRun.runUpgradeResume ? 'combat' : 'boss';
  const beforeVersion = state.activeRun.version;
  await cards.first().click();
  await expect.poll(async () => {
    const after = await dashboard(context);
    return after.activeRun?.phase === expectedPhase && after.activeRun.version > beforeVersion;
  }, { timeout: 5000 }).toBe(true);
  return state.runUpgrades[0];
}

async function chooseDiscovery(page, context) {
  const state = await dashboard(context);
  expect(state.activeRun?.phase).toBe('event');
  const event = state.activeRun.runEvent;
  expect(event?.name).toBeTruthy();
  await expect(page.getByTestId('run-state')).toContainText('Phase: event');
  await expect(page.getByTestId('run-event-card')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('run-event-name')).toHaveText(event.name);
  await expect(page.getByTestId('run-event-card')).toContainText(event.prompt);
  const choices = event.choices || [];
  expect(choices).toHaveLength(2);
  for (const choice of choices) {
    const button = page.getByTestId(`run-event-choice-${choice.id}`);
    await expect(button).toBeVisible();
    await expect(button).toContainText(choice.summary);
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.getByTestId('run-event-card').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();
  await reviewShot(page, '04-run-discovery', page.locator('#stream'));

  const safeChoice = choices.find((choice) => /bind|quiet/i.test(choice.id)) || choices[0];
  const beforeVersion = state.activeRun.version;
  await page.getByTestId(`run-event-choice-${safeChoice.id}`).click();
  await expect.poll(async () => {
    const after = await dashboard(context);
    return after.activeRun?.phase === 'combat' && after.activeRun.version > beforeVersion;
  }, { timeout: 5000 }).toBe(true);
  return safeChoice;
}

test('first run explains responsive combat, build drafts, discovery, boss, and permanent reward', async ({ page, context }) => {
  test.setTimeout(80000);
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

  // First encounter pays out a real roguelite build choice rather than waiting until boss.
  await attackUntilPhaseChanges(page, context, 'combat');
  await expect(page.getByTestId('run-state')).toContainText('Phase: upgrade');
  await choosePower(page, context, '03-first-power-draft');

  // The second encounter reaches the durable narrative discovery.
  await attackUntilPhaseChanges(page, context, 'combat');
  await chooseDiscovery(page, context);

  // The third encounter pays out a second, rotated draft before the boss.
  await attackUntilPhaseChanges(page, context, 'combat');
  await expect(page.getByTestId('run-state')).toContainText('Phase: upgrade');
  const finalPower = await choosePower(page, context, '05-final-power-draft');
  await expect(page.getByTestId('run-state')).toContainText('Phase: boss');
  await expect(page.getByTestId('stream-system-entry').filter({ hasText: /First Needle awakens/i }).last()).toBeVisible();
  expect(finalPower.name).toBeTruthy();

  const built = await dashboard(context);
  expect(built.activeRun.selectedUpgrades).toHaveLength(2);
  expect(new Set(built.activeRun.selectedUpgrades).size).toBe(2);

  await attackUntilPhaseChanges(page, context, 'boss');
  await expect(page.getByTestId('reward-reveal')).toBeVisible();
  const rewardName = await page.getByTestId('reward-name').textContent();
  expect(rewardName).toBeTruthy();
  await reviewShot(page, '06-reward-reveal', page.locator('#dungeon'));

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
  await reviewShot(page, '07-equipped-reward', page.locator('#stream'));

  await page.getByTestId('stream-start-dungeon').click();
  await expect(page.getByTestId('run-state')).toContainText('Phase: combat');
  await expect.poll(async () => (await dashboard(context)).character.attackPower).toBe(attackAfterEquip);
});
