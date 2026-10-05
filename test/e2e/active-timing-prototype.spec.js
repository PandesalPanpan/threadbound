import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });

const arenaTestId = 'active-timing-arena';

async function waitForTargetWindow(page) {
  const arena = page.getByTestId(arenaTestId);
  const startedAt = Number(await arena.getAttribute('data-start-at-ms'));
  const targetMs = Number(await arena.getAttribute('data-target-ms'));
  expect(Number.isFinite(startedAt)).toBe(true);
  expect(Number.isFinite(targetMs)).toBe(true);
  // Give the touch command its protocol round trip while keeping the pointer event near the target.
  await page.waitForFunction(({ start, target }) => performance.now() >= start + target - 45, { start: startedAt, target: targetMs });
}

async function tapAtTarget(page) {
  const arena = page.getByTestId(arenaTestId);
  await waitForTargetWindow(page);
  await arena.tap();
}

async function holdSkillAtTarget(page) {
  const arena = page.getByTestId(arenaTestId);
  await arena.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true, buttons: 1 });
  await expect.poll(() => arena.getAttribute('data-start-at-ms')).not.toBe('');
  await waitForTargetWindow(page);
  await arena.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: true, buttons: 0 });
}

async function defendCurrentHit(page) {
  const arena = page.getByTestId(arenaTestId);
  await expect(arena).toHaveAttribute('data-phase', 'ENEMY_TIMING');
  if (await arena.getAttribute('data-pattern') === 'quick-strike' && await page.getByTestId('active-timing-turnline').innerText().then((text) => text.includes('TURN 1'))) {
    await page.screenshot({ path: 'test-results/active-timing-defense-mobile-390x844.png', fullPage: true });
  }
  await tapAtTarget(page);
}

async function usePerfectSkill(page) {
  await page.getByTestId('active-timing-action-skill').click();
  await expect(page.getByTestId(arenaTestId)).toHaveAttribute('data-action', 'SKILL');
  await holdSkillAtTarget(page);
  await expect(page.getByTestId('active-timing-hit')).toContainText('PERFECT');
}

test('mobile active timing fight uses touch for attack, defense, Skill, Item, and replay', async ({ page }) => {
  test.setTimeout(60_000);
  const apiRequests = [];
  page.on('request', (request) => { if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url()); });
  await page.goto('/active-timing?view=timing');
  await expect(page.getByRole('heading', { name: 'Face the Ribbon Boar' })).toBeVisible();
  await expect(page.getByText('LOCAL ONLY')).toBeVisible();
  await page.getByTestId('active-timing-start').tap();
  await expect(page.getByTestId('active-timing-turnline')).toContainText('TURN 1');

  await page.getByTestId('active-timing-action-attack').tap();
  await page.screenshot({ path: 'test-results/active-timing-attack-mobile-390x844.png', fullPage: true });
  await tapAtTarget(page);
  await expect(page.getByTestId('active-timing-hit')).toContainText('PERFECT');
  await expect(page.getByTestId('active-timing-hit')).toContainText('−19 HP');
  await page.screenshot({ path: 'test-results/active-timing-impact-mobile-390x844.png', fullPage: true });
  await defendCurrentHit(page);
  await expect(page.getByTestId('active-timing-hit')).toContainText('PERFECT GUARD');

  await expect(page.getByTestId('active-timing-turnline')).toContainText('TURN 2');
  await page.getByTestId('active-timing-action-item').tap();
  await expect(page.getByTestId('active-timing-hit')).toContainText('POTION');
  await expect(page.getByTestId('active-timing-hit')).toContainText('+2 HP');
  await defendCurrentHit(page);

  await expect(page.getByTestId('active-timing-turnline')).toContainText('TURN 3');
  await usePerfectSkill(page);
  await expect(page.getByTestId(arenaTestId)).toHaveAttribute('data-pattern', 'double-bounce');
  await defendCurrentHit(page);
  await expect(page.getByTestId(arenaTestId)).toHaveAttribute('data-phase', 'ENEMY_IMPACT');
  await expect(page.getByTestId(arenaTestId)).toHaveAttribute('data-pattern', 'double-bounce');
  await expect(page.getByTestId(arenaTestId)).toHaveAttribute('data-phase', 'ENEMY_TIMING', { timeout: 1500 });
  await defendCurrentHit(page);

  for (let turn = 4; turn <= 7; turn += 1) {
    await expect(page.getByTestId('active-timing-turnline')).toContainText(`TURN ${turn}`);
    await usePerfectSkill(page);
    await defendCurrentHit(page);
  }
  await expect(page.getByTestId('active-timing-turnline')).toContainText('TURN 8');
  await usePerfectSkill(page);

  await expect(page.getByTestId('active-timing-result')).toContainText('VICTORY');
  await page.screenshot({ path: 'test-results/active-timing-result-mobile-390x844.png', fullPage: true });
  await expect(page.getByText('Was that fun?')).toBeVisible();
  await page.getByRole('button', { name: '5 out of 5' }).tap();
  await expect(page.getByText('Thanks — 5/5 saved for this session.')).toBeVisible();
  await page.getByTestId('active-timing-fight-again').tap();
  await expect(page.getByTestId(arenaTestId)).toHaveAttribute('data-phase', 'PLAYER_CHOICE');
  await expect(page.getByTestId('active-timing-turnline')).toContainText('TURN 1');
  await expect(page.getByTestId('active-timing-player-health')).toContainText('84/84 HP');
  await expect(page.getByTestId('active-timing-action-item')).toContainText('×1');
  expect(apiRequests).toEqual([]);
});

