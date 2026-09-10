import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/application/EventBus.js';
import { CombatPreviewService } from '../src/application/CombatPreviewService.js';
import { GameService } from '../src/application/GameService.js';
import { AdventureRun, RUN_UPGRADES } from '../src/domain/AdventureRun.js';
import { DungeonRun } from '../src/domain/DungeonRun.js';
import { decorateRunUpgradeOffers, offeredRunUpgradeIds, RUN_UPGRADE_OFFER_VERSION } from '../src/domain/RunUpgradeOfferPolicy.js';
import { SQLiteActivityStreamRepository } from '../src/infrastructure/SQLiteActivityStreamRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function reactiveTurn(game, repository, runId, playerId) {
  const state = repository.getRun(runId);
  if (state.enemyIntent) {
    if (state.enemyIntent.reaction === 'interrupt') return game.interrupt(playerId, runId);
    return game.guard(playerId, runId);
  }
  return game.attack(playerId, runId);
}

test('combat preview simulates the authoritative aggregate without mutating the run', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-preview' });
  const events = new EventBus();
  const game = new GameService({ repository, eventBus: events, idFactory: () => 'run-preview' });
  const previewService = new CombatPreviewService({ repository });
  const player = game.ensurePlayer({ id: 'threaded-preview', name: 'Preview Weaver' });
  const run = game.startDungeon(player.id, 'frayed-hollow');
  const before = repository.getRun(run.id);

  const preview = previewService.preview(player.id, run.id);
  assert.equal(preview.runId, run.id);
  assert.equal(preview.runVersion, before.version);
  assert.equal(preview.actions.attack.available, true);
  assert.ok(preview.actions.attack.damage > 0);
  assert.equal(repository.getRun(run.id).version, before.version, 'preview must not persist cloned simulation state');
  assert.equal(repository.getRun(run.id).enemy.hp, before.enemy.hp);

  const result = game.attack(player.id, run.id);
  assert.equal(result.damage, preview.actions.attack.damage);
  assert.equal(result.state.enemy.hp, preview.actions.attack.enemyHpAfter);
  assert.equal(result.state.viewer.hp, preview.actions.attack.actorHpAfter);
  repository.close();
});

test('run power catalog remains readable for legacy persisted runs without entering the new loop', () => {
  const catalog = Object.values(RUN_UPGRADES);
  assert.ok(catalog.length >= 10, 'legacy run power vocabulary remains available for compatibility');
  const run = { id: 'offer-run-a', phase: 'upgrade', runUpgradeOfferVersion: RUN_UPGRADE_OFFER_VERSION, runUpgradeOfferIds: [], runUpgradeDraftIndex: 0 };
  const first = offeredRunUpgradeIds(run, catalog);
  const repeated = offeredRunUpgradeIds(run, catalog);
  assert.deepEqual(repeated, first);
  assert.equal(first.length, 3);

  const cards = decorateRunUpgradeOffers(run, catalog);
  assert.equal(cards.length, 3);
  assert.deepEqual(new Set(cards.map((card) => card.category)), new Set(['OFFENSE', 'SUSTAIN', 'TECHNIQUE']));
  assert.ok(cards.every((card) => card.description && card.effectSummary.length > 0));

  const later = offeredRunUpgradeIds({ ...run, runUpgradeDraftIndex: 1 }, catalog);
  assert.equal(later.length, 3);
  assert.notDeepEqual(later, first);
});

test('AdventureRun aggregate rejects powers outside a persisted legacy offer', () => {
  const combat = DungeonRun.start({
    id: 'offer-enforcement',
    ownerType: 'player',
    ownerId: 'p1',
    startedByPlayerId: 'p1',
    dungeonId: 'frayed-hollow',
    participants: [{ playerId: 'p1', maxHealth: 40 }],
  });
  const state = combat.toJSON();
  state.phase = 'upgrade';
  state.enemy = null;
  state.streamlinedLoop = false;
  state.runUpgradeOfferVersion = RUN_UPGRADE_OFFER_VERSION;
  state.runUpgradeOfferIds = ['sharpen', 'reinforce', 'riposte'];
  state.runUpgradeDraftIndex = 0;
  const run = new AdventureRun(state);
  assert.throws(() => run.chooseUpgrade('disrupt'), /offered powers/i);
  const chosen = run.chooseUpgrade('sharpen');
  assert.equal(chosen.state.phase, 'boss');
  assert.equal(chosen.state.selectedUpgrade, 'sharpen');
  assert.deepEqual(chosen.state.selectedUpgrades, ['sharpen']);
});

