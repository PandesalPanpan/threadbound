import { test, expect } from '@playwright/test';
import { earnGoldWithWelcomeQuest } from './helpers/earn-gold.js';

async function login(page, slot = 'd') {
  await page.goto('/');
  await page.getByTestId(`local-login-${slot}`).click();
  await page.context().request.post('/api/party/leave');
  await page.goto('/game');
}

async function command(page, value) {
  await expect(page.getByTestId('stream-busy')).toHaveCount(0);
  const composer = page.getByTestId('stream-message');
  await composer.fill(value);
  await composer.press('Enter');
}

test('React shell embeds the server-ranked Guild Hall with profile and Duel receipts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  await command(page, 'leaderboard');
  const card = page.getByTestId('leaderboard-rich-card');
  await expect(card).toBeVisible();
  await expect(card.getByTestId('leaderboard-list')).toBeVisible();
  const rival = card.locator('[data-testid^="leaderboard-row-"]').filter({ hasText: 'Rook' }).first();
  await expect(rival).toBeVisible();
  await command(page, 'profile guild-rook');
  await expect(card.getByTestId('shell-simulated-profile')).toBeVisible();
  await expect(card.getByTestId('shell-profile-name')).toContainText('Rook');
  await expect(card.getByTestId('shell-simulated-profile-equipment-weapon').locator('img')).toHaveAttribute('data-visual-asset-id', 'item.threadsteel-longsword.v1');
  await expect(card.getByTestId('shell-simulated-profile-equipment-armor').locator('img')).toHaveAttribute('data-visual-asset-id', 'item.ironroot-cuirass.v1');
  await expect(card.locator('[data-testid^="shell-simulated-profile-equipment-"]')).toHaveCount(5);
  await rival.getByRole('button', { name: 'Profile' }).click();
  await expect(card.getByTestId('shell-simulated-profile')).toBeVisible();
  await expect(card.getByTestId('shell-profile-name')).toContainText('Rook');

  const duelResponse = page.waitForResponse((response) => response.url().endsWith('/api/duels/guild-rook') && response.request().method() === 'POST');
  await rival.getByRole('button', { name: /Duel/ }).click();
  expect((await duelResponse).ok()).toBe(true);
  const duelCard = page.getByTestId('stream-duel-rich-card').last();
  await expect(duelCard).toBeVisible();
  await expect(card).toHaveCount(0);
  const replay = duelCard.getByTestId('shared-battle-surface');
  const renderedDuelId = await replay.getAttribute('data-replay-battle-id');
  const duelEntries = (await (await page.context().request.get('/api/stream')).json()).entries;
  const duelEntry = duelEntries.find((entry) => entry.eventType === 'DuelResolved'
    && String(entry.metadata?.duelId || entry.id || '') === String(renderedDuelId || ''));
  expect(duelEntry, 'the rendered Duel replay must match its authoritative stream receipt').toBeTruthy();
  const rivalCombatant = duelEntry?.metadata?.battleReplay?.details?.combatants?.find((combatant) => combatant.id === 'guild-rook');
  const duelTurns = duelEntry?.metadata?.battleReplay?.details?.turns || [];
  const duelSkillTurnIndex = duelTurns.findIndex((turn) => turn.actionType === 'skill' && turn.actorMana.before === 100 && turn.actorMana.after === 0);
  expect(duelSkillTurnIndex).toBeGreaterThanOrEqual(0);
  expect(rivalCombatant?.equipment?.weapon?.name).toBe('Veteran Blade');
  expect(rivalCombatant?.equipment?.weapon?.visualAssetId).toBe('item.threadsteel-longsword.v1');
  expect(rivalCombatant?.equipment?.armor?.visualAssetId).toBe('item.ironroot-cuirass.v1');
  await expect(replay).toHaveAttribute('data-replay-state', 'playing', { timeout: 7000 });
  await expect(replay.getByTestId('shared-battle-result')).toHaveCount(0);
  await expect(duelCard.locator('[data-testid^="shared-battle-player"]')).toHaveCount(1);
  await expect(duelCard.locator('[data-testid^="shared-battle-enemy"]')).toHaveCount(1);
  await expect(duelCard.locator('[data-testid^="shared-battle-mana-"]')).toHaveCount(2);
  await expect(duelCard.locator('.shared-battle-signature')).toHaveCount(2);
  await expect(duelCard.locator('[data-testid^="duel-loadout-"]')).not.toHaveCount(0);
  await expect(duelCard).toContainText('Veteran Blade');
  await expect(duelCard.locator('[data-testid^="duel-loadout-guild-rook-weapon"] img')).toHaveAttribute('data-visual-asset-id', 'item.threadsteel-longsword.v1');
  await expect(duelCard.locator('[data-testid^="duel-loadout-guild-rook-armor"] img')).toHaveAttribute('data-visual-asset-id', 'item.ironroot-cuirass.v1');
  const duelReplay = duelEntry.metadata.battleReplay;
  const arenaReplay = duelReplay.arenaReplay;
  expect(arenaReplay?.kind).toBe('arena-combat-replay');
  const replayManaEvents = (arenaReplay.events || []).flatMap((event) => event.manaEvents || []);
  expect(replayManaEvents.some((event) => event.reason === 'basic-attack' && Number(event.delta) > 0)).toBe(true);
  const arenaSkillEvent = (arenaReplay.events || []).find((event) => event.kind === 'action' && event.actionType === 'skill');
  expect(arenaSkillEvent?.manaEvents.some((event) => Number(event.delta) === -100)).toBe(true);
  expect(duelTurns[duelSkillTurnIndex].skillName || duelTurns[duelSkillTurnIndex].skillId).toBeTruthy();
  await expect(replay).toHaveAttribute('data-arena-replay-surface', 'true');
  await expect(replay.getByTestId('arena-replay-roster-guild-rook')).toContainText('Veteran Blade');
  await expect(replay.getByTestId('arena-replay-roster-guild-rook')).toContainText('Veteran Armor');
  await replay.getByRole('button', { name: 'Skip to battle result' }).click();
  await expect(replay).toHaveAttribute('data-replay-state', 'complete');
  await expect(replay.getByTestId('shared-battle-result')).toContainText(/Victory|Defeat|Draw|VICTORY|DEFEAT|DRAW/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'ux-review/react-duel-replay-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 960 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  await page.screenshot({ path: 'ux-review/react-duel-replay-desktop.png' });
  await expect(page.getByTestId('stream-system-entry').last()).not.toContainText(/Duel result/i);
});

