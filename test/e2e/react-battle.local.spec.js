import { test, expect } from '@playwright/test';

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
  await expect(page.locator('[data-visual-asset-id="character.bramble-druid-figma.v1"]')).toHaveCount(1);
  await expect(page.locator('[data-visual-asset-id="character.iron-vanguard-figma.v1"]')).toHaveCount(1);
  await expect(page.locator('[data-visual-asset-id="character.rune-bard-figma.v1"]')).toHaveCount(1);
  await expect(page.locator('[data-visual-asset-id="mob.cinder-imp-figma.v1"]')).toHaveCount(1);
  await expect(page.locator('[data-visual-asset-id="mob.rot-toad-figma.v1"]')).toHaveCount(1);
  await expect(page.locator('[data-visual-asset-id="mob.gloom-hound-figma.v1"]')).toHaveCount(1);
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

test('Hunt Watch Battle replays the committed roster and never falls back to the showcase', async ({ page }) => {
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

  await page.goto('/game');
  await page.reload();
  const sharedHunt = page.getByTestId('stream-hunt-rich-card').last();
  await expect(sharedHunt).toBeVisible();
  await expect(sharedHunt).toContainText(hunt.enemy.name);
  await expect(sharedHunt).toContainText(`${hunt.battle.turns.length}`);
  await expect(sharedHunt.getByTestId('stream-watch-hunt-battle')).toBeVisible();

  const simulationRequests = [];
  const huntRequests = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/battle-simulation')) simulationRequests.push(request.url());
    if (request.url().endsWith('/api/hunt') && request.method() === 'POST') huntRequests.push(request.url());
  });
  await sharedHunt.getByTestId('stream-watch-hunt-battle').click();
  await expect(page).toHaveURL(/view=battle&source=stream/);
  const replay = page.getByTestId('battle-pre-battle');
  await expect(replay).toBeVisible();
  await expect(replay).toContainText(player.displayName);
  await expect(replay).toContainText(enemy.displayName);
  await expect(replay).toContainText('1 Weaver face 1 threat');
  await expect(replay.locator('[data-visual-asset-id]')).toHaveCount(2);
  expect(simulationRequests).toEqual([]);
  expect(huntRequests).toEqual([]);

  await page.getByTestId('battle-start').click();
  await expect.poll(async () => page.getByTestId('battle-card').getAttribute('data-battle-phase'), { timeout: 15000 }).toBe('result');
  await expect(page.getByTestId('battle-result-receipt')).toContainText(hunt.enemy.name);
  await expect(page.getByTestId('battle-details').locator('summary')).toContainText(`${hunt.battle.turns.length} turns`);
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
