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

async function dungeonBattlePosition(surface) {
  return surface.evaluate((node) => {
    const rect = (element) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { left: box.left, top: box.top, width: box.width, height: box.height };
    };
    const center = (element, arena) => {
      const box = rect(element);
      return box && arena ? { x: box.left + box.width / 2 - arena.left, y: box.top + box.height / 2 - arena.top } : null;
    };
    const arena = rect(node.querySelector('.shared-battle-arena'));
    const relativeRect = (element) => {
      const box = rect(element);
      return box && arena ? { ...box, left: box.left - arena.left, top: box.top - arena.top } : box;
    };
    const ids = [...node.querySelectorAll('.shared-battle-unit')].map((unit) => unit.dataset.combatantId);
    const units = Object.fromEntries(ids.map((id) => {
      const stage = [...node.querySelectorAll('.shared-battle-character-stage')].find((element) => element.dataset.combatantId === id);
      const motion = [...node.querySelectorAll('.shared-battle-character-motion')].find((element) => element.dataset.combatantId === id);
      const unit = [...node.querySelectorAll('.shared-battle-unit')].find((element) => element.dataset.combatantId === id);
      return [id, { stage: relativeRect(stage), motion: relativeRect(motion), unit: relativeRect(unit), stageCenter: center(stage, arena), motionCenter: center(motion, arena), animationName: getComputedStyle(unit).animationName }];
    }));
    return { phase: node.dataset.replayPhase, actorId: node.dataset.currentActorId, targetId: node.dataset.currentTargetId, units };
  });
}

function motionToward(position, actorId, targetId) {
  const actor = position.units[actorId];
  const target = position.units[targetId];
  if (!actor?.stageCenter || !actor?.motionCenter || !target?.stageCenter) return -1;
  const moveX = actor.motionCenter.x - actor.stageCenter.x;
  const moveY = actor.motionCenter.y - actor.stageCenter.y;
  const directionX = target.stageCenter.x - actor.stageCenter.x;
  const directionY = target.stageCenter.y - actor.stageCenter.y;
  return moveX * directionX + moveY * directionY;
}

function rectDistance(first, second) {
  return Math.max(Math.abs(first.left - second.left), Math.abs(first.top - second.top), Math.abs(first.width - second.width), Math.abs(first.height - second.height));
}

test('Dungeon retaliation reverses the artwork direction without moving combatant rows', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('local-login-a').click();
  await page.context().request.post('/api/party/leave');

  await page.route('**/api/stream*', async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    const latestDungeon = [...(payload.entries || [])].reverse().find((entry) => entry.metadata?.battleReplay?.kind === 'simple-dungeon-battle');
    const entries = (payload.entries || []).map((entry) => entry.id === latestDungeon?.id ? { ...entry, createdAt: new Date().toISOString() } : entry);
    await route.fulfill({ response, body: JSON.stringify({ ...payload, entries }) });
  });
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
  const replay = startedPayload.battleReplay;
  const retaliation = replay.beats.find((beat) => Number(beat.retaliation) > 0 && beat.retaliationActorId && beat.retaliationTargetId);
  expect(retaliation).toBeTruthy();

  const surface = page.getByTestId('stream-dungeon-rich-card').last().getByTestId('shared-battle-surface');
  await expect(surface).toBeVisible();
  const firstBeat = replay.beats[0];
  let firstPosition;
  await expect.poll(async () => {
    const position = await dungeonBattlePosition(surface);
    if (position.phase !== 'trajectory' || position.actorId !== firstBeat.actorId || motionToward(position, firstBeat.actorId, firstBeat.targetId) <= 1) return false;
    firstPosition = position;
    return true;
  }, { timeout: 1800, intervals: [50] }).toBe(true);
  expect(firstPosition.units[firstBeat.actorId].animationName).toBe('none');

  await expect.poll(async () => surface.getAttribute('data-replay-moment-index'), { timeout: 2500, intervals: [50] }).toBe('1');
  let retaliationPosition;
  await expect.poll(async () => {
    const position = await dungeonBattlePosition(surface);
    if (position.phase !== 'trajectory' || position.actorId !== retaliation.retaliationActorId || position.targetId !== retaliation.retaliationTargetId || motionToward(position, retaliation.retaliationActorId, retaliation.retaliationTargetId) <= 1) return false;
    retaliationPosition = position;
    return true;
  }, { timeout: 1800, intervals: [50] }).toBe(true);

  expect(retaliationPosition.units[retaliation.retaliationActorId].animationName).toBe('none');
  for (const id of Object.keys(firstPosition.units)) {
    expect(rectDistance(firstPosition.units[id].unit, retaliationPosition.units[id].unit)).toBeLessThan(0.5);
  }
  await page.context().request.post(`/api/runs/${encodeURIComponent(startedPayload.run.id)}/retreat`);
});

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
  await expect(dungeonCard.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete', { timeout: 10000 });
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
  await expect(page.getByTestId('stream-dungeon-rich-card').last().getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete', { timeout: 10000 });

  await page.getByTestId('stream-dungeon-rich-card').last().getByTestId('stream-run-retreat').click();
  await expect.poll(async () => (await dashboard(page.context())).activeRun || null, { timeout: 7000 }).toBeNull();
  await expect(page.getByTestId('stream-dungeon-rich-card').last()).toContainText(/clear reward was not secured|left safely/i);
  await page.screenshot({ path: 'ux-review/react-dungeon-shared-surface-mobile.png', fullPage: true });
});