test('plain talk and speak commands resolve current-Town NPCs into shared receipts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'b');
  const areaResponse = await page.context().request.get('/api/areas');
  expect(areaResponse.ok()).toBe(true);
  const area = (await areaResponse.json()).area;
  const npcs = area.towns.flatMap((town) => town.npcs.map((npc) => ({ town, npc })));
  expect(npcs.length).toBeGreaterThanOrEqual(2);

  await command(page, `talk to ${npcs[0].npc.name}`);
  const firstReceipt = page.getByTestId('stream-npc-rich-card').last();
  await expect(firstReceipt).toBeVisible();
  await expect(firstReceipt).toContainText(npcs[0].npc.name);
  const firstStream = await (await page.context().request.get('/api/stream')).json();
  expect(firstStream.entries.some((entry) => entry.eventType === 'NpcInteracted' && entry.metadata?.npcId === npcs[0].npc.id)).toBe(true);

  await command(page, `speak ${npcs[1].npc.name}`);
  const secondReceipt = page.getByTestId('stream-npc-rich-card').last();
  await expect(secondReceipt).toContainText(npcs[1].npc.name);
  const secondStream = await (await page.context().request.get('/api/stream')).json();
  expect(secondStream.entries.some((entry) => entry.eventType === 'NpcInteracted' && entry.metadata?.npcId === npcs[1].npc.id)).toBe(true);
});

test('React shell embeds Gold games and server-backed Blackjack state', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'b');
  // Complete the repeatable Welcome Quest for enough Gold to fund both games
  // without turning setup into a sequence of attrition-heavy Hunts.
  await earnGoldWithWelcomeQuest(page.context(), 8);

  await command(page, 'gambling');
  const helpCard = page.getByTestId('gambling-rich-card');
  await expect(helpCard).toBeVisible();
  await expect(helpCard.getByText('Choose a Gold game')).toBeVisible();

  await command(page, 'blackjack 1');
  const blackjack = page.getByTestId('stream-gambling-rich-card').last();
  await expect(blackjack).toBeVisible();
  await expect(blackjack.locator('[data-testid="shared-blackjack-active"], [data-testid="shared-blackjack-result"]')).toBeVisible();
  if (await blackjack.getByTestId('shared-blackjack-active').count()) {
    await blackjack.getByTestId('shared-blackjack-stand').click();
    await expect(page.getByTestId('stream-gambling-rich-card').last().getByTestId('shared-blackjack-result')).toBeVisible();
  }

  await command(page, 'coinflip 1 heads');
  await expect(page.getByTestId('stream-gambling-rich-card').last()).toContainText('Coinflip');
  await expect(page.getByTestId('stream-gambling-rich-card').last()).toContainText(/heads|GOLD/i);
  await command(page, 'slots');
  await expect(page.getByTestId('gambling-rich-card')).toContainText('Slots');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('desktop composer accepts bj 250, keeps Hit/Stand authoritative, and preserves canonical Blackjack', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await login(page, 'j');

  await command(page, 'bj 250');
  let table = page.getByTestId('stream-gambling-rich-card').last();
  await expect(table).toBeVisible();
  await expect(table).toContainText('Wager 250 Gold');
  const active = table.getByTestId('shared-blackjack-active');
  if (await active.count()) {
    await expect(active.getByTestId('shared-blackjack-hit')).toBeVisible();
    await expect(active.getByTestId('shared-blackjack-stand')).toBeVisible();
    await command(page, 'hit');
    await expect.poll(async () => {
      const latest = page.getByTestId('stream-gambling-rich-card').last();
      return await latest.locator('[data-testid="shared-blackjack-active"], [data-testid="shared-blackjack-result"]').count();
    }, { timeout: 7000 }).toBe(1);
    const refreshed = page.getByTestId('stream-gambling-rich-card').last();
    if (await refreshed.getByTestId('shared-blackjack-active').count()) await command(page, 'stand');
    await expect(page.getByTestId('stream-gambling-rich-card').last().getByTestId('shared-blackjack-result')).toBeVisible();
  }

  await command(page, 'blackjack 1');
  table = page.getByTestId('stream-gambling-rich-card').last();
  await expect(table).toContainText('Wager 1 Gold');

  await command(page, 'dg');
  await expect(page.getByTestId('shell-dungeon-card')).toBeVisible();
  await command(page, 'inv');
  await expect(page.getByTestId('stream-inventory-rich-card').last()).toBeVisible();
  await command(page, 'sh');
  await expect(page.getByTestId('stream-shop-rich-card').last()).toBeVisible();
  await command(page, 'st');
  await expect(page.getByTestId('stream-player-status').last()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
});
