import { test, expect } from '@playwright/test';

async function sharedBattleMotionSnapshot(surface) {
  return surface.evaluate((node) => {
    const rect = (element) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { left: box.left, top: box.top, width: box.width, height: box.height };
    };
    const byCombatant = (selector, id) => [...node.querySelectorAll(selector)].find((element) => element.dataset.combatantId === id) || null;
    const arena = rect(node.querySelector('.shared-battle-arena'));
    const relativeRect = (element) => {
      const box = rect(element);
      return box && arena ? { ...box, left: box.left - arena.left, top: box.top - arena.top } : box;
    };
    const actorId = node.dataset.currentActorId || null;
    const targetId = node.dataset.currentTargetId || null;
    const actorStage = byCombatant('.shared-battle-character-stage', actorId);
    const targetStage = byCombatant('.shared-battle-character-stage', targetId);
    const actorMotion = byCombatant('.shared-battle-character-motion', actorId);
    const targetMotion = byCombatant('.shared-battle-character-motion', targetId);
    const actorUnit = byCombatant('.shared-battle-unit', actorId);
    const targetUnit = byCombatant('.shared-battle-unit', targetId);
    const actorCopy = byCombatant('.shared-battle-unit__copy', actorId);
    const targetCopy = byCombatant('.shared-battle-unit__copy', targetId);
    const line = node.querySelector('.shared-trajectory__core');
    const damageElement = node.querySelector('[data-testid="shared-battle-floating-damage"]');
    const center = (element) => {
      const box = rect(element);
      return box && arena ? { x: box.left + box.width / 2 - arena.left, y: box.top + box.height / 2 - arena.top } : null;
    };
    const computed = (element) => element ? { animationName: getComputedStyle(element).animationName, transform: getComputedStyle(element).transform } : null;
    return {
      phase: node.dataset.replayPhase,
      actorId,
      targetId,
      actor: { stage: relativeRect(actorStage), motion: relativeRect(actorMotion), unit: relativeRect(actorUnit), copy: relativeRect(actorCopy), center: center(actorStage), motionStyle: computed(actorMotion), unitStyle: computed(actorUnit), acting: actorMotion?.dataset.acting === 'true' },
      target: { stage: relativeRect(targetStage), motion: relativeRect(targetMotion), unit: relativeRect(targetUnit), copy: relativeRect(targetCopy), center: center(targetStage), motionStyle: computed(targetMotion), unitStyle: computed(targetUnit), targeted: targetMotion?.dataset.targeted === 'true' },
      line: line ? { x1: Number(line.getAttribute('x1')), y1: Number(line.getAttribute('y1')), x2: Number(line.getAttribute('x2')), y2: Number(line.getAttribute('y2')) } : null,
      lineTransform: line ? getComputedStyle(line).transform : null,
      damage: rect(damageElement),
      damageCenter: center(damageElement),
      damageAnchor: damageElement ? { x: Number.parseFloat(damageElement.style.left), y: Number.parseFloat(damageElement.style.top) } : null,
      damageText: damageElement?.textContent || null,
    };
  });
}

function rectDelta(first, second) {
  if (!first || !second) return Number.POSITIVE_INFINITY;
  return Math.max(
    Math.abs((first?.left || 0) - (second?.left || 0)),
    Math.abs((first?.top || 0) - (second?.top || 0)),
    Math.abs((first?.width || 0) - (second?.width || 0)),
    Math.abs((first?.height || 0) - (second?.height || 0)),
  );
}

function centerDelta(stage, motion) {
  if (!stage || !motion) return 0;
  return Math.hypot((motion.left + motion.width / 2) - (stage.left + stage.width / 2), (motion.top + motion.height / 2) - (stage.top + stage.height / 2));
}

