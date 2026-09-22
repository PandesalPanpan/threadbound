import { test, expect } from '@playwright/test';

async function dashboard(context) {
  const response = await context.request.get('/api/dashboard');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function waitForPhase(context, phase, timeout = 7000) {
  await expect.poll(async () => (await dashboard(context)).activeRun?.phase || null, { timeout }).toBe(phase);
  return dashboard(context);
}

test('React Dungeon resolves rooms inline and leaves only owner between-room decisions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('local-login-a').click();
  await page.context().request.post('/api/party/leave');
  await page.goto('/game');
  await page.getByTestId('stream-message').fill('dungeon');
  await page.getByTestId('stream-send').click();
  const dungeonChooser = page.getByTestId('shell-dungeon-card');
  await expect(dungeonChooser).toBeVisible();
  const startResponse = page.waitForResponse((response) => response.url().endsWith('/api/dungeons/frayed-hollow/start-shared') && response.request().method() === 'POST');
  await dungeonChooser.getByTestId('dungeon-start-frayed-hollow').click();
  const started = await startResponse;
  expect(started.ok()).toBe(true);
  const startedPayload = await started.json();
  expect(startedPayload.run.phase).toBe('between_encounter');
  expect(startedPayload.battleReplay).toBeDefined();

  const dungeonCard = page.getByTestId('stream-dungeon-rich-card').last();
  await expect(dungeonCard).toBeVisible();
  await expect(dungeonCard.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete');
  await expect(dungeonCard.getByTestId('stream-run-continue')).toBeVisible();
  await expect(dungeonCard.getByTestId('stream-run-potion')).toBeVisible();
  await expect(dungeonCard.getByTestId('stream-run-retreat')).toBeVisible();
  await expect(page.getByTestId('shell-run-attack')).toHaveCount(0);

  const paused = await waitForPhase(page.context(), 'between_encounter');
  const hpBefore = paused.activeRun.viewer.hp;
  const versionBeforePotion = paused.activeRun.version;
  await dungeonCard.getByTestId('stream-run-potion').click();
  await expect.poll(async () => (await dashboard(page.context())).activeRun?.version || -1, { timeout: 7000 }).toBeGreaterThan(versionBeforePotion);
  const afterPotion = await waitForPhase(page.context(), 'between_encounter');
  expect(afterPotion.activeRun.viewer.hp).toBeGreaterThan(0);
  expect(afterPotion.activeRun.viewer.hp).toBeLessThanOrEqual(afterPotion.activeRun.viewer.maxHp);
  expect(afterPotion.activeRun.viewer.hp).toBeLessThanOrEqual(hpBefore + 1);
  await expect(page.getByTestId('stream-dungeon-rich-card').last().getByTestId('shared-battle-surface')).toBeVisible();

  const versionBeforeContinue = afterPotion.activeRun.version;
  await page.getByTestId('stream-dungeon-rich-card').last().getByTestId('stream-run-continue').click();
  await expect.poll(async () => (await dashboard(page.context())).activeRun?.version || -1, { timeout: 7000 }).toBeGreaterThan(versionBeforeContinue);
  const afterContinue = await waitForPhase(page.context(), 'between_encounter');
  expect(afterContinue.activeRun.viewer.hp).toBeGreaterThan(0);
  await expect(page.getByTestId('stream-dungeon-rich-card').last().getByTestId('shared-battle-surface')).toBeVisible();

  await page.getByTestId('stream-dungeon-rich-card').last().getByTestId('stream-run-retreat').click();
  await expect.poll(async () => (await dashboard(page.context())).activeRun || null, { timeout: 7000 }).toBeNull();
  await expect(page.getByTestId('stream-dungeon-rich-card').last()).toContainText(/clear reward was not secured|left safely/i);
  await page.screenshot({ path: 'ux-review/react-dungeon-shared-surface-mobile.png', fullPage: true });
});