test('combat actions stay visible, tappable, and within phone widths', async ({ page }) => {
  await page.goto('/active-timing?view=timing');
  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 412, height: 915 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByTestId('active-timing-start')).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    const playerHealth = await page.getByTestId('active-timing-player-health').boundingBox();
    const enemyHealth = await page.getByTestId('active-timing-enemy-health').boundingBox();
    expect(playerHealth.x + playerHealth.width + 8).toBeLessThan(enemyHealth.x);
    await page.getByTestId('active-timing-start').tap();
    const actionBoxes = await Promise.all(['attack', 'skill', 'item', 'guard'].map(async (action) => page.getByTestId(`active-timing-action-${action}`).boundingBox()));
    expect(actionBoxes.every((box) => box && box.height >= 44 && box.width >= 44)).toBe(true);
    if (viewport.width === 390) await page.screenshot({ path: 'test-results/active-timing-mobile-390x844.png', fullPage: true });
    await page.reload();
  }
});

test('reduced motion keeps the timing cue and rapid attack input resolves once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/active-timing?view=timing');
  await expect(page.locator('.active-timing-page')).toHaveAttribute('data-reduced-motion', 'true');

  const player = page.locator('.active-timing-unit--player');
  const idleTransform = await player.evaluate((element) => getComputedStyle(element).transform);
  await page.waitForTimeout(420);
  await expect.poll(() => player.evaluate((element) => getComputedStyle(element).transform)).toBe(idleTransform);

  await page.getByTestId('active-timing-start').tap();
  const arena = page.getByTestId(arenaTestId);
  await expect(arena).toHaveAttribute('data-phase', 'PLAYER_CHOICE');
  await page.getByTestId('active-timing-action-attack').tap();
  const initialProgress = Number(await arena.getAttribute('data-progress'));
  await page.waitForTimeout(180);
  expect(Number(await arena.getAttribute('data-progress'))).toBeGreaterThan(initialProgress + 5);
  await waitForTargetWindow(page);
  await arena.dispatchEvent('pointerdown', { pointerId: 17, pointerType: 'touch', isPrimary: true, buttons: 1 });
  await arena.dispatchEvent('pointerdown', { pointerId: 18, pointerType: 'touch', isPrimary: true, buttons: 1 });

  await expect(arena).toHaveAttribute('data-phase', 'PLAYER_IMPACT');
  await expect(page.getByTestId('active-timing-enemy-health')).toContainText('129/148 HP');
  await expect.poll(() => page.locator('.active-timing-fx > *').count()).toBeGreaterThan(0);
  await expect(arena).toHaveAttribute('data-phase', 'ENEMY_TIMING', { timeout: 2000 });
  await tapAtTarget(page);
  await expect(page.getByTestId('active-timing-hit')).toContainText('PERFECT GUARD');
  expect(page.url()).toContain('/active-timing');
});
