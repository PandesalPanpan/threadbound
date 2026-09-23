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
    const line = node.querySelector('.shared-trajectory__core');
    const units = Object.fromEntries(ids.map((id) => {
      const stage = [...node.querySelectorAll('.shared-battle-character-stage')].find((element) => element.dataset.combatantId === id);
      const motion = [...node.querySelectorAll('.shared-battle-character-motion')].find((element) => element.dataset.combatantId === id);
      const unit = [...node.querySelectorAll('.shared-battle-unit')].find((element) => element.dataset.combatantId === id);
      return [id, { stage: relativeRect(stage), motion: relativeRect(motion), unit: relativeRect(unit), stageCenter: center(stage, arena), motionCenter: center(motion, arena), animationName: getComputedStyle(unit).animationName }];
    }));
    return {
      phase: node.dataset.replayPhase,
      actorId: node.dataset.currentActorId,
      targetId: node.dataset.currentTargetId,
      line: line ? { x1: Number(line.getAttribute('x1')), y1: Number(line.getAttribute('y1')), x2: Number(line.getAttribute('x2')), y2: Number(line.getAttribute('y2')) } : null,
      lineTransform: line ? getComputedStyle(line).transform : null,
      units,
    };
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

test('Multi-enemy replay moves the committed actor and target without moving combatant rows', async ({ page }) => {
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
  const replay = startedPayload.battleReplay;
  const firstEnemyId = replay.enemies[0].combatantId;
  const enemyAction = replay.beats.find((beat) => beat.phase === 'enemy' && beat.actorId !== firstEnemyId && beat.actorCombatantId !== firstEnemyId);
  expect(enemyAction).toBeTruthy();
  expect(replay.enemies.length).toBeGreaterThanOrEqual(2);
  expect(new Set(replay.enemies.map((enemy) => enemy.combatantId)).size).toBe(replay.enemies.length);

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

  const enemyMomentIndex = replay.beats.findIndex((beat) => beat === enemyAction);
  await expect.poll(async () => surface.getAttribute('data-replay-moment-index'), { timeout: 5000, intervals: [50] }).toBe(String(enemyMomentIndex));
  let enemyPosition;
  await expect.poll(async () => {
    const position = await dungeonBattlePosition(surface);
    if (position.phase !== 'trajectory' || position.actorId !== enemyAction.actorId || position.targetId !== enemyAction.targetId || motionToward(position, enemyAction.actorId, enemyAction.targetId) <= 1) return false;
    enemyPosition = position;
    return true;
  }, { timeout: 1800, intervals: [50] }).toBe(true);

  expect(enemyPosition.units[enemyAction.actorId].animationName).toBe('none');
  expect(enemyPosition.line).not.toBeNull();
  expect(Math.abs(enemyPosition.line.x1 - enemyPosition.units[enemyAction.actorId].stageCenter.x)).toBeLessThan(1.5);
  expect(Math.abs(enemyPosition.line.y1 - enemyPosition.units[enemyAction.actorId].stageCenter.y)).toBeLessThan(1.5);
  expect(Math.abs(enemyPosition.line.x2 - enemyPosition.units[enemyAction.targetId].stageCenter.x)).toBeLessThan(1.5);
  expect(Math.abs(enemyPosition.line.y2 - enemyPosition.units[enemyAction.targetId].stageCenter.y)).toBeLessThan(1.5);
  expect(enemyPosition.lineTransform).toBe('none');
  for (const id of Object.keys(firstPosition.units)) {
    expect(rectDistance(firstPosition.units[id].unit, enemyPosition.units[id].unit)).toBeLessThan(0.5);
  }
  await page.context().request.post(`/api/runs/${encodeURIComponent(startedPayload.run.id)}/retreat`);
});