test('React battle simulation replays the authoritative Figma 3v3 event stream', async ({ page }) => {
  await page.addInitScript(() => { window.__THREADBOUND_FAST_TEST__ = true; });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('local-login-d').click();
  await page.context().request.post('/api/party/leave');
  await page.goto('/game?view=battle');

  await expect(page.getByTestId('battle-card')).toHaveAttribute('data-battle-phase', 'preBattle');
  await expect(page.getByTestId('battle-pre-battle')).toContainText('Watch the threads fight');
  await expect(page.locator('[data-testid^="battle-start"]')).toBeVisible();
  await expect(page.locator('[data-testid="battle-pre-battle"] [data-visual-asset-id]')).toHaveCount(6);
  await page.screenshot({ path: 'ux-review/react-battle-pre-battle-mobile.png', fullPage: true });

  await page.getByTestId('battle-start').click();
  await expect(page.getByTestId('battle-card')).toHaveAttribute('data-authoritative', 'true');
  await expect(page.getByTestId('battle-players')).toBeVisible();
  await expect(page.getByTestId('battle-enemies')).toBeVisible();
  await expect(page.locator('[data-testid="battle-players"] [data-unit-id]')).toHaveCount(3);
  await expect(page.locator('[data-testid="battle-enemies"] [data-unit-id]')).toHaveCount(3);
  await expect(page.locator('[data-visual-asset-id="character.road-sellsword.v1"]')).toHaveCount(1);
  await expect(page.locator('[data-visual-asset-id="character.mine-breaker.v1"]')).toHaveCount(1);
  await expect(page.locator('[data-visual-asset-id="character.wayfarer-healer.v1"]')).toHaveCount(1);
  await expect(page.locator('[data-visual-asset-id="mob.mold-mite.v1"]')).toHaveCount(1);
  await expect(page.locator('[data-visual-asset-id="mob.frost-blob.v1"]')).toHaveCount(1);
  await expect(page.locator('[data-visual-asset-id="mob.ridge-wolf.v1"]')).toHaveCount(1);
  await expect(page.locator('[data-testid^="battle-mana-battle:rune-bard:"]')).toHaveCount(1);
  await page.screenshot({ path: 'ux-review/react-battle-live-mobile.png', fullPage: true });

  await expect.poll(async () => page.getByTestId('battle-card').getAttribute('data-battle-phase'), { timeout: 15000 }).toBe('result');
  await expect(page.getByTestId('battle-result-stamp')).toContainText('Victory');
  await expect(page.getByTestId('battle-result-receipt')).toContainText('Defeated');
  await expect(page.getByTestId('battle-result-receipt')).toContainText('HP');
  await expect(page.getByTestId('battle-result-receipt')).toContainText('turns');
  await expect(page.getByTestId('battle-details')).toBeVisible();
  await page.getByTestId('battle-details').locator('summary').click();
  await expect(page.getByTestId('battle-details-turns').locator('.battle-details-turn')).toHaveCount(38);
  await page.screenshot({ path: 'ux-review/react-battle-result-mobile.png', fullPage: true });

  const receiptText = await page.getByTestId('battle-result-receipt').innerText();
  await page.reload();
  await expect(page.getByTestId('battle-card')).toHaveAttribute('data-battle-phase', 'result');
  await expect(page.getByTestId('battle-result-receipt')).toContainText(receiptText.split('\n')[1]);

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.screenshot({ path: 'ux-review/react-battle-result-desktop.png', fullPage: true });
  await expect(page.getByRole('navigation', { name: 'Threadbound' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Play' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Codex' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Arc Workshop' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
});

test('Hunt replays the committed roster inline without browser-side simulation', async ({ page }) => {
  await page.addInitScript(() => { window.__THREADBOUND_FAST_TEST__ = true; });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('local-login-d').click();
  await page.context().request.post('/api/party/leave');

  const huntResponse = await page.context().request.post('/api/hunt');
  expect(huntResponse.ok()).toBe(true);
  const huntPayload = await huntResponse.json();
  const hunt = huntPayload.hunt;
  const player = hunt.battle.combatants.find((combatant) => combatant.team === 'players');
  const enemy = hunt.battle.combatants.find((combatant) => combatant.team === 'enemies');
  expect(player?.displayName).toBeTruthy();
  expect(enemy?.displayName).toBe(hunt.enemy.name);
  expect(hunt.battleLoadout).toBeDefined();

  await page.route('**/api/stream*', async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    let latestHuntId = null;
    for (const entry of payload.entries || []) {
      if (entry.eventType === 'HuntResolved') latestHuntId = entry.id;
    }
    const now = new Date().toISOString();
    const entries = (payload.entries || []).map((entry) => entry.id === latestHuntId ? { ...entry, createdAt: now } : entry);
    await route.fulfill({ response, body: JSON.stringify({ ...payload, entries }) });
  });
  await page.goto('/game');
  await page.reload();
  const sharedHunt = page.getByTestId('stream-hunt-rich-card').last();
  await expect(sharedHunt).toBeVisible();
  await expect(sharedHunt).toContainText(hunt.enemy.name);
  await expect(sharedHunt).toContainText(`${hunt.battle.turns.length}`);
  await expect(sharedHunt.getByTestId('shared-battle-surface')).toBeVisible();
  await expect(sharedHunt.getByTestId('shared-battle-enemy')).toContainText(hunt.enemy.name);
  await expect(sharedHunt.getByTestId('stream-watch-hunt-battle')).toHaveCount(0);
  await expect(sharedHunt.getByTestId('hunt-replay-pending')).toBeVisible();
  await expect(sharedHunt.getByTestId('hunt-final-facts')).toHaveCount(0);

  const simulationRequests = [];
  const huntRequests = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/battle-simulation')) simulationRequests.push(request.url());
    if (request.url().endsWith('/api/hunt') && request.method() === 'POST') huntRequests.push(request.url());
  });
  await expect(sharedHunt.getByTestId('shared-battle-player')).toContainText(player.displayName);
  await expect(sharedHunt.locator('[data-visual-asset-id]')).toHaveCount(2);
  expect(simulationRequests).toEqual([]);
  expect(huntRequests).toEqual([]);
  await expect(sharedHunt.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete', { timeout: 10000 });
  await expect(sharedHunt.getByTestId('hunt-final-facts')).toBeVisible();
});

test('shared battle motion stays on the artwork while the HUD and art anchors remain fixed', async ({ page }) => {
  await page.addInitScript(() => { window.__THREADBOUND_FAST_TEST__ = true; });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('local-login-d').click();
  await page.context().request.post('/api/party/leave');

  const huntResponse = await page.context().request.post('/api/hunt');
  expect(huntResponse.ok()).toBe(true);
  const huntPayload = await huntResponse.json();
  const player = huntPayload.hunt.battle.combatants.find((combatant) => combatant.team === 'players');
  const enemy = huntPayload.hunt.battle.combatants.find((combatant) => combatant.team === 'enemies');
  expect(player?.id).toBeTruthy();
  expect(enemy?.id).toBeTruthy();

  await page.route('**/api/stream*', async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    const latestHuntId = [...(payload.entries || [])].reverse().find((entry) => entry.eventType === 'HuntResolved')?.id;
    const now = new Date().toISOString();
    const entries = (payload.entries || []).map((entry) => entry.id === latestHuntId ? { ...entry, createdAt: now } : entry);
    await route.fulfill({ response, body: JSON.stringify({ ...payload, entries }) });
  });
  await page.goto('/game');
  await page.reload();

  await expect.poll(async () => page.locator('[data-testid="shared-battle-surface"][data-replay-state="playing"]').count(), { timeout: 4000 }).toBeGreaterThan(0);
  const liveSurface = page.locator('[data-testid="shared-battle-surface"][data-replay-state="playing"]').last();
  const replayBattleId = await liveSurface.getAttribute('data-replay-battle-id');
  const surface = page.locator(`[data-testid="shared-battle-surface"][data-replay-battle-id="${replayBattleId}"]`);
  await expect(surface).toBeVisible();
  let windup;
  await expect.poll(async () => {
    const snapshot = await sharedBattleMotionSnapshot(surface);
    if (snapshot.phase !== 'windup' || snapshot.actorId !== player.id || snapshot.targetId !== enemy.id || !snapshot.actor.unit || !snapshot.actor.copy || !snapshot.target.unit || !snapshot.target.copy) return false;
    windup = snapshot;
    return true;
  }, { timeout: 4000, intervals: [50] }).toBe(true);
  expect(windup.actorId).toBe(player.id);
  expect(windup.targetId).toBe(enemy.id);
  expect(windup.actor.motionStyle.animationName).toContain('shared-character-windup');
  expect(windup.actor.unitStyle.animationName).toBe('none');
  expect(windup.target.unitStyle.animationName).toBe('none');
  expect(windup.line).toBeNull();

  let trajectory;
  await expect.poll(async () => {
    const snapshot = await sharedBattleMotionSnapshot(surface);
    if (snapshot.phase !== 'trajectory' || snapshot.actorId !== windup.actorId || snapshot.targetId !== windup.targetId || !snapshot.actor.unit || !snapshot.actor.copy || !snapshot.target.unit || !snapshot.target.copy || centerDelta(snapshot.actor.stage, snapshot.actor.motion) <= 1) return false;
    trajectory = snapshot;
    return true;
  }, { timeout: 1200, intervals: [50] }).toBe(true);

  expect(rectDelta(windup.actor.unit, trajectory.actor.unit)).toBeLessThan(0.5);
  expect(rectDelta(windup.actor.copy, trajectory.actor.copy)).toBeLessThan(1.5);
  expect(rectDelta(windup.target.unit, trajectory.target.unit)).toBeLessThan(0.5);
  expect(rectDelta(windup.target.copy, trajectory.target.copy)).toBeLessThan(1.5);
  expect(trajectory.actor.motionStyle.animationName).toContain('shared-character-lunge');
  expect(trajectory.actor.unitStyle.animationName).toBe('none');
  expect(trajectory.target.unitStyle.animationName).toBe('none');
  expect(trajectory.actor.acting).toBe(true);
  expect(Math.abs(trajectory.line.x1 - trajectory.actor.center.x)).toBeLessThan(1);
  expect(Math.abs(trajectory.line.y1 - trajectory.actor.center.y)).toBeLessThan(1);
  expect(Math.abs(trajectory.line.x2 - trajectory.target.center.x)).toBeLessThan(1);
  expect(Math.abs(trajectory.line.y2 - trajectory.target.center.y)).toBeLessThan(1);

  let impact;
  await expect.poll(async () => {
    const snapshot = await sharedBattleMotionSnapshot(surface);
    if (snapshot.phase !== 'impact' || snapshot.actorId !== windup.actorId || snapshot.targetId !== windup.targetId || !snapshot.target.unit || !snapshot.target.copy || centerDelta(snapshot.target.stage, snapshot.target.motion) <= 1) return false;
    impact = snapshot;
    return true;
  }, { timeout: 1000, intervals: [50] }).toBe(true);

  expect(impact.target.motionStyle.animationName).toContain('shared-character-recoil');
  expect(impact.target.targeted).toBe(true);
  expect(impact.target.unitStyle.animationName).toBe('none');
  expect(rectDelta(windup.target.unit, impact.target.unit)).toBeLessThan(0.5);
  expect(rectDelta(windup.target.copy, impact.target.copy)).toBeLessThan(1.5);
  expect(impact.damageText).toMatch(/HP$/);
  expect(Math.abs((impact.damageCenter?.x || 0) - impact.target.center.x)).toBeLessThan(12);
  expect(impact.damageAnchor?.y || 0).toBeLessThan(impact.target.center.y);
});

