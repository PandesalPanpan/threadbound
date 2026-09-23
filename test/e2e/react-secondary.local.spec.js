import { test, expect } from '@playwright/test';
import { SHARED_REPLAY_BEAT_MS, replayMoments } from '../../frontend/src/battle/sharedReplay.js';

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

async function pinReplayClock(page, timestamp) {
  await page.evaluate((value) => {
    window.__threadboundNativeDateNow ||= Date.now.bind(Date);
    Date.now = () => value;
  }, timestamp);
}

async function restoreReplayClock(page) {
  await page.evaluate(() => {
    if (window.__threadboundNativeDateNow) Date.now = window.__threadboundNativeDateNow;
  });
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

  await rival.getByRole('button', { name: /Duel/ }).click();
  const duelCard = page.getByTestId('stream-duel-rich-card').last();
  await expect(duelCard).toBeVisible();
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
  const duelMoments = replayMoments(duelReplay);
  const duelPlayerIds = new Set((duelReplay.details?.teams?.players || []).map((player) => String(player.id || player.playerId || '')));
  const playerManaGain = (event) => event.reason === 'basic-attack'
    && Number(event.delta) > 0
    && duelPlayerIds.has(String(event.combatantId || event.targetId || ''));
  const manaGainMomentIndex = duelMoments.findIndex((moment) => moment.manaEvents?.some(playerManaGain));
  expect(manaGainMomentIndex).toBeGreaterThanOrEqual(0);
  const manaGain = duelMoments[manaGainMomentIndex].manaEvents.find(playerManaGain);
  const playbackAtManaGain = Date.parse(duelEntry.createdAt) + manaGainMomentIndex * SHARED_REPLAY_BEAT_MS + SHARED_REPLAY_BEAT_MS / 2;
  await pinReplayClock(page, playbackAtManaGain);
  await expect(replay.getByTestId(`shared-battle-mana-${manaGain.combatantId}`)).toHaveAttribute('data-mana', String(manaGain.manaAfter));
  await expect(replay.getByTestId('shared-battle-status-updates')).toContainText(`+${manaGain.delta} Mana`);

  const skillMomentIndex = duelMoments.findIndex((moment) => moment.actionType === 'skill');
  expect(skillMomentIndex).toBeGreaterThanOrEqual(0);
  const skillTurn = duelTurns[duelSkillTurnIndex];
  const playbackAtSkill = Date.parse(duelEntry.createdAt) + skillMomentIndex * SHARED_REPLAY_BEAT_MS + SHARED_REPLAY_BEAT_MS / 2;
  await pinReplayClock(page, playbackAtSkill);
  await expect(replay.locator('.shared-battle-action-label')).toContainText(skillTurn.skillName || skillTurn.skillId);
  await expect(replay.getByTestId(`shared-battle-mana-${skillTurn.actor.id}`)).toHaveAttribute('data-mana', '0');
  await expect(replay.getByTestId('shared-battle-status-updates')).toContainText('-100 Mana');
  await restoreReplayClock(page);
  await expect(replay).toHaveAttribute('data-replay-state', 'complete', { timeout: 30000 });
  await expect(replay.getByTestId('shared-battle-result')).toContainText(/VICTORY|DEFEAT|DRAW/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
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
  // Seed enough carried Gold for both the Blackjack wager and the follow-up
  // Coinflip even when the Blackjack hand loses its wager.
  for (let index = 0; index < 3; index += 1) {
    const hunt = await page.context().request.post('/api/hunt');
    expect(hunt.ok()).toBe(true);
  }

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
