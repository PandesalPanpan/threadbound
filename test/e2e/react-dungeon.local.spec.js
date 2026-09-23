import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { replayMoments } from '../../frontend/src/battle/sharedReplay.js';

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

  const enemyActorId = enemyAction.actorCombatantId || enemyAction.actorId;
  const enemyTargetId = enemyAction.targetCombatantId || enemyAction.targetId;
  const enemyMomentIndex = replayMoments(replay).findIndex((moment) => moment.beatIndex === enemyAction.index
    && moment.actorId === enemyActorId && moment.targetId === enemyTargetId);
  expect(enemyMomentIndex).toBeGreaterThanOrEqual(0);
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

test('Two-player shared Dungeon keeps its multi-enemy replay across mobile and desktop', async ({ browser }) => {
  test.setTimeout(90_000);
  const leaderContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const partnerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const leader = await leaderContext.newPage();
  const partner = await partnerContext.newPage();
  let runId = null;

  try {
    await leader.goto('/');
    await partner.goto('/');
    await leader.getByTestId('local-login-c').click();
    await partner.getByTestId('local-login-d').click();
    await leader.goto('/game');
    await partner.goto('/game');
    await leaderContext.request.post('/api/party/leave');
    await partnerContext.request.post('/api/party/leave');

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const partnerState = await dashboard(partnerContext);
      if (partnerState.character.currentHealth < partnerState.character.maxHealth && partnerState.character.healthPotions > 0) break;
      const hunt = await partnerContext.request.post('/api/hunt');
      expect(hunt.ok()).toBe(true);
    }
    const healEligiblePartner = await dashboard(partnerContext);
    expect(healEligiblePartner.character.currentHealth).toBeLessThan(healEligiblePartner.character.maxHealth);
    expect(healEligiblePartner.character.healthPotions).toBeGreaterThan(0);

    const created = await leaderContext.request.post('/api/party/create');
    expect(created.ok()).toBe(true);
    const joinCode = (await created.json()).party.joinCode;
    const joined = await partnerContext.request.post('/api/party/join', { data: { joinCode } });
    expect(joined.ok()).toBe(true);
    const ready = await partnerContext.request.post('/api/party/ready', { data: { ready: true } });
    expect(ready.ok()).toBe(true);

    await leader.reload();
    await partner.reload();
    const composer = leader.getByTestId('stream-message');
    await composer.fill('dungeon');
    await composer.press('Enter');
    const dungeonChooser = leader.getByTestId('shell-dungeon-card');
    await expect(dungeonChooser).toBeVisible();
    const startResponse = leader.waitForResponse((response) => response.url().endsWith('/api/dungeons/frayed-hollow/start-shared') && response.request().method() === 'POST');
    await dungeonChooser.getByTestId('dungeon-start-frayed-hollow').click();
    const started = await startResponse;
    expect(started.ok()).toBe(true);
    const startedPayload = await started.json();
    expect(startedPayload.run.participants).toHaveLength(2);
    expect(startedPayload.battleReplay.enemies).toHaveLength(2);
    expect(startedPayload.battleReplay.actions.some((action) => action.actionType === 'skill' && action.manaBefore === 100 && action.manaAfter === 0)).toBe(true);
    runId = startedPayload.run.id;

    const firstLeaderCard = leader.getByTestId('stream-dungeon-rich-card').last();
    const firstPartnerCard = partner.getByTestId('stream-dungeon-rich-card').last();
    const firstLeaderSurface = firstLeaderCard.getByTestId('shared-battle-surface');
    const firstPartnerSurface = firstPartnerCard.getByTestId('shared-battle-surface');
    await expect(firstLeaderSurface).toHaveAttribute('data-replay-state', 'playing', { timeout: 7000 });
    await expect(firstPartnerSurface).toHaveAttribute('data-replay-state', 'playing', { timeout: 7000 });
    await expect(firstLeaderCard.getByTestId('stream-run-continue')).toHaveCount(0);
    await expect(firstLeaderCard.getByTestId('stream-run-potion')).toHaveCount(0);
    await expect(firstPartnerCard.getByTestId('stream-run-potion')).toHaveCount(0);
    await expect(leader.getByTestId('shell-dungeon-card')).toHaveCount(0);
    await expect(firstLeaderCard.getByTestId('shared-battle-enemy')).toHaveCount(2);
    await expect(firstPartnerCard.getByTestId('shared-battle-enemy')).toHaveCount(2);
    const firstIds = await firstLeaderCard.getByTestId('shared-battle-enemy').evaluateAll((nodes) => nodes.map((node) => node.dataset.combatantId));
    const partnerFirstIds = await firstPartnerCard.getByTestId('shared-battle-enemy').evaluateAll((nodes) => nodes.map((node) => node.dataset.combatantId));
    expect(partnerFirstIds).toEqual(firstIds);
    await expect(firstLeaderSurface).toHaveAttribute('data-replay-state', 'complete', { timeout: 20000 });
    await expect(firstPartnerSurface).toHaveAttribute('data-replay-state', 'complete', { timeout: 20000 });
    await expect(firstLeaderCard.getByTestId('stream-run-continue')).toBeVisible();
    await expect(firstLeaderCard.getByTestId('stream-run-potion')).toBeVisible();
    await leader.emulateMedia({ reducedMotion: 'reduce' });
    await partner.emulateMedia({ reducedMotion: 'reduce' });
    await expect(firstPartnerCard.getByTestId('stream-run-continue')).toHaveCount(0);
    await expect(firstPartnerCard.getByTestId('stream-run-potion')).toBeVisible();
    await expect(firstPartnerCard.getByTestId('intermission-heal-status')).toBeVisible();

    const firstIntermission = (await dashboard(leaderContext)).activeRun;
    expect(firstIntermission.intermissionPotionClaimedWindowId).toBeFalsy();
    const partnerHeal = firstPartnerCard.getByTestId('stream-run-potion');
    await expect(partnerHeal).toBeEnabled({ timeout: 7000 });
    const claimantContext = partnerContext;
    const claimantCard = firstPartnerCard;
    const claimantId = (await dashboard(claimantContext)).character.id;
    expect(claimantId).not.toBe((await dashboard(leaderContext)).character.id);
    await claimantCard.getByTestId('stream-run-potion').click();
    await expect.poll(async () => (await dashboard(claimantContext)).activeRun?.intermissionPotionClaimedByPlayerId || null, { timeout: 7000 }).toBe(claimantId);
    const claimed = (await dashboard(claimantContext)).activeRun;
    expect(claimed.phase).toBe('between_encounter');
    expect(claimed.intermissionPotionClaimedWindowId).toBeTruthy();
    expect(claimed.intermissionPotionClaimedByPlayerId).toBe(claimantId);
    const losingHeal = await leaderContext.request.post(`/api/runs/${encodeURIComponent(runId)}/potion`);
    expect(losingHeal.status()).toBe(409);
    expect(await losingHeal.json()).toMatchObject({ error: 'dungeon_potion_intermission_already_claimed' });
    await leader.reload();
    await partner.reload();
    const reloadedLeaderRun = (await dashboard(leaderContext)).activeRun;
    const reloadedPartnerRun = (await dashboard(partnerContext)).activeRun;
    expect(reloadedLeaderRun?.id).toBe(runId);
    expect(reloadedPartnerRun?.id).toBe(runId);
    expect(reloadedLeaderRun?.intermissionPotionClaimedWindowId).toBe(claimed.intermissionPotionClaimedWindowId);
    expect(reloadedPartnerRun?.intermissionPotionClaimedByPlayerId).toBe(claimantId);
    expect(reloadedLeaderRun?.isLeader).toBe(true);
    expect(reloadedPartnerRun?.isLeader).toBe(false);
    const leaderStream = await (await leaderContext.request.get('/api/stream')).json();
    const replayEntry = leaderStream.entries.find((entry) => entry.eventType === 'CombatActionResolved' && entry.runId === runId);
    expect(replayEntry?.metadata?.battleReplay?.status).toBe('room_clear');
    const claimedLeaderCard = leader.getByTestId('stream-dungeon-rich-card').last();
    const claimedPartnerCard = partner.getByTestId('stream-dungeon-rich-card').last();
    const firstLeaderReplay = leader.getByTestId('stream-dungeon-rich-card').filter({ has: leader.getByTestId('shared-battle-surface') }).last();
    const firstPartnerReplay = partner.getByTestId('stream-dungeon-rich-card').filter({ has: partner.getByTestId('shared-battle-surface') }).last();
    await expect(firstLeaderReplay.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete', { timeout: 20000 });
    await expect(firstPartnerReplay.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete', { timeout: 20000 });
    const claimedParticipant = claimed.participants.find((participant) => participant.playerId === claimantId);
    const participantBeforeClaim = firstIntermission.participants.find((participant) => participant.playerId === claimantId);
    const healed = claimedParticipant.hp - participantBeforeClaim.hp;
    expect(healed).toBeGreaterThan(0);
    await expect(claimedLeaderCard.getByTestId('dungeon-potion-receipt')).toContainText(`${claimedParticipant.displayName} used`);
    await expect(claimedLeaderCard.getByTestId('dungeon-potion-receipt')).toContainText(`+${healed} HP`);
    await expect(claimedPartnerCard.getByTestId('dungeon-potion-receipt')).toContainText(`${claimedParticipant.displayName} used`);
    await expect(claimedPartnerCard.getByTestId('dungeon-potion-receipt')).toContainText(`+${healed} HP`);
    await expect(claimedLeaderCard.getByTestId('intermission-heal-status')).toContainText('Shared intermission Heal used');
    await expect(claimedPartnerCard.getByTestId('intermission-heal-status')).toContainText('Shared intermission Heal used');
    const claimantName = claimedParticipant?.displayName;
    expect(claimantName).toBeTruthy();
    await expect(claimedLeaderCard.getByTestId('intermission-heal-status')).toContainText(claimantName);
    await expect(claimedPartnerCard.getByTestId('intermission-heal-status')).toContainText(claimantName);
    await expect(claimedLeaderCard.getByTestId('stream-run-potion')).toBeDisabled();
    await expect(claimedPartnerCard.getByTestId('stream-run-potion')).toBeDisabled();
    await expect(claimedLeaderCard.getByTestId('stream-run-continue')).toBeVisible();
    await expect(claimedLeaderCard.getByTestId('stream-run-retreat')).toBeVisible();
    await expect(claimedPartnerCard.getByTestId('stream-run-continue')).toHaveCount(0);
    await expect(claimedPartnerCard.getByTestId('stream-run-retreat')).toHaveCount(0);

    const firstVersion = claimed.version;
    await claimedLeaderCard.getByTestId('stream-run-continue').click();
    await expect.poll(async () => (await dashboard(leaderContext)).activeRun?.version || -1, { timeout: 7000 }).toBeGreaterThan(firstVersion);
    await expect.poll(async () => (await dashboard(leaderContext)).activeRun?.intermissionPotionClaimedWindowId || null, { timeout: 7000 }).toBeNull();
    const secondLeaderCard = leader.getByTestId('stream-dungeon-rich-card').last();
    await expect(secondLeaderCard.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete');
    await expect(secondLeaderCard.getByTestId('shared-battle-enemy')).toHaveCount(2);

    const secondVersion = (await dashboard(leaderContext)).activeRun.version;
    await secondLeaderCard.getByTestId('stream-run-continue').click();
    await expect.poll(async () => (await dashboard(leaderContext)).activeRun?.version || -1, { timeout: 7000 }).toBeGreaterThan(secondVersion);
    const thirdLeaderCard = leader.getByTestId('stream-dungeon-rich-card').last();
    const thirdLeaderSurface = thirdLeaderCard.getByTestId('shared-battle-surface');
    await expect(thirdLeaderSurface).toHaveAttribute('data-replay-state', 'complete', { timeout: 30000 });
    await expect(thirdLeaderCard.getByTestId('shared-battle-enemy')).toHaveCount(3);
    await leader.setViewportSize({ width: 1440, height: 960 });
    await thirdLeaderCard.scrollIntoViewIfNeeded();
    await expect(thirdLeaderCard.locator('[data-testid^="shared-battle-player"]')).toHaveCount(2);
    await expect(thirdLeaderCard.locator('[data-testid^="shared-battle-mana-"]')).toHaveCount(2);
    await expect(leader.getByTestId('shell-dungeon-card')).toHaveCount(0);
    expect(await leader.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
    expect(await thirdLeaderCard.evaluate((card) => card.scrollWidth - card.clientWidth)).toBeLessThanOrEqual(1);
    mkdirSync('ux-review', { recursive: true });
    await leader.screenshot({ path: 'ux-review/react-dungeon-replay-desktop.png' });
    await leader.setViewportSize({ width: 390, height: 844 });
    await thirdLeaderCard.scrollIntoViewIfNeeded();
    expect(await leader.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect(await thirdLeaderCard.evaluate((card) => card.scrollWidth - card.clientWidth)).toBeLessThanOrEqual(1);
    const thirdIds = await thirdLeaderCard.getByTestId('shared-battle-enemy').evaluateAll((nodes) => nodes.map((node) => node.dataset.combatantId));
    expect(new Set(thirdIds).size).toBe(3);
    await leader.screenshot({ path: 'ux-review/react-dungeon-replay-mobile.png' });

    await partner.reload();
    const thirdPartnerCard = partner.getByTestId('stream-dungeon-rich-card').last();
    await expect(thirdPartnerCard.getByTestId('shared-battle-enemy')).toHaveCount(3);
    const partnerThirdIds = await thirdPartnerCard.getByTestId('shared-battle-enemy').evaluateAll((nodes) => nodes.map((node) => node.dataset.combatantId));
    expect(partnerThirdIds).toEqual(thirdIds);
  } finally {
    if (runId) await leaderContext.request.post(`/api/runs/${encodeURIComponent(runId)}/retreat`).catch(() => {});
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
  await expect(dungeonCard.getByTestId('stream-run-potion')).toBeEnabled({ timeout: 7000 });
  await expect(dungeonCard.getByTestId('intermission-heal-status')).toContainText('One shared intermission Heal available');
  await expect(dungeonCard.getByTestId('stream-run-retreat')).toBeVisible();
  await expect(page.getByTestId('shell-run-attack')).toHaveCount(0);

  const paused = await waitForPhase(page.context(), 'between_encounter');
  expect(paused.activeRun.intermissionPotionClaimedWindowId).toBeFalsy();
  const versionBeforePotion = paused.activeRun.version;
  await dungeonCard.getByTestId('stream-run-potion').click();
  await expect.poll(async () => (await dashboard(page.context())).activeRun?.version || -1, { timeout: 7000 }).toBeGreaterThan(versionBeforePotion);
  const afterPotion = await waitForPhase(page.context(), 'between_encounter');
  expect(afterPotion.activeRun.viewer.hp).toBeGreaterThan(0);
  expect(afterPotion.activeRun.viewer.hp).toBeLessThanOrEqual(afterPotion.activeRun.viewer.maxHp);
  expect(afterPotion.activeRun.intermissionPotionClaimedWindowId).toBeTruthy();
  expect(afterPotion.activeRun.intermissionPotionClaimedByPlayerId).toBe(afterPotion.character.id);
  expect(afterPotion.activeRun.phase).toBe('between_encounter');
  const versionAfterPotion = afterPotion.activeRun.version;
  const potionCard = page.getByTestId('stream-dungeon-rich-card').last();
  await expect(potionCard.getByTestId('intermission-heal-status')).toContainText('Shared intermission Heal used');
  await expect(potionCard.getByTestId('intermission-heal-status')).toContainText(afterPotion.character.displayName);
  await expect(potionCard.getByTestId('stream-run-potion')).toBeDisabled();
  await expect(potionCard.getByTestId('stream-run-continue')).toBeVisible();
    expect((await dashboard(page.context())).activeRun.version).toBe(versionAfterPotion);
    await page.setViewportSize({ width: 390, height: 844 });
    await potionCard.evaluate((node) => node.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: 'ux-review/react-progression-390x844.png' });
    await page.setViewportSize({ width: 1440, height: 960 });
    await expect(page.getByTestId('stream-dungeon-rich-card').last().getByTestId('intermission-heal-status')).toBeVisible();
    await page.getByTestId('stream-dungeon-rich-card').last().evaluate((node) => node.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: 'ux-review/react-progression-1440x960.png' });

  const versionBeforeContinue = afterPotion.activeRun.version;
  await potionCard.getByTestId('stream-run-continue').click();
  await expect.poll(async () => (await dashboard(page.context())).activeRun?.version || -1, { timeout: 7000 }).toBeGreaterThan(versionBeforeContinue);
  const afterContinue = await waitForPhase(page.context(), 'between_encounter');
  expect(afterContinue.activeRun.viewer.hp).toBeGreaterThan(0);
  expect(afterContinue.activeRun.intermissionPotionClaimedWindowId).toBeNull();
  expect(afterContinue.activeRun.intermissionPotionClaimedByPlayerId).toBeNull();
  await expect(page.getByTestId('stream-dungeon-rich-card').last().getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete', { timeout: 20000 });

  await page.getByTestId('stream-dungeon-rich-card').last().getByTestId('stream-run-retreat').click();
  await expect.poll(async () => (await dashboard(page.context())).activeRun || null, { timeout: 7000 }).toBeNull();
  await expect(page.getByTestId('stream-dungeon-rich-card').last()).toContainText(/clear reward was not secured|left safely/i);
});
