import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { SHARED_REPLAY_BEAT_MS, replayMoments } from '../../frontend/src/battle/sharedReplay.js';
import { resolveShellAsset } from '../../frontend/src/shell/presentation.js';
import { VISUAL_ASSETS } from '../../public/visual-asset-catalog.js';
import { AREA_CONTENT } from '../../src/content/AreaContentCatalog.js';

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

test('two Weavers clear the first Area gate, travel, and meet a stronger Area 2 Hunt', async ({ browser }) => {
  test.setTimeout(180_000);
  const leaderContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const partnerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const leader = await leaderContext.newPage();
  const partner = await partnerContext.newPage();
  let runId = null;

  try {
    await login(leader, 'c');
    await login(partner, 'd');

    await command(leader, 'quest');
    let questCard = leader.getByTestId('quest-rich-card');
    const welcomeQuest = questCard.locator('[data-testid="quest-row"][data-quest-id="welcome-to-bellbloom"]');
    await welcomeQuest.getByTestId('quest-accept-welcome-to-bellbloom').click();
    await expect(welcomeQuest).toContainText('active');
    await command(leader, 'area');
    const areaBeforeChallenge = leader.getByTestId('area-rich-card');
    await areaBeforeChallenge.locator('[data-npc-id="mae-bramble"]').getByRole('button', { name: 'Talk' }).click();
    await expect(leader.getByTestId('stream-npc-rich-card').last()).toContainText('Your road report is still open.');
    await command(leader, 'quest');
    questCard = leader.getByTestId('quest-rich-card');
    await questCard.getByTestId('quest-claim-welcome-to-bellbloom').click();
    await expect(leader.getByTestId('stream-quest-reward').last()).toContainText('Welcome to Bellbloom');
    await command(leader, 'quest');
    questCard = leader.getByTestId('quest-rich-card');
    const replacementOffers = questCard.locator('[data-testid="quest-row"][data-quest-id]:has(.quest-state--available)');
    await expect(replacementOffers).toHaveCount(3);
    expect(await replacementOffers.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-quest-id')))).not.toContain('welcome-to-bellbloom');
    const beforeLevelHunt = await dashboard(leaderContext);
    expect(beforeLevelHunt.character.level).toBe(1);
    await command(leader, 'hunt');
    const levelHuntCard = leader.getByTestId('stream-hunt-rich-card').last();
    await expect(levelHuntCard.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete', { timeout: 30000 });
    const levelHuntStream = await (await leaderContext.request.get('/api/stream')).json();
    const levelHuntEntry = levelHuntStream.entries.filter((entry) => entry.eventType === 'HuntResolved').at(-1);
    expect(levelHuntEntry?.metadata?.leveledUp).toBe(true);
    await expect(levelHuntCard.getByTestId('hunt-level-up')).toContainText('Max HP +3');
    const afterLevelHunt = await dashboard(leaderContext);
    expect(afterLevelHunt.character.level).toBe(2);
    expect(afterLevelHunt.character.maxHealth).toBe(beforeLevelHunt.character.maxHealth + 3);

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
    const skillMomentIndex = replayMoments(result.battleReplay).findIndex((moment) => moment.actionType === 'skill');
    expect(skillMomentIndex).toBeGreaterThanOrEqual(0);
    const battleStream = await (await leaderContext.request.get('/api/stream')).json();
    const battleEntry = battleStream.entries.find((entry) => entry.metadata?.battleReplay?.battleId === result.battleReplay.battleId);
    expect(battleEntry).toBeTruthy();

    await leader.reload();
    await expect(leader.getByTestId('stream-connection')).toHaveText(/LIVE/);
    const reconnectCard = leader.getByTestId('stream-dungeon-rich-card').last();
    const reconnectReplay = reconnectCard.getByTestId('shared-battle-surface');
    await expect(reconnectReplay).toHaveAttribute('data-replay-state', 'playing', { timeout: 7000 });
    expect(await reconnectReplay.getAttribute('data-replay-battle-id')).toContain(runId);
    await expect(reconnectCard.locator('[data-testid^="shared-battle-player"]')).toHaveCount(2);
    await expect(reconnectCard.locator('[data-testid^="shared-battle-enemy"]')).toHaveCount(2);
    await expect(reconnectCard.locator('[data-testid^="shared-battle-mana-"]')).toHaveCount(2);
    const skillAction = result.battleReplay.actions.find((action) => action.actionType === 'skill');
    const skillActorId = skillAction.actorId;
    const playbackAtSkill = Date.parse(battleEntry.createdAt) + skillMomentIndex * SHARED_REPLAY_BEAT_MS + SHARED_REPLAY_BEAT_MS / 2;
    await leader.evaluate((timestamp) => {
      window.__threadboundNativeDateNow = Date.now.bind(Date);
      Date.now = () => timestamp;
    }, playbackAtSkill);
    await expect(reconnectReplay.locator('.shared-battle-action-label')).toContainText(skillAction.skillName || skillAction.skillId);
    await expect(reconnectCard.getByTestId(`shared-battle-mana-${skillActorId}`)).toHaveAttribute('data-mana', '0');
    await leader.evaluate(() => { if (window.__threadboundNativeDateNow) Date.now = window.__threadboundNativeDateNow; });
    const partnerLiveCard = partner.getByTestId('stream-dungeon-rich-card').last();
    const partnerLiveReplay = partnerLiveCard.getByTestId('shared-battle-surface');
    await expect(partnerLiveReplay).toHaveAttribute('data-replay-state', 'playing', { timeout: 7000 });
    expect(await partnerLiveReplay.getAttribute('data-replay-battle-id')).toBe(await reconnectReplay.getAttribute('data-replay-battle-id'));
    expect(await reconnectCard.locator('[data-testid="shared-battle-enemy"]').evaluateAll((units) => units.map((unit) => unit.getAttribute('data-combatant-id')))).toEqual(
      await partnerLiveCard.locator('[data-testid="shared-battle-enemy"]').evaluateAll((units) => units.map((unit) => unit.getAttribute('data-combatant-id'))),
    );

    let replaySkillSeen = result.battleReplay.actions.some((action) => action.actionType === 'skill');
    let terminalReplay = null;
    for (let step = 0; step < 8 && run.phase !== 'complete'; step += 1) {
      expect(run.phase).not.toBe('failed');
      const leaderCard = leader.getByTestId('stream-dungeon-rich-card').last();
      await expect(leaderCard.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete', { timeout: 30000 });

      if (run.phase === 'between_encounter') {
        const needsHeal = run.participants.some((participant) => participant.hp < participant.maxHp - 8);
        if (needsHeal && !run.intermissionPotionClaimedWindowId) {
          const partnerDashboard = await dashboard(partnerContext);
          if (partnerDashboard.character.healthPotions > 0) {
            const partnerCard = partner.getByTestId('stream-dungeon-rich-card').last();
            const heal = partnerCard.getByTestId('stream-run-potion');
            if (await heal.isEnabled()) {
              const healResponse = partner.waitForResponse((response) => response.url().endsWith(`/api/runs/${encodeURIComponent(runId)}/potion`) && response.request().method() === 'POST');
              await heal.click();
              expect((await healResponse).ok()).toBe(true);
              run = (await (await dashboard(partnerContext)).activeRun) || run;
            }
          }
        }

        const continueResponse = leader.waitForResponse((response) => response.url().endsWith(`/api/runs/${encodeURIComponent(runId)}/continue`) && response.request().method() === 'POST');
        await leaderCard.getByTestId('stream-run-continue').click();
        const continued = await continueResponse;
        expect(continued.ok()).toBe(true);
        result = await continued.json();
        run = result.run;
        terminalReplay = result.battleReplay;
        replaySkillSeen ||= (result.battleReplay?.actions || []).some((action) => action.actionType === 'skill');
      } else {
        throw new Error(`Unexpected challenge phase ${run.phase}.`);
      }
    }

    expect(run.phase).toBe('complete');
    expect(replaySkillSeen).toBe(true);
    expect(terminalReplay?.status).toBe('victory');
    expect(terminalReplay?.rewards).toHaveLength(2);
    expect(terminalReplay.rewards.every(({ item }) => String(item.visualAssetId || '').startsWith('item.'))).toBe(true);

    const finalCard = leader.getByTestId('stream-dungeon-rich-card').last();
    await expect(finalCard.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'playing', { timeout: 7000 });
    await command(leader, 'dungeon');
    const gatedChooser = leader.getByTestId('shell-dungeon-card');
    await expect(gatedChooser).toContainText('Replay in progress');
    await expect(gatedChooser.getByTestId('dungeon-start-brightbell-trial')).toHaveCount(0);
    await expect(finalCard.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete', { timeout: 30000 });
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
    await expect(areaCard).toContainText('CURRENT');
    await expect(areaCard).toContainText('Emberglass Orchard');
    const leaderAreaResponse = await leaderContext.request.get('/api/areas');
    const partnerAreaResponse = await partnerContext.request.get('/api/areas');
    expect((await leaderAreaResponse.json()).area.highestUnlockedAreaNumber).toBe(2);
    expect((await partnerAreaResponse.json()).area.highestUnlockedAreaNumber).toBe(2);

    await command(leader, 'quest');
    questCard = leader.getByTestId('quest-rich-card');
    await expect(questCard).toContainText('Emberglass Orchard');
    await expect(questCard).toContainText('Warm crystal fruit keeps the orchard bright after sunset.');
    mkdirSync(REVIEW_DIR, { recursive: true });
    await questCard.screenshot({ path: `${REVIEW_DIR}/react-progression-area-2-mobile.png` });

    await command(leader, 'hunt');
    const huntCard = leader.getByTestId('stream-hunt-rich-card').last();
    await expect(huntCard.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete', { timeout: 30000 });
    const stream = await (await leaderContext.request.get('/api/stream')).json();
    const huntEntry = stream.entries.filter((entry) => entry.eventType === 'HuntResolved').at(-1);
    const areaOneHp = AREA_CONTENT[0].huntEncounters.map((encounter) => encounter.hp);
    const areaTwoHp = AREA_CONTENT[1].huntEncounters.map((encounter) => encounter.hp);
    expect(Math.min(...areaTwoHp)).toBeGreaterThan(Math.max(...areaOneHp));
    expect(AREA_CONTENT[1].huntEncounters.some((encounter) => encounter.id === huntEntry?.metadata?.enemyId)).toBe(true);
    expect(AREA_CONTENT[0].huntEncounters.some((encounter) => encounter.id === huntEntry?.metadata?.enemyId)).toBe(false);
    await expect(huntCard).toContainText(huntEntry.metadata.enemyName);
    expect(await leader.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    await leader.goto('/codex');
    await expect(leader.getByTestId('codex-status')).not.toHaveText('Loading…');
    await leader.getByTestId('codex-tab-items').click();
    await expect(leader.getByTestId('codex-status')).not.toHaveText('Loading…');
    await expect(leader.getByTestId('codex-detail')).toHaveAttribute('data-category', 'items');
    await expect(leader.getByTestId('codex-entry').first()).toBeVisible();
    await expect(leader.getByTestId('codex-entry-art').first()).toHaveAttribute('data-visual-asset-id', /^item\./);
    await expect(leader.getByTestId('codex-detail-art')).toHaveAttribute('data-visual-asset-id', /^item\./);
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
