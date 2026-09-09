import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/application/EventBus.js';
import { CombatPreviewService } from '../src/application/CombatPreviewService.js';
import { GameService } from '../src/application/GameService.js';
import { AdventureRun } from '../src/domain/AdventureRun.js';
import { DungeonRun, RUN_UPGRADES } from '../src/domain/DungeonRun.js';
import { decorateRunUpgradeOffers, offeredRunUpgradeIds } from '../src/domain/RunUpgradeOfferPolicy.js';
import { SQLiteActivityStreamRepository } from '../src/infrastructure/SQLiteActivityStreamRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

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

test('run upgrade offer policy returns a stable three-card draft with readable effects', () => {
  const run = { id: 'offer-run-a', phase: 'upgrade', runUpgradeOfferVersion: 1, runUpgradeOfferIds: [] };
  const catalog = Object.values(RUN_UPGRADES);
  const first = offeredRunUpgradeIds(run, catalog);
  const second = offeredRunUpgradeIds(run, catalog);
  assert.deepEqual(second, first);
  assert.equal(first.length, 3);
  assert.ok(first.includes('sharpen'));

  const cards = decorateRunUpgradeOffers(run, catalog);
  assert.equal(cards.length, 3);
  assert.ok(cards.every((card) => card.description && card.category && card.effectSummary.length > 0));
});

test('AdventureRun aggregate rejects powers outside its snapshotted offer', () => {
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
  state.runUpgradeOfferVersion = 1;
  state.runUpgradeOfferIds = ['sharpen', 'reinforce', 'riposte'];
  const run = new AdventureRun(state);
  assert.throws(() => run.chooseUpgrade('disrupt'), /offered powers/i);
  const chosen = run.chooseUpgrade('sharpen');
  assert.equal(chosen.state.phase, 'boss');
  assert.equal(chosen.state.selectedUpgrade, 'sharpen');
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
