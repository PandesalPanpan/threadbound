import { test, expect } from '@playwright/test';

async function dashboard(context) {
  const response = await context.request.get('/api/dashboard');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function command(page, value) {
  const composer = page.getByTestId('stream-message');
  await composer.fill(value);
  await composer.press('Enter');
}

async function waitForPhase(context, phase, timeout = 7000) {
  await expect.poll(async () => (await dashboard(context)).activeRun?.phase || null, { timeout }).toBe(phase);
  return dashboard(context);
}

test('React Dungeon exposes the shared between-room decision state with persistent HP', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('local-login-a').click();
  await page.context().request.post('/api/party/leave');
  const started = await page.context().request.post('/api/dungeons/frayed-hollow/start-simple');
  expect(started.ok()).toBe(true);
  await page.goto('/game');
  await expect(page.getByTestId('stream-player-status')).toBeVisible();

  await command(page, 'dungeon');
  await expect(page.getByTestId('shell-dungeon-card')).toBeVisible();
  await expect(page.getByTestId('shell-run-attack')).toBeVisible();

  for (let step = 0; step < 8; step += 1) {
    const state = await dashboard(page.context());
    if (state.activeRun?.phase === 'between_encounter') break;
    await page.getByTestId('shell-run-attack').click();
    await expect.poll(async () => (await dashboard(page.context())).activeRun?.version || -1, { timeout: 7000 }).toBeGreaterThan(state.activeRun.version);
  }

  const paused = await waitForPhase(page.context(), 'between_encounter');
  const hpBefore = paused.activeRun.viewer.hp;
  await expect(page.getByTestId('shell-dungeon-decision')).toContainText('Nothing heals automatically between encounters');
  await expect(page.getByTestId('shell-run-continue')).toBeVisible();
  await expect(page.getByTestId('shell-run-potion')).toBeVisible();
  await expect(page.getByTestId('shell-run-retreat')).toBeVisible();

  await page.getByTestId('shell-run-potion').click();
  const afterPotion = await waitForPhase(page.context(), 'combat');
  expect(afterPotion.activeRun.viewer.hp).toBeGreaterThan(hpBefore);

  for (let step = 0; step < 8; step += 1) {
    const state = await dashboard(page.context());
    if (state.activeRun?.phase === 'between_encounter') break;
    await page.getByTestId('shell-run-attack').click();
    await expect.poll(async () => (await dashboard(page.context())).activeRun?.version || -1, { timeout: 7000 }).toBeGreaterThan(state.activeRun.version);
  }
  const secondPause = await waitForPhase(page.context(), 'between_encounter');
  const hpBeforeContinue = secondPause.activeRun.viewer.hp;
  await page.getByTestId('shell-run-continue').click();
  const afterContinue = await waitForPhase(page.context(), 'combat');
  expect(afterContinue.activeRun.viewer.hp).toBe(hpBeforeContinue);

  for (let step = 0; step < 8; step += 1) {
    const state = await dashboard(page.context());
    if (state.activeRun?.phase === 'between_encounter') break;
    await page.getByTestId('shell-run-attack').click();
    await expect.poll(async () => (await dashboard(page.context())).activeRun?.version || -1, { timeout: 7000 }).toBeGreaterThan(state.activeRun.version);
  }
  await waitForPhase(page.context(), 'between_encounter');
  await page.getByTestId('shell-run-retreat').click();
  await expect.poll(async () => (await dashboard(page.context())).activeRun || null, { timeout: 7000 }).toBeNull();
  await expect(page.getByTestId('stream-dungeon-rich-card').last()).toContainText(/clear reward was not secured|left safely/i);
  await page.screenshot({ path: 'ux-review/react-dungeon-decision-mobile.png', fullPage: true });
});
