import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { SHARED_REPLAY_BEAT_MS, replayMoments } from '../../frontend/src/battle/sharedReplay.js';
import { resolveShellAsset } from '../../frontend/src/shell/presentation.js';
import { isLegacyGenericItemAsset, legacyItemVisualAssetId } from '../../public/item-asset-policy.js';
import { VISUAL_ASSETS } from '../../public/visual-asset-catalog.js';
import { AREA_CONTENT } from '../../src/content/AreaContentCatalog.js';
import { fulfillLegacyReplay } from './legacy-replay-fixture.js';

const REVIEW_DIR = 'ux-review';
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function dashboard(context) {
  const response = await context.request.get('/api/dashboard');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function login(page, slot) {
  await page.goto('/');
  await page.getByTestId(`local-login-${slot}`).click();
  await page.context().request.post('/api/party/leave');
  await page.goto('/game');
  await expect(page.getByTestId('stream-message')).toBeVisible();
}

async function command(page, value) {
  await expect(page.getByTestId('stream-busy')).toHaveCount(0);
  await page.getByTestId('stream-message').fill(value);
  await page.getByTestId('stream-send').click();
}

async function expectRecentReceiptVisible(page) {
  const log = page.getByTestId('adventure-stream-log');
  const latest = log.locator('.stream-entry').last();
  await expect(latest).toBeVisible();
  await expect.poll(async () => latest.evaluate((entry) => {
    const container = entry.closest('[data-testid="adventure-stream-log"]');
    const entryRect = entry.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const visible = entryRect.top >= containerRect.top && entryRect.bottom <= containerRect.bottom;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
    return visible && nearBottom;
  }), { timeout: 10000 }).toBe(true);
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

async function replayUnitState(card) {
  return card.locator('.shared-battle-unit').evaluateAll((units) => units.map((unit) => ({
    id: unit.dataset.combatantId,
    hp: unit.querySelector('.shared-battle-hp b')?.textContent || null,
    mana: unit.querySelector('[data-testid^="shared-battle-mana-"]')?.getAttribute('data-mana') || null,
    effects: unit.querySelector('[data-testid^="shared-battle-effects-"]')?.innerText || '',
  })));
}

async function readVisibleStats(card) {
  const statRows = card.locator('.shell-stat-grid--five .shell-stat');
  await expect(statRows.first()).toBeVisible();
  return statRows.evaluateAll((rows) => Object.fromEntries(rows.map((row) => [
    row.querySelector('span')?.textContent?.trim(),
    row.querySelector('strong')?.textContent?.trim(),
  ])));
}

test('two Weavers clear the first Area gate, travel, and meet a stronger Area 2 Hunt', async ({ browser }) => {
  test.setTimeout(180_000);
  const leaderContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const partnerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const leader = await leaderContext.newPage();
  const partner = await partnerContext.newPage();
  let runId = null;

  try {
    await login(leader, 'l');
    await login(partner, 'm');
    await leader.route('**/api/dungeons/brightbell-trial/start-shared', fulfillLegacyReplay);
    await leader.route(/\/api\/stream(?:\?.*)?$/, fulfillLegacyReplay);
    await partner.route(/\/api\/stream(?:\?.*)?$/, fulfillLegacyReplay);

    await command(leader, 'inventory');
    await expect(leader.getByTestId('stream-inventory-rich-card').last()).toBeVisible();
    await command(leader, 'quest');
    let questCard = leader.getByTestId('quest-rich-card');
    const initialQuestBoardResponse = await leaderContext.request.get('/api/quests');
    expect(initialQuestBoardResponse.ok()).toBe(true);
    const initialQuestBoard = await initialQuestBoardResponse.json();
    const welcomeDefinition = initialQuestBoard.quests.find((quest) => quest.id === 'welcome-to-bellbloom');
    expect(welcomeDefinition).toBeTruthy();
    const welcomeQuest = questCard.locator('[data-testid="quest-row"][data-quest-id="welcome-to-bellbloom"]');
    await welcomeQuest.getByTestId('quest-accept-welcome-to-bellbloom').click();
    await expect(questCard).toHaveCount(0);
    await expectRecentReceiptVisible(leader);
    await command(leader, 'quest');
    questCard = leader.getByTestId('quest-rich-card');
    await expect(questCard.locator('[data-testid="quest-row"][data-quest-id="welcome-to-bellbloom"]')).toContainText('active');
    await command(leader, 'area');
    const areaBeforeChallenge = leader.getByTestId('area-rich-card');
    await areaBeforeChallenge.locator('[data-npc-id="mae-bramble"]').getByRole('button', { name: 'Talk' }).first().click();
    await expect(leader.getByTestId('stream-npc-rich-card').last()).toContainText('Your road report is still open.');
    await expect(areaBeforeChallenge).toHaveCount(0);
    await expectRecentReceiptVisible(leader);
    mkdirSync(REVIEW_DIR, { recursive: true });
    await leader.screenshot({ path: `${REVIEW_DIR}/react-area-interaction-receipt-mobile.png` });
    await command(leader, 'quest');
    questCard = leader.getByTestId('quest-rich-card');
    await questCard.getByTestId('quest-claim-welcome-to-bellbloom').click();
    await expect(leader.getByTestId('stream-quest-reward').last()).toContainText('Welcome to Bellbloom');
    await expect(questCard).toHaveCount(0);
    await expectRecentReceiptVisible(leader);
    await command(leader, 'quest');
    questCard = leader.getByTestId('quest-rich-card');
    const replacementOffers = questCard.locator('[data-testid="quest-row"][data-quest-id]:has(.quest-state--available)');
    await expect(replacementOffers).toHaveCount(3);
    const replacementBoardResponse = await leaderContext.request.get('/api/quests');
    expect(replacementBoardResponse.ok()).toBe(true);
    const replacementBoard = await replacementBoardResponse.json();
    const availableReplacements = replacementBoard.quests.filter((quest) => quest.state === 'available');
    const objectiveIdentity = (quest) => quest.objectives.map(({ type, targetId, count }) => ({ type, targetId, count }));
    for (const replacement of availableReplacements) {
      expect(replacement.templateId).not.toBe(welcomeDefinition.templateId);
      expect(replacement.title).not.toBe(welcomeDefinition.title);
      expect(objectiveIdentity(replacement)).not.toEqual(objectiveIdentity(welcomeDefinition));
    }
    const renderedReplacementCopy = await replacementOffers.evaluateAll((rows) => rows.map((row) => ({
      title: row.querySelector('h3')?.textContent?.trim() || '',
      objectives: [...row.querySelectorAll('li span')].map((node) => node.textContent?.trim() || ''),
    })));
    expect(renderedReplacementCopy.every((replacement) => replacement.title !== welcomeDefinition.title)).toBe(true);
    expect(renderedReplacementCopy.every((replacement) => JSON.stringify(replacement.objectives) !== JSON.stringify(welcomeDefinition.objectives.map((objective) => objective.label)))).toBe(true);

    const beforeArmor = await dashboard(leaderContext);
    expect(beforeArmor.character.gold).toBeGreaterThanOrEqual(8);
    await command(leader, 'status');
    const statusBeforeArmor = leader.getByTestId('stream-player-status').last();
    const visibleBeforeArmor = await readVisibleStats(statusBeforeArmor);
    await command(leader, 'shop');
    const shop = leader.getByTestId('stream-shop-rich-card').last();
    const armorOffer = shop.locator('[data-testid="stream-shop-item"][data-item-id="bronzeweave-coat"]');
    await expect(armorOffer.locator('img[data-visual-asset-id]')).toHaveAttribute('data-visual-asset-id', 'item.bronzeweave-coat.v1');
    await armorOffer.getByRole('button', { name: 'Inspect Bronzeweave Coat' }).click();
    await armorOffer.getByRole('button', { name: 'Buy' }).click();
    await expect.poll(async () => (await dashboard(leaderContext)).inventory.some((item) => item.source === 'shop:bronzeweave-coat')).toBe(true);
    const purchasedArmor = (await dashboard(leaderContext)).inventory.find((item) => item.source === 'shop:bronzeweave-coat');
    expect(purchasedArmor).toMatchObject({ slot: 'armor', defenseBonus: 1, maxHpBonus: 4, visualAssetId: 'item.bronzeweave-coat.v1' });
    await command(leader, 'inventory');
    const inventoryCard = leader.getByTestId('stream-inventory-rich-card').last();
    const armorTile = inventoryCard.locator(`[data-testid="stream-inventory-item"][data-item-id="${purchasedArmor.id}"]`);
    await expect(armorTile.locator('img[data-visual-asset-id]')).toHaveAttribute('data-visual-asset-id', 'item.bronzeweave-coat.v1');
    await armorTile.getByRole('button', { name: 'Inspect Bronzeweave Coat' }).click();
    await armorTile.getByRole('button', { name: 'Equip' }).click();
    await expect.poll(async () => (await dashboard(leaderContext)).character.equipment.armor?.id).toBe(purchasedArmor.id);
    await command(leader, 'inventory');
    const equippedInventory = leader.getByTestId('stream-inventory-rich-card').last();
    await expect(equippedInventory.getByTestId('equipment-slot-armor')).toContainText('Bronzeweave Coat');
    await expect(equippedInventory.getByTestId('equipment-slot-armor').locator('img')).toHaveAttribute('data-visual-asset-id', 'item.bronzeweave-coat.v1');
    await command(leader, 'status');
    const statusAfterArmor = leader.getByTestId('stream-player-status').last();
    const visibleAfterArmor = await readVisibleStats(statusAfterArmor);
    expect(Number(visibleAfterArmor.Attack)).toBe(Number(visibleBeforeArmor.Attack));
    expect(Number(visibleAfterArmor.Defense)).toBe(Number(visibleBeforeArmor.Defense) + 1);
    expect(Number(visibleAfterArmor['Max HP'])).toBe(Number(visibleBeforeArmor['Max HP']) + 4);
    await expect(statusAfterArmor.getByTestId('equipment-slot-armor')).toContainText('Bronzeweave Coat');

    const beforeLevelHunt = await dashboard(leaderContext);
    expect(beforeLevelHunt.character.level).toBe(1);
    await command(leader, 'hunt');
    const levelHuntCard = leader.getByTestId('stream-hunt-rich-card').last();
    await expect(levelHuntCard.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete', { timeout: 30000 });
    const levelHuntStream = await (await leaderContext.request.get('/api/stream')).json();
    const levelHuntEntry = levelHuntStream.entries.filter((entry) => entry.eventType === 'HuntResolved').at(-1);
    expect(levelHuntEntry?.metadata?.leveledUp).toBe(true);
    await leader.reload();
    await expect(leader.getByTestId('stream-connection')).toHaveText(/LIVE/);
    const reconnectedLevelHuntCard = leader.getByTestId('stream-hunt-rich-card').last();
    await expect(reconnectedLevelHuntCard.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete', { timeout: 30000 });
    await expect(reconnectedLevelHuntCard.getByTestId('hunt-level-up')).toContainText('Max HP +3');
    const afterLevelHunt = await dashboard(leaderContext);
    expect(afterLevelHunt.character.level).toBe(2);
    expect(afterLevelHunt.character.maxHealth).toBe(beforeLevelHunt.character.maxHealth + 3);

    const readyPartner = await dashboard(partnerContext);
    expect(readyPartner.character.currentHealth).toBe(readyPartner.character.maxHealth);
    expect(readyPartner.character.healthPotions).toBeGreaterThan(0);

    const created = await leaderContext.request.post('/api/party/create');
    expect(created.ok()).toBe(true);
    const joinCode = (await created.json()).party.joinCode;
    expect((await partnerContext.request.post('/api/party/join', { data: { joinCode } })).ok()).toBe(true);
    expect((await partnerContext.request.post('/api/party/ready', { data: { ready: true } })).ok()).toBe(true);
    await leader.reload();
    await partner.reload();

    await command(partner, 'area');
    const partnerAreaBeforeChallenge = partner.getByTestId('area-rich-card');
    await expect(partnerAreaBeforeChallenge.getByTestId('area-recommended-level')).toContainText('Recommended Level 1–6');
    await expect(partnerAreaBeforeChallenge.getByTestId('next-area-recommended-level')).toContainText('Recommended Level 7–12');

    await command(leader, 'dungeon');
    const chooser = leader.getByTestId('shell-dungeon-card');
    await expect(chooser).toBeVisible();
    await chooser.locator('.shell-dungeon-choice').filter({ hasText: 'Brightbell Parade Trial' }).click();
    const startResponse = leader.waitForResponse((response) => response.url().endsWith('/api/dungeons/brightbell-trial/start-shared') && response.request().method() === 'POST');
    await chooser.getByTestId('dungeon-start-brightbell-trial').click();
    const started = await startResponse;
    expect(started.ok()).toBe(true);
    let result = await started.json();
    let run = result.run;
    runId = run.id;
    expect(run.simpleCombat).toBe(true);
    expect(result.battleReplay.actions.some((action) => action.actionType === 'skill' && action.manaBefore === 100 && action.manaAfter === 0)).toBe(true);
    const replayEnemyIds = new Set((result.battleReplay.enemies || []).map((enemy) => String(enemy.combatantId || enemy.id || '')));
    expect(result.battleReplay.enemies.every((enemy) => Number.isFinite(enemy.startingMana)
      && Number.isFinite(enemy.maxMana)
      && enemy.maxMana > 0
      && enemy.signatureSkill?.name)).toBe(true);
    const enemySkillAction = result.battleReplay.actions.find((action) => action.actionType === 'skill'
      && replayEnemyIds.has(String(action.actorCombatantId || action.actorId || '')));
    expect(enemySkillAction).toBeTruthy();
    const moments = replayMoments(result.battleReplay);
    const skillMomentIndex = moments.findIndex((moment) => moment.actionType === 'skill');
    expect(skillMomentIndex).toBeGreaterThanOrEqual(0);
    const battleStream = await (await leaderContext.request.get('/api/stream')).json();
    const battleEntry = battleStream.entries.find((entry) => entry.metadata?.battleReplay?.battleId === result.battleReplay.battleId);
    expect(battleEntry).toBeTruthy();
    const replayPlayerIds = new Set((result.battleReplay.players || []).map((player) => String(player.id || player.playerId || '')));
    const playerManaGain = (event) => event.reason === 'basic-attack' && Number(event.delta) > 0 && replayPlayerIds.has(String(event.combatantId || event.targetId || ''));
    const manaMomentIndex = moments.findIndex((moment) => moment.manaEvents?.some(playerManaGain));
    expect(manaMomentIndex).toBeGreaterThanOrEqual(0);
    const manaEvent = moments[manaMomentIndex].manaEvents.find(playerManaGain);
    const playbackAtMana = Date.parse(battleEntry.createdAt) + manaMomentIndex * SHARED_REPLAY_BEAT_MS + SHARED_REPLAY_BEAT_MS / 2;

    await leader.reload();
    await expect(leader.getByTestId('stream-connection')).toHaveText(/LIVE/);
    await Promise.all([pinReplayClock(leader, playbackAtMana), pinReplayClock(partner, playbackAtMana)]);
    const reconnectCard = leader.getByTestId('stream-dungeon-rich-card').last();
    const reconnectReplay = reconnectCard.getByTestId('shared-battle-surface');
    await expect(reconnectReplay).toHaveAttribute('data-replay-state', 'playing', { timeout: 7000 });
    expect(await reconnectReplay.getAttribute('data-replay-battle-id')).toContain(runId);
    await expect(reconnectCard.locator('[data-testid^="shared-battle-player"]')).toHaveCount(2);
    await expect(reconnectCard.locator('[data-testid^="shared-battle-enemy"]')).toHaveCount(2);
    await expect(reconnectCard.locator('[data-testid^="shared-battle-mana-"]')).toHaveCount(4);
    await expect(reconnectCard.locator('[data-testid^="shared-battle-enemy"] .shared-battle-signature')).toHaveCount(2);
    const partnerLiveCard = partner.getByTestId('stream-dungeon-rich-card').last();
    const partnerLiveReplay = partnerLiveCard.getByTestId('shared-battle-surface');
    await expect(partnerLiveReplay).toHaveAttribute('data-replay-state', 'playing', { timeout: 7000 });
    expect(await partnerLiveReplay.getAttribute('data-replay-battle-id')).toBe(await reconnectReplay.getAttribute('data-replay-battle-id'));

    await expect(reconnectCard.getByTestId(`shared-battle-mana-${manaEvent.combatantId}`)).toHaveAttribute('data-mana', String(manaEvent.manaAfter));
    await expect(partnerLiveCard.getByTestId(`shared-battle-mana-${manaEvent.combatantId}`)).toHaveAttribute('data-mana', String(manaEvent.manaAfter));
    await expect(reconnectCard.getByTestId('shared-battle-status-updates')).toContainText(`+${manaEvent.delta} Mana`);
    await expect(partnerLiveCard.getByTestId('shared-battle-status-updates')).toContainText(`+${manaEvent.delta} Mana`);
    expect(await replayUnitState(reconnectCard)).toEqual(await replayUnitState(partnerLiveCard));

    const changedPlayer = result.battleReplay.players.find((player) => {
      const playerId = String(player.playerId || player.id || '');
      const committed = run.participants.find((participant) => String(participant.playerId || participant.id || '') === playerId);
      return committed && Number(player.startingHp) !== Number(committed.hp);
    });
    expect(changedPlayer).toBeTruthy();
    const changedPlayerId = String(changedPlayer.playerId || changedPlayer.id);
    const changedParticipant = run.participants.find((participant) => String(participant.playerId || participant.id || '') === changedPlayerId);
    const changedPlayerPage = changedPlayerId === String((await dashboard(leaderContext)).character.id) ? leader : partner;
    await expect(changedPlayerPage.getByTestId('game-shell-health')).toHaveText(`${changedPlayer.startingHp}/${changedParticipant.maxHp}`);
    await expect(changedPlayerPage.getByTestId('live-context-health')).toHaveText(`${changedPlayer.startingHp}/${changedParticipant.maxHp}`);

    const enemySkillMomentIndex = moments.findIndex((moment) => moment.actionType === 'skill' && replayEnemyIds.has(String(moment.actorId || '')));
    expect(enemySkillMomentIndex).toBeGreaterThanOrEqual(0);
    const playbackAtSkill = Date.parse(battleEntry.createdAt) + enemySkillMomentIndex * SHARED_REPLAY_BEAT_MS + SHARED_REPLAY_BEAT_MS / 2;
    await Promise.all([pinReplayClock(leader, playbackAtSkill), pinReplayClock(partner, playbackAtSkill)]);
    const enemySkillActorId = String(enemySkillAction.actorCombatantId || enemySkillAction.actorId);
    await expect(reconnectReplay.locator('.shared-battle-action-label')).toContainText(enemySkillAction.skillName || enemySkillAction.skillId);
    await expect(reconnectCard.getByTestId(`shared-battle-mana-${enemySkillActorId}`)).toHaveAttribute('data-mana', String(enemySkillAction.actorManaAfter ?? enemySkillAction.manaAfter));
    await expect(partnerLiveReplay.locator('.shared-battle-action-label')).toContainText(enemySkillAction.skillName || enemySkillAction.skillId);
    await expect(partnerLiveCard.getByTestId(`shared-battle-mana-${enemySkillActorId}`)).toHaveAttribute('data-mana', String(enemySkillAction.actorManaAfter ?? enemySkillAction.manaAfter));
    expect(await replayUnitState(reconnectCard)).toEqual(await replayUnitState(partnerLiveCard));
    await Promise.all([restoreReplayClock(leader), restoreReplayClock(partner)]);
    expect(await reconnectCard.locator('[data-testid="shared-battle-enemy"]').evaluateAll((units) => units.map((unit) => unit.getAttribute('data-combatant-id')))).toEqual(
      await partnerLiveCard.locator('[data-testid="shared-battle-enemy"]').evaluateAll((units) => units.map((unit) => unit.getAttribute('data-combatant-id'))),
    );

    let replaySkillSeen = result.battleReplay.actions.some((action) => action.actionType === 'skill');
    let terminalReplay = null;
    let sharedHealObservedForBoth = false;
    for (let step = 0; step < 8 && run.phase !== 'complete'; step += 1) {
      expect(run.phase).not.toBe('failed');
      const leaderCard = leader.getByTestId('stream-dungeon-rich-card').last();
      await expect(leaderCard.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete', { timeout: 30000 });

      if (run.phase === 'between_encounter') {
        const needsHeal = run.participants.some((participant) => participant.hp < participant.maxHp);
        if (needsHeal && !run.intermissionPotionClaimedWindowId) {
          const healers = await Promise.all([
            { page: leader, context: leaderContext },
            { page: partner, context: partnerContext },
          ].map(async (candidate) => ({ ...candidate, dashboard: await dashboard(candidate.context) })));
          const claimant = healers.find(({ dashboard: playerState }) => {
            const participant = run.participants.find((entry) => entry.playerId === playerState.character.id);
            return participant?.hp > 0 && playerState.character.healthPotions > 0;
          });
          if (claimant) {
            const claimantCard = claimant.page.getByTestId('stream-dungeon-rich-card').last();
            const heal = claimantCard.getByTestId('stream-run-potion');
            if (await heal.isEnabled()) {
              const healResponse = claimant.page.waitForResponse((response) => response.url().endsWith(`/api/runs/${encodeURIComponent(runId)}/potion`) && response.request().method() === 'POST');
              await heal.click();
              expect((await healResponse).ok()).toBe(true);
              const claimantId = claimant.dashboard.character.id;
              await expect.poll(async () => (await dashboard(leaderContext)).activeRun?.intermissionPotionClaimedByPlayerId || null, { timeout: 7000 }).toBe(claimantId);
              const leaderCard = leader.getByTestId('stream-dungeon-rich-card').last();
              const partnerCard = partner.getByTestId('stream-dungeon-rich-card').last();
              await expect(leaderCard.getByTestId('stream-run-potion')).toBeDisabled({ timeout: 7000 });
              await expect(partnerCard.getByTestId('stream-run-potion')).toBeDisabled({ timeout: 7000 });
              await expect(leaderCard.getByTestId('intermission-heal-status')).toContainText('Shared intermission Heal used');
              await expect(partnerCard.getByTestId('intermission-heal-status')).toContainText('Shared intermission Heal used');
              sharedHealObservedForBoth = true;
              run = (await (await dashboard(partnerContext)).activeRun) || run;
            }
          }
        }

        // Hold the replay clock just before the server commits the next room.
        // This keeps a terminal Area unlock genuinely pending while both
        // clients receive and render its receipt.
        const continueReplayClock = Date.now();
        await Promise.all([pinReplayClock(leader, continueReplayClock), pinReplayClock(partner, continueReplayClock)]);
        const continueResponse = leader.waitForResponse((response) => response.url().endsWith(`/api/runs/${encodeURIComponent(runId)}/continue`) && response.request().method() === 'POST');
        await leaderCard.getByTestId('stream-run-continue').click();
        const continued = await continueResponse;
        expect(continued.ok()).toBe(true);
        result = await continued.json();
        run = result.run;
        const partnerReplayCard = partner.getByTestId('stream-dungeon-rich-card').filter({ has: partner.getByTestId('shared-battle-surface') }).last();
        const partnerReplaySurface = partnerReplayCard.getByTestId('shared-battle-surface');
        await expect(partnerReplaySurface).toHaveAttribute('data-replay-battle-id', result.battleReplay.battleId, { timeout: 7000 });
        await expect(partnerReplaySurface).toHaveAttribute('data-replay-state', 'playing', { timeout: 7000 });
        expect(await partnerReplayCard.locator('[data-testid="shared-battle-enemy"]').evaluateAll((units) => units.map((unit) => unit.dataset.combatantId))).toEqual(
          (result.battleReplay.enemies || []).map((enemy) => enemy.combatantId || enemy.id),
        );
        terminalReplay = result.battleReplay;
        replaySkillSeen ||= (result.battleReplay?.actions || []).some((action) => action.actionType === 'skill');
        if (run.phase !== 'complete') {
          await Promise.all([restoreReplayClock(leader), restoreReplayClock(partner)]);
        }
      } else {
        throw new Error(`Unexpected challenge phase ${run.phase}.`);
      }
    }

    expect(run.phase).toBe('complete');
    expect(sharedHealObservedForBoth).toBe(true);
    expect(replaySkillSeen).toBe(true);
    expect(terminalReplay?.status).toBe('victory');
    expect(terminalReplay?.rewards).toHaveLength(2);
    expect(terminalReplay.rewards.every(({ item }) => String(item.visualAssetId || '').startsWith('item.'))).toBe(true);

    const terminalStreamResponse = await partnerContext.request.get('/api/stream');
    expect(terminalStreamResponse.ok()).toBe(true);
    const terminalStream = await terminalStreamResponse.json();
    const terminalEntry = terminalStream.entries.find((entry) => entry.metadata?.battleReplay?.battleId === terminalReplay.battleId);
    expect(terminalEntry?.metadata?.battleReplay?.areaUnlocks?.some((unlock) => unlock.areaNumber === 2)).toBe(true);
    const terminalReplayClock = Date.parse(terminalEntry.createdAt) + 1;
    await Promise.all([pinReplayClock(leader, terminalReplayClock), pinReplayClock(partner, terminalReplayClock)]);

    const finalCard = leader.getByTestId('stream-dungeon-rich-card').last();
    await expect(finalCard.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'playing', { timeout: 7000 });
    const partnerFinalCard = partner.getByTestId('stream-dungeon-rich-card').last();
    await expect(partnerFinalCard.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'playing', { timeout: 7000 });
    const areaTwoBeforeReplayComplete = partnerAreaBeforeChallenge.locator('.shell-area-row').filter({ hasText: 'Emberglass Orchard' });
    await expect(areaTwoBeforeReplayComplete).toContainText('Battle replay in progress');
    await expect(areaTwoBeforeReplayComplete.getByRole('button', { name: 'Travel' })).toHaveCount(0);
    await command(leader, 'dungeon');
    const gatedChooser = leader.getByTestId('shell-dungeon-card');
    await expect(gatedChooser).toContainText('Replay in progress');
    await expect(gatedChooser.getByTestId('dungeon-start-brightbell-trial')).toHaveCount(0);
    await Promise.all([restoreReplayClock(leader), restoreReplayClock(partner)]);
    await expect(finalCard.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete', { timeout: 30000 });
    await expect(partnerFinalCard.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete', { timeout: 30000 });
    await expect(finalCard.getByTestId('dungeon-replay-rewards')).toBeVisible();
    const rewardArt = finalCard.getByTestId('dungeon-replay-rewards').locator('img[data-visual-asset-id]');
    await expect(rewardArt).toHaveCount(2);
    expect(await rewardArt.evaluateAll((images) => images.map((image) => image.getAttribute('data-visual-asset-id')).sort())).toEqual(
      terminalReplay.rewards.map(({ item }) => resolveShellAsset(item, VISUAL_ASSETS, ['item'])?.id).sort(),
    );
    await expect(leader.getByTestId('shell-dungeon-card').locator('[data-testid^="dungeon-start-"]').first()).toBeVisible();

    const unlockedAreaOnOpenPartnerCard = partnerAreaBeforeChallenge.locator('.shell-area-row').filter({ hasText: 'Emberglass Orchard' });
    await expect(unlockedAreaOnOpenPartnerCard.getByRole('button', { name: 'Travel' })).toBeEnabled({ timeout: 10000 });
    await partner.reload();
    await expect(partner.getByTestId('stream-connection')).toHaveText(/LIVE/);
    const reconnectedTerminalCard = partner.getByTestId('stream-dungeon-rich-card').last();
    await expect(reconnectedTerminalCard.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete');
    await expect(reconnectedTerminalCard.getByTestId('dungeon-replay-rewards').locator('img[data-visual-asset-id]')).toHaveCount(2);
    await expect(reconnectedTerminalCard.getByTestId('shared-battle-result')).toContainText('VICTORY');

    await command(leader, 'area');
    const areaCard = leader.getByTestId('area-rich-card');
    await expect(areaCard).toBeVisible();
    const unlockedArea = areaCard.locator('.shell-area-row').filter({ hasText: 'Emberglass Orchard' });
    await expect(unlockedArea.getByRole('button', { name: 'Travel' })).toBeEnabled();
    await unlockedArea.getByRole('button', { name: 'Travel' }).click();
    await expect(areaCard).toHaveCount(0);
    await expectRecentReceiptVisible(leader);
    await command(leader, 'area');
    await expect(areaCard).toContainText('CURRENT');
    await expect(areaCard).toContainText('Emberglass Orchard');
    const leaderAreaResponse = await leaderContext.request.get('/api/areas');
    const partnerAreaResponse = await partnerContext.request.get('/api/areas');
    expect(leaderAreaResponse.ok()).toBe(true);
    expect(partnerAreaResponse.ok()).toBe(true);
    const leaderArea = (await leaderAreaResponse.json()).area;
    const partnerArea = (await partnerAreaResponse.json()).area;
    expect(leaderArea.highestUnlockedAreaNumber).toBe(2);
    expect(partnerArea.highestUnlockedAreaNumber).toBe(2);
    expect(leaderArea.currentArea).toMatchObject({ id: 'area-2', number: 2, name: 'Emberglass Orchard' });
    const orchardTown = leaderArea.towns.find((town) => town.id === 'area-2-town');
    expect(orchardTown).toMatchObject({
      id: 'area-2-town',
      name: 'Emberglass Waystation',
      areaNumber: 2,
      services: expect.arrayContaining(['shop', 'upgrade', 'heal', 'quest']),
    });
    expect(orchardTown.npcs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'area-2-shopkeeper', name: 'Tavi Emberglass', service: 'shop' }),
      expect.objectContaining({ id: 'area-2-guide', name: 'Orin Copperspoon', service: 'quest' }),
    ]));

    await command(leader, 'quest');
    questCard = leader.getByTestId('quest-rich-card');
    await expect(questCard).toContainText('Emberglass Orchard');
    await expect(questCard).toContainText('Warm crystal fruit keeps the orchard bright after sunset.');
    const areaTwoQuestBoardResponse = await leaderContext.request.get('/api/quests');
    expect(areaTwoQuestBoardResponse.ok()).toBe(true);
    const areaTwoQuestBoard = await areaTwoQuestBoardResponse.json();
    expect(areaTwoQuestBoard.currentArea).toMatchObject({ id: 'area-2', number: 2, name: 'Emberglass Orchard' });
    expect(areaTwoQuestBoard.quests.length).toBeGreaterThan(0);
    expect(areaTwoQuestBoard.quests.every((quest) => quest.areaNumber === 2 && quest.townId === 'area-2-town')).toBe(true);
    expect(areaTwoQuestBoard.quests).toEqual(expect.arrayContaining([
      expect.objectContaining({
        templateId: 'orchard-patrol',
        areaNumber: 2,
        townId: 'area-2-town',
      }),
    ]));
    mkdirSync(REVIEW_DIR, { recursive: true });
    await questCard.screenshot({ path: `${REVIEW_DIR}/react-progression-area-2-mobile.png` });

    await command(leader, 'area');
    const orchardTownCard = leader.getByTestId('area-rich-card').last();
    const orchardGuide = orchardTownCard.locator('[data-npc-id="area-2-guide"]');
    await expect(orchardGuide).toBeVisible();
    const orchardTalkResponsePromise = leader.waitForResponse((response) => response.url().endsWith('/api/towns/area-2-town/npcs/area-2-guide/interact')
      && response.request().method() === 'POST');
    await orchardGuide.getByRole('button', { name: 'Talk' }).click();
    const orchardTalkResponse = await orchardTalkResponsePromise;
    expect(orchardTalkResponse.ok()).toBe(true);
    expect((await orchardTalkResponse.json()).interaction).toMatchObject({
      townId: 'area-2-town',
      townName: 'Emberglass Waystation',
      areaNumber: 2,
      npcId: 'area-2-guide',
      npcName: 'Orin Copperspoon',
    });
    await expect(leader.getByTestId('stream-npc-rich-card').last()).toContainText(/festival road|orchard path/);
    const areaTwoInteractionStreamResponse = await leaderContext.request.get('/api/stream?limit=20');
    expect(areaTwoInteractionStreamResponse.ok()).toBe(true);
    const areaTwoInteractionStream = await areaTwoInteractionStreamResponse.json();
    const orchardInteraction = areaTwoInteractionStream.entries.find((entry) => entry.eventType === 'NpcInteracted'
      && entry.metadata?.townId === 'area-2-town'
      && entry.metadata?.npcId === 'area-2-guide');
    expect(orchardInteraction?.metadata).toMatchObject({
      townId: 'area-2-town',
      townName: 'Emberglass Waystation',
      areaNumber: 2,
      npcId: 'area-2-guide',
      npcName: 'Orin Copperspoon',
    });
    await expect(orchardTownCard).toHaveCount(0);
    await expectRecentReceiptVisible(leader);

    const leaderBeforeAreaTwoHunt = await dashboard(leaderContext);
    if (leaderBeforeAreaTwoHunt.character.currentHealth <= 0) {
      await command(leader, 'inventory');
      const inventoryCard = leader.getByTestId('stream-inventory-rich-card').last();
      await expect(leader.getByTestId('stream-busy')).toHaveCount(0);
      await expect(inventoryCard.locator('.stream-potion-row').first()).toContainText('Minor Health Potion');
      const healResponse = leader.waitForResponse((response) => response.url().endsWith('/api/recovery/potion') && response.request().method() === 'POST');
      await expect(inventoryCard.getByRole('button', { name: /Heal/ })).toBeEnabled();
      await inventoryCard.getByRole('button', { name: /Heal/ }).click();
      expect((await healResponse).ok()).toBe(true);
      expect((await dashboard(leaderContext)).character.currentHealth).toBeGreaterThan(0);
    }

    await command(leader, 'hunt');
    const huntCard = leader.getByTestId('stream-hunt-rich-card').last();
    await expect(huntCard.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete', { timeout: 30000 });
    const stream = await (await leaderContext.request.get('/api/stream')).json();
    const huntEntry = stream.entries.filter((entry) => entry.eventType === 'HuntResolved').at(-1);
    const areaOneHp = AREA_CONTENT[0].huntEncounters.map((encounter) => encounter.hp);
    const areaTwoHp = AREA_CONTENT[1].huntEncounters.map((encounter) => encounter.hp);
    const areaOneEncounter = AREA_CONTENT[0].huntEncounters.find((encounter) => encounter.id === levelHuntEntry?.metadata?.enemyId);
    const areaTwoEncounter = AREA_CONTENT[1].huntEncounters.find((encounter) => encounter.id === huntEntry?.metadata?.enemyId);
    expect(Math.min(...areaTwoHp)).toBeGreaterThan(Math.max(...areaOneHp));
    expect(AREA_CONTENT[1].huntEncounters.some((encounter) => encounter.id === huntEntry?.metadata?.enemyId)).toBe(true);
    expect(AREA_CONTENT[0].huntEncounters.some((encounter) => encounter.id === huntEntry?.metadata?.enemyId)).toBe(false);
    expect(areaTwoEncounter.gold).toBeGreaterThan(areaOneEncounter.gold);
    expect(areaTwoEncounter.dropChance).toBeGreaterThan(areaOneEncounter.dropChance);
    expect(AREA_CONTENT[1].rarityWeights.rare).toBeGreaterThan(AREA_CONTENT[0].rarityWeights.rare);
    await expect(huntCard).toContainText(huntEntry.metadata.enemyName);
    expect(await leader.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    await leader.goto('/codex');
    await expect(leader.getByTestId('codex-status')).not.toHaveText('Loading…');
    const codexItemsResponse = await leaderContext.request.get('/api/codex?category=items');
    expect(codexItemsResponse.ok()).toBe(true);
    const codexItems = (await codexItemsResponse.json()).entries;
    const rewardIds = new Set(terminalReplay.rewards.map(({ item }) => item.id));
    const codexReward = codexItems.find((entry) => rewardIds.has(entry.id)) || codexItems[0];
    expect(codexReward).toBeTruthy();
    await leader.getByTestId('codex-tab-items').click();
    await expect(leader.getByTestId('codex-status')).not.toHaveText('Loading…');
    await leader.getByTestId('codex-search').fill(codexReward.title);
    const codexRewardRow = leader.locator(`[data-testid="codex-entry"][data-entry-id="${codexReward.id}"]`);
    await expect(codexRewardRow).toBeVisible();
    const explicitCodexAsset = VISUAL_ASSETS.find((asset) => asset.id === codexReward.visualAssetId);
    const expectedCodexArt = explicitCodexAsset && !isLegacyGenericItemAsset(explicitCodexAsset)
      ? explicitCodexAsset.id
      : legacyItemVisualAssetId(codexReward, VISUAL_ASSETS);
    expect(expectedCodexArt).toBeTruthy();
    await expect(codexRewardRow.getByTestId('codex-entry-art')).toHaveAttribute('data-visual-asset-id', expectedCodexArt);
    await codexRewardRow.click();
    await expect(leader.getByTestId('codex-detail')).toHaveAttribute('data-category', 'items');
    await expect(leader.getByTestId('codex-detail-title')).toHaveText(codexReward.title);
    await expect(codexRewardRow.getByTestId('codex-entry-art')).toHaveAttribute('data-visual-asset-id', expectedCodexArt);
    await expect(leader.getByTestId('codex-detail-art')).toHaveAttribute('data-visual-asset-id', expectedCodexArt);
    const expectedStatLabels = [
      ['attackBonus', 'Attack'],
      ['defenseBonus', 'Defense'],
      ['maxHpBonus', 'Max HP'],
      ['speedBonus', 'Speed'],
    ].filter(([key]) => Number(codexReward.mechanics?.[key]) > 0)
      .map(([key, label]) => `+${codexReward.mechanics[key]} ${label}`);
    if (Number(codexReward.mechanics?.critChanceBonus) > 0) {
      expectedStatLabels.push(`+${Math.round(Number(codexReward.mechanics.critChanceBonus) * 100)}% Crit`);
    }
    for (const stat of expectedStatLabels) await expect(codexRewardRow).toContainText(stat);

    await leader.goto('/game');
    await command(leader, 'area');
    const areaOneRow = leader.getByTestId('area-rich-card').locator('.shell-area-row[data-area-number="1"]');
    await expect(areaOneRow.getByRole('button', { name: 'Travel' })).toBeVisible();
    const returnTravel = leader.waitForResponse((response) => response.url().endsWith('/api/areas/1/travel') && response.request().method() === 'POST');
    await areaOneRow.getByRole('button', { name: 'Travel' }).click();
    expect((await returnTravel).ok()).toBe(true);
    await expect(leader.getByTestId('area-rich-card')).toHaveCount(0);
    await expectRecentReceiptVisible(leader);
    await command(leader, 'area');
    const returnedAreaOneRow = leader.getByTestId('area-rich-card').locator('.shell-area-row[data-area-number="1"]');
    await expect(returnedAreaOneRow).toContainText('CURRENT');
    await command(leader, 'leaderboard');
    const guildCard = leader.getByTestId('leaderboard-rich-card');
    const rival = guildCard.locator('[data-testid^="leaderboard-row-"]').filter({ hasText: 'Rook' }).first();
    await expect(rival).toBeVisible();
    await rival.getByRole('button', { name: /Duel/ }).click();
    const finalDuel = leader.getByTestId('stream-duel-rich-card').last();
    const finalDuelReplay = finalDuel.getByTestId('shared-battle-surface');
    await expect(finalDuelReplay).toHaveAttribute('data-replay-state', 'playing', { timeout: 7000 });
    await expect(finalDuelReplay.locator('[data-testid^="shared-battle-player"]')).toHaveCount(1);
    await expect(finalDuelReplay.locator('[data-testid^="shared-battle-enemy"]')).toHaveCount(1);
    await expect(finalDuelReplay.locator('[data-testid^="shared-battle-mana-"]')).toHaveCount(2);
    await expect(finalDuel.locator('[data-testid^="duel-loadout-"]')).not.toHaveCount(0);
    await expect(finalDuelReplay).toHaveAttribute('data-replay-state', 'complete', { timeout: 30000 });
    await expect(finalDuelReplay.getByTestId('shared-battle-result')).toContainText(/VICTORY|DEFEAT|DRAW/);
  } finally {
    for (const context of [leaderContext, partnerContext]) {
      try {
        const activeRun = (await dashboard(context)).activeRun;
        if (activeRun?.id) await context.request.post(`/api/runs/${encodeURIComponent(activeRun.id)}/retreat`);
      } catch {}
      await context.request.post('/api/party/leave').catch(() => {});
    }
    await leaderContext.close();
    await partnerContext.close();
  }
});
