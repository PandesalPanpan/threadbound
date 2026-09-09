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

async function attackUntilPhaseChanges(page, context, expectedPhase, maxActions = 24) {
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
  expect(state.activeRun.runUpgradeResume).toBeNull();
  expect(state.runUpgrades).toHaveLength(3);
  await expect(page.getByTestId('stream-action-mode')).toHaveText('BOSS PREPARATION', { timeout: 5000 });
  const cards = page.getByTestId('stream-suggestions').locator('button.run-power-card:not([hidden])');
  await expect(cards).toHaveCount(3);
  for (const card of await cards.all()) {
    await expect(card.locator('.run-power-description')).not.toBeEmpty();
    await expect(card.locator('.run-power-effect').first()).toBeVisible();
  }
  await reviewShot(page, shotName, page.locator('#stream'));
  const beforeVersion = state.activeRun.version;
  await cards.first().click();
  await expect.poll(async () => {
    const after = await dashboard(context);
    return after.activeRun?.phase === 'boss' && after.activeRun.version > beforeVersion;
  }, { timeout: 5000 }).toBe(true);
  return state.runUpgrades[0];
}

async function chooseDiscovery(page, context) {
  const state = await dashboard(context);
  expect(state.activeRun?.phase).toBe('event');
  const event = state.activeRun.runEvent;
  expect(event?.name).toBeTruthy();
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

test('first run stays chat-simple: baseline attack, contextual reactions, one discovery, one boss-prep power, then reward', async ({ page, context }) => {
  test.setTimeout(80000);
  await loginWithThreaded(page);

  await expect(page.getByTestId('first-run-guide')).toContainText('Each attack is a deliberate turn');
  await expect(page.getByTestId('stream-thread-local')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('stream-start-dungeon')).toContainText('Frayed Hollow');
  await expect(page.locator('.stream-hint')).toContainText('Shared receipts stay in this thread');
  await reviewShot(page, '01-first-run');

  await page.getByTestId('stream-start-dungeon').click();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  await expect(page.getByTestId('combat-coach')).toContainText('Nothing attacks automatically');
  await expect(page.getByTestId('stream-attack')).toBeVisible();
  await expect(page.getByTestId('stream-guard')).toBeHidden();
  await expect(page.getByTestId('stream-interrupt')).toHaveCount(0);
  expect(await page.getByTestId('stream-attack').evaluate((node) => Boolean(node.closest('[data-testid="adventure-stream-log"]')))).toBe(true);

  const beforeIdle = await dashboard(context);
  const enemyHpBeforeIdle = beforeIdle.activeRun.enemy.hp;
  const versionBeforeIdle = beforeIdle.activeRun.version;
  await page.waitForTimeout(1200);
  const afterIdle = await dashboard(context);
  expect(afterIdle.activeRun.enemy.hp).toBe(enemyHpBeforeIdle);
  expect(afterIdle.activeRun.version).toBe(versionBeforeIdle);

  await page.getByTestId('stream-attack').click();
  const firstResult = page.getByTestId('stream-system-entry').filter({ hasText: /attacked Frayed Wisp/i }).last();
  await expect(firstResult).toBeVisible();
  await expect(firstResult).toContainText(/Frayed Wisp \d+\/12/);
  await expect(firstResult).toContainText(/\d+\/40/);
  await reviewShot(page, '02-explicit-attack-result', page.locator('#stream'));

  // Frayed Wisp's heal is interruptible, so Interrupt appears only now; Guard stays out of
  // the primary decision surface because it is not the answer to this telegraph.
  await expect(page.getByTestId('stream-interrupt')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('stream-guard')).toBeHidden();
  await page.getByTestId('stream-interrupt').click();
  await expect(page.getByTestId('stream-system-entry').filter({ hasText: /interrupt/i }).last()).toBeVisible();

  // Encounter one flows straight into encounter two: there is no between-fight power draft.
  await expect.poll(async () => {
    const state = await dashboard(context);
    return state.activeRun?.encounterIndex;
  }, { timeout: 10000 }).toBe(1);
  const secondEncounter = await dashboard(context);
  expect(secondEncounter.activeRun.phase).toBe('combat');
  expect(secondEncounter.activeRun.runUpgradeResume).toBeNull();
  expect(secondEncounter.activeRun.selectedUpgrades).toHaveLength(0);

  await attackUntilPhaseChanges(page, context, 'combat');
  await chooseDiscovery(page, context);

  await attackUntilPhaseChanges(page, context, 'combat');
  const finalPower = await choosePower(page, context, '05-boss-preparation');
  const bossState = await dashboard(context);
  await expect(page.getByTestId('stream-next-enemy').last()).toContainText('The First Needle', { timeout: 5000 });
  await expect(page.getByTestId('stream-next-enemy-hp').last()).toHaveText(`${bossState.activeRun.enemy.maxHp} / ${bossState.activeRun.enemy.maxHp} HP`);
  expect(finalPower.name).toBeTruthy();

  const built = await dashboard(context);
  expect(built.activeRun.selectedUpgrades).toHaveLength(1);

  await attackUntilPhaseChanges(page, context, 'boss');
  const completed = await dashboard(context);
  expect(completed.activeRun).toBeNull();
  expect(completed.inventory.length).toBeGreaterThan(0);
  const rewardName = completed.inventory.at(-1).name;
  expect(rewardName).toBeTruthy();
  const rewardReceipt = page.getByTestId('stream-system-entry').filter({ hasText: rewardName }).last();
  await expect(rewardReceipt).toBeVisible({ timeout: 5000 });
  await expect(rewardReceipt).toContainText(/found/i);
  await reviewShot(page, '06-reward-in-thread', page.locator('#stream'));

  await page.getByTestId('stream-message').fill('/gear');
  await page.getByTestId('stream-send').click();
  const gearCard = page.getByTestId('stream-command-card');
  await expect(gearCard).toContainText(rewardName);
  expect(await gearCard.evaluate((node) => node.parentElement?.dataset.testid)).toBe('adventure-stream-log');
  await expect(gearCard.locator('.thread-gear-list')).toBeVisible();
  await expect(gearCard.locator('img[src="/sprites/relic.svg"]').first()).toBeVisible();
  const attackBeforeEquip = completed.character.attackPower;
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
  await expect.poll(async () => (await dashboard(context)).activeRun?.phase).toBe('combat');
  await expect.poll(async () => (await dashboard(context)).character.attackPower).toBe(attackAfterEquip);
});