test('Two-Weaver shared Dungeon keeps the same three-mob roster across browsers', async ({ browser }) => {
  const leaderContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const partnerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const leader = await leaderContext.newPage();
  const partner = await partnerContext.newPage();

  try {
    await leader.emulateMedia({ reducedMotion: 'reduce' });
    await partner.emulateMedia({ reducedMotion: 'reduce' });
    await leader.goto('/');
    await partner.goto('/');
    await leader.getByTestId('local-login-c').click();
    await partner.getByTestId('local-login-d').click();
    await leader.goto('/game');
    await partner.goto('/game');
    await leaderContext.request.post('/api/party/leave');
    await partnerContext.request.post('/api/party/leave');

    const created = await leaderContext.request.post('/api/party/create');
    expect(created.ok()).toBe(true);
    const joinCode = (await created.json()).party.joinCode;
    const joined = await partnerContext.request.post('/api/party/join', { data: { joinCode } });
    expect(joined.ok()).toBe(true);
    const ready = await partnerContext.request.post('/api/party/ready', { data: { ready: true } });
    expect(ready.ok()).toBe(true);

    const started = await leaderContext.request.post('/api/dungeons/frayed-hollow/start-shared');
    expect(started.ok()).toBe(true);
    const startedPayload = await started.json();
    expect(startedPayload.run.participants).toHaveLength(2);
    expect(startedPayload.battleReplay.enemies).toHaveLength(2);
    const runId = startedPayload.run.id;

    await leader.reload();
    await partner.reload();
    const firstLeaderCard = leader.getByTestId('stream-dungeon-rich-card').last();
    const firstPartnerCard = partner.getByTestId('stream-dungeon-rich-card').last();
    await expect(firstLeaderCard.getByTestId('shared-battle-enemy')).toHaveCount(2);
    await expect(firstPartnerCard.getByTestId('shared-battle-enemy')).toHaveCount(2);
    const firstIds = await firstLeaderCard.getByTestId('shared-battle-enemy').evaluateAll((nodes) => nodes.map((node) => node.dataset.combatantId));
    const partnerFirstIds = await firstPartnerCard.getByTestId('shared-battle-enemy').evaluateAll((nodes) => nodes.map((node) => node.dataset.combatantId));
    expect(partnerFirstIds).toEqual(firstIds);
    await expect(firstLeaderCard.getByTestId('stream-run-continue')).toBeVisible();

    const firstVersion = (await dashboard(leaderContext)).activeRun.version;
    await firstLeaderCard.getByTestId('stream-run-continue').click();
    await expect.poll(async () => (await dashboard(leaderContext)).activeRun?.version || -1, { timeout: 7000 }).toBeGreaterThan(firstVersion);
    const secondLeaderCard = leader.getByTestId('stream-dungeon-rich-card').last();
    await expect(secondLeaderCard.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete');
    await expect(secondLeaderCard.getByTestId('shared-battle-enemy')).toHaveCount(2);

    const secondVersion = (await dashboard(leaderContext)).activeRun.version;
    await secondLeaderCard.getByTestId('stream-run-continue').click();
    await expect.poll(async () => (await dashboard(leaderContext)).activeRun?.version || -1, { timeout: 7000 }).toBeGreaterThan(secondVersion);
    const thirdLeaderCard = leader.getByTestId('stream-dungeon-rich-card').last();
    await expect(thirdLeaderCard.getByTestId('shared-battle-enemy')).toHaveCount(3);
    await expect(thirdLeaderCard.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete');
    const thirdIds = await thirdLeaderCard.getByTestId('shared-battle-enemy').evaluateAll((nodes) => nodes.map((node) => node.dataset.combatantId));
    expect(new Set(thirdIds).size).toBe(3);

    await partner.reload();
    const thirdPartnerCard = partner.getByTestId('stream-dungeon-rich-card').last();
    await expect(thirdPartnerCard.getByTestId('shared-battle-enemy')).toHaveCount(3);
    const partnerThirdIds = await thirdPartnerCard.getByTestId('shared-battle-enemy').evaluateAll((nodes) => nodes.map((node) => node.dataset.combatantId));
    expect(partnerThirdIds).toEqual(thirdIds);
    await leaderContext.request.post(`/api/runs/${encodeURIComponent(runId)}/retreat`);
  } finally {
    await leaderContext.request.post('/api/party/leave').catch(() => {});
    await partnerContext.request.post('/api/party/leave').catch(() => {});
    await leaderContext.close();
    await partnerContext.close();
  }
});

test('React Dungeon resolves rooms inline and leaves only owner between-room decisions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByTestId('local-login-e').click();
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
  expect(startedPayload.battleReplay.enemies.length).toBeGreaterThanOrEqual(2);
  expect(new Set(startedPayload.battleReplay.enemies.map((enemy) => enemy.combatantId)).size).toBe(startedPayload.battleReplay.enemies.length);

  const dungeonCard = page.getByTestId('stream-dungeon-rich-card').last();
  await expect(dungeonCard).toBeVisible();
  await expect(dungeonCard.getByTestId('shared-battle-enemy')).toHaveCount(startedPayload.battleReplay.enemies.length);
  await expect(dungeonCard.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete', { timeout: 20000 });
  await expect(dungeonCard.getByTestId('stream-run-continue')).toBeVisible();
  await expect(dungeonCard.getByTestId('stream-run-potion')).toBeVisible();
  await expect(dungeonCard.getByTestId('stream-run-retreat')).toBeVisible();
  await expect(page.getByTestId('shell-run-attack')).toHaveCount(0);

  const paused = await waitForPhase(page.context(), 'between_encounter');
  const versionBeforePotion = paused.activeRun.version;
  await dungeonCard.getByTestId('stream-run-potion').click();
  await expect.poll(async () => (await dashboard(page.context())).activeRun?.version || -1, { timeout: 7000 }).toBeGreaterThan(versionBeforePotion);
  const afterPotion = await waitForPhase(page.context(), 'between_encounter');
  expect(afterPotion.activeRun.viewer.hp).toBeGreaterThan(0);
  expect(afterPotion.activeRun.viewer.hp).toBeLessThanOrEqual(afterPotion.activeRun.viewer.maxHp);
  // A Dungeon potion applies its fixed bounded heal before the next automatic
  // room; that room may deal damage immediately after this assertion.
  const potionCard = page.getByTestId('stream-dungeon-rich-card').last();
  await expect(potionCard.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete', { timeout: 20000 });

  const versionBeforeContinue = afterPotion.activeRun.version;
  await potionCard.getByTestId('stream-run-continue').click();
  await expect.poll(async () => (await dashboard(page.context())).activeRun?.version || -1, { timeout: 7000 }).toBeGreaterThan(versionBeforeContinue);
  const afterContinue = await waitForPhase(page.context(), 'between_encounter');
  expect(afterContinue.activeRun.viewer.hp).toBeGreaterThan(0);
  await expect(page.getByTestId('stream-dungeon-rich-card').last().getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete', { timeout: 20000 });

  await page.getByTestId('stream-dungeon-rich-card').last().getByTestId('stream-run-retreat').click();
  await expect.poll(async () => (await dashboard(page.context())).activeRun || null, { timeout: 7000 }).toBeNull();
  await expect(page.getByTestId('stream-dungeon-rich-card').last()).toContainText(/clear reward was not secured|left safely/i);
  await page.screenshot({ path: 'ux-review/react-dungeon-shared-surface-mobile.png', fullPage: true });
});