test('a new run flows through normal fights directly into the boss without temporary run choices', () => {
  let sequence = 0;
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => `player-${++sequence}` });
  const game = new GameService({ repository, eventBus: new EventBus(), idFactory: () => 'simple-run' });
  const player = game.ensurePlayer({ id: 'threaded-simple-run', name: 'Flow Weaver' });
  const started = game.startDungeon(player.id, 'frayed-hollow');

  let state = repository.getRun(started.id);
  assert.equal(state.streamlinedLoop, true);
  assert.equal(state.runEventSchedule, null);
  assert.equal(state.runPowerDraftsEnabled, false);
  assert.equal(state.selectedUpgrades.length, 0);

  // Normal encounters advance without interrupting the shared chat with a run-card draft.
  for (let guard = 0; guard < 120 && repository.getRun(started.id).phase === 'combat'; guard += 1) {
    reactiveTurn(game, repository, started.id, player.id);
  }
  state = repository.getRun(started.id);
  assert.equal(state.phase, 'boss');
  assert.equal(state.enemy?.isBoss, true);
  assert.equal(state.runEvent, null);
  assert.equal(state.runEventHistory.length, 0);
  assert.equal(state.runUpgradeResume, null);
  assert.equal(state.runUpgradeOfferIds.length, 0);
  assert.equal(state.runUpgradeDraftIndex, 0);
  assert.equal(state.runAttackBonus, 0);
  assert.equal(state.selectedUpgrade, null);
  assert.equal(state.selectedUpgrades.length, 0);
  repository.close();
});

test('persisted repeated-draft runs can still finish their legacy between-fight decision', () => {
  const run = AdventureRun.start({
    id: 'legacy-draft-run',
    ownerType: 'player',
    ownerId: 'p1',
    startedByPlayerId: 'p1',
    dungeonId: 'frayed-hollow',
    participants: [{ playerId: 'p1', maxHealth: 40 }],
  });
  // Explicitly model a state saved by the retired loop. New runs never set these flags.
  run.state.streamlinedLoop = false;
  run.state.runPowerDraftsEnabled = true;

  for (let guard = 0; guard < 20 && run.toJSON().phase === 'combat' && run.toJSON().encounterIndex === 0; guard += 1) {
    const state = run.toJSON();
    if (state.enemyIntent?.reaction === 'interrupt') run.interrupt({ playerId: 'p1' });
    else if (state.enemyIntent) run.guard({ playerId: 'p1' });
    else run.attack({ playerId: 'p1', attackPower: 8 });
  }

  const waiting = run.toJSON();
  assert.equal(waiting.phase, 'upgrade');
  assert.ok(waiting.runUpgradeResume?.enemy);
  const offered = offeredRunUpgradeIds(waiting, Object.values(RUN_UPGRADES));
  const chosen = run.chooseUpgrade(offered[0]);
  assert.equal(chosen.state.phase, 'combat');
  assert.equal(chosen.state.encounterIndex, 1);
});

test('activity stream pages backward without loading the full retained timeline', () => {
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'unused-player' });
  let id = 0;
  const stream = new SQLiteActivityStreamRepository({ database: gameRepository.db, idFactory: () => `entry-${++id}` });
  for (let index = 1; index <= 65; index += 1) {
    stream.append({ kind: 'system', eventType: 'TestEvent', body: `Entry ${index}` });
  }

  const latest = stream.listPage({ limit: 30 });
  assert.equal(latest.entries.length, 30);
  assert.equal(latest.entries[0].body, 'Entry 36');
  assert.equal(latest.entries.at(-1).body, 'Entry 65');
  assert.equal(latest.hasMore, true);

  const older = stream.listPage({ limit: 24, beforeId: latest.entries[0].id });
  assert.equal(older.entries.length, 24);
  assert.equal(older.entries[0].body, 'Entry 12');
  assert.equal(older.entries.at(-1).body, 'Entry 35');
  assert.equal(older.hasMore, true);
  assert.equal(new Set([...latest.entries, ...older.entries].map((entry) => entry.id)).size, 54);
  gameRepository.close();
});