test('shared battle trajectories stay art-relative on mobile and desktop, including reverse attacks', async ({ page }) => {
  await page.addInitScript(() => { window.__THREADBOUND_FAST_TEST__ = true; });
  await page.goto('/');
  await page.getByTestId('local-login-i').click();
  await page.context().request.post('/api/party/leave');

  await page.route('**/api/stream*', async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    const latestHuntId = [...(payload.entries || [])].reverse().find((entry) => entry.eventType === 'HuntResolved')?.id;
    const entries = (payload.entries || []).map((entry) => entry.id === latestHuntId
      ? { ...entry, createdAt: new Date(Date.now() - 100).toISOString() }
      : entry);
    await route.fulfill({ response, body: JSON.stringify({ ...payload, entries }) });
  });

  for (const [width, height] of [[390, 844], [1440, 960]]) {
    await page.setViewportSize({ width, height });
    const huntResponse = await page.context().request.post('/api/hunt');
    expect(huntResponse.ok()).toBe(true);
    const payload = await huntResponse.json();
    const player = payload.hunt.battle.combatants.find((combatant) => combatant.team === 'players');
    const enemy = payload.hunt.battle.combatants.find((combatant) => combatant.team === 'enemies');
    expect(player?.id).toBeTruthy();
    expect(enemy?.id).toBeTruthy();
    expect(payload.hunt.battle.turns.some((turn) => (
      turn.actorId === enemy.id
      && turn.targetId === player.id
      && Number(turn.targetDamage || 0) > 0
    ))).toBe(true);

    await page.goto('/game');
    await page.reload();
    const surface = page.getByTestId('stream-hunt-rich-card').last().getByTestId('shared-battle-surface');
    await expect(surface).toBeVisible();
    await expect(surface.locator('.trajectory__core, .trajectory__beam, .trajectory__burst, .trajectory__ring')).toHaveCount(0);

    let forward;
    await expect.poll(async () => {
      const snapshot = await sharedBattleMotionSnapshot(surface);
      if (snapshot.phase !== 'trajectory' || snapshot.actorId !== player.id || snapshot.targetId !== enemy.id || !snapshot.line) return false;
      forward = snapshot;
      return true;
    }, { timeout: 3500, intervals: [25] }).toBe(true);

    expect(Math.abs(forward.line.x1 - forward.actor.center.x)).toBeLessThan(1.5);
    expect(Math.abs(forward.line.y1 - forward.actor.center.y)).toBeLessThan(1.5);
    expect(Math.abs(forward.line.x2 - forward.target.center.x)).toBeLessThan(1.5);
    expect(Math.abs(forward.line.y2 - forward.target.center.y)).toBeLessThan(1.5);
    expect(Math.max(forward.line.x1, forward.line.y1, forward.line.x2, forward.line.y2)).toBeGreaterThan(8);
    expect(forward.lineTransform).toBe('none');

    let reverse;
    await expect.poll(async () => {
      const snapshot = await sharedBattleMotionSnapshot(surface);
      if (snapshot.phase !== 'trajectory' || snapshot.actorId !== enemy.id || snapshot.targetId !== player.id || !snapshot.line) return false;
      reverse = snapshot;
      return true;
    }, { timeout: 3500, intervals: [25] }).toBe(true);
    expect(Math.abs(reverse.line.x1 - reverse.actor.center.x)).toBeLessThan(1.5);
    expect(Math.abs(reverse.line.y1 - reverse.actor.center.y)).toBeLessThan(1.5);
    expect(Math.abs(reverse.line.x2 - reverse.target.center.x)).toBeLessThan(1.5);
    expect(Math.abs(reverse.line.y2 - reverse.target.center.y)).toBeLessThan(1.5);
    expect(reverse.lineTransform).toBe('none');
    await expect(surface).toHaveAttribute('data-replay-state', 'complete', { timeout: 10000 });
  }
});

test('a missing Hunt replay does not render the unrelated 3v3 showcase', async ({ page }) => {
  await page.addInitScript(() => { window.__THREADBOUND_FAST_TEST__ = true; });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('local-login-d').click();
  await page.context().request.post('/api/party/leave');
  await page.goto('/game?view=battle&source=stream');

  const unavailable = page.getByTestId('battle-replay-unavailable');
  await expect(unavailable).toBeVisible();
  await expect(unavailable).toContainText('committed battle is not available');
  await expect(unavailable).toContainText('Adventure Stream');
  await expect(unavailable).not.toContainText('3 Weaver');
  await expect(page.getByTestId('battle-card')).toHaveCount(0);
});
