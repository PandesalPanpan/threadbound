import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/application/EventBus.js';
import { GameService } from '../src/application/GameService.js';
import { SimpleDungeonService } from '../src/application/SimpleDungeonService.js';
import { SQLiteBankRepository } from '../src/infrastructure/SQLiteBankRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function setup() {
  let id = 0;
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => `player-${++id}` });
  const eventBus = new EventBus();
  const game = new GameService({ repository, eventBus });
  const simpleDungeon = new SimpleDungeonService({ repository, eventBus });
  const bank = new SQLiteBankRepository({ database: repository.db });
  return { repository, game, simpleDungeon, bank };
}

function attackUntilDecision(game, repository, runId, playerId) {
  let result = null;
  for (let step = 0; step < 40; step += 1) {
    const state = repository.getRun(runId);
    if (state.phase === 'between_encounter' || state.phase === 'failed') return result;
    result = game.attack(playerId, runId);
  }
  throw new Error('Dungeon did not reach a decision in the expected number of attacks.');
}

test('Dungeon pause is an authoritative active run and Potion spends persisted inventory atomically', () => {
  const { repository, game, simpleDungeon } = setup();
  const player = game.ensurePlayer({ id: 'dungeon-potion-player', name: 'Potion Tester' });
  const started = simpleDungeon.startDungeon(player.id, 'frayed-hollow');
  attackUntilDecision(game, repository, started.id, player.id);

  const paused = repository.getRun(started.id);
  assert.equal(paused.phase, 'between_encounter');
  assert.equal(repository.getActiveRun(player.id).phase, 'between_encounter');
  assert.equal(paused.participants[0].hp, 31);
  assert.equal(repository.getPlayer(player.id).healthPotions, 1);

  const result = game.useDungeonPotion(player.id, started.id);
  assert.equal(result.recovery.method, 'dungeon_health_potion');
  assert.equal(result.recovery.healed, 9);
  assert.equal(result.recovery.healthPotions, 0);
  assert.equal(repository.getRun(started.id).phase, 'combat');
  assert.equal(repository.getRun(started.id).participants[0].hp, 40);
  assert.equal(repository.getPlayer(player.id).healthPotions, 0);

  assert.throws(() => game.useDungeonPotion(player.id, started.id), /between Dungeon encounters|no health potions|currently in combat/i);
  repository.close();
});

test('Dungeon retreat releases the party run without securing completion reward', () => {
  const { repository, game, simpleDungeon } = setup();
  const player = game.ensurePlayer({ id: 'dungeon-retreat-player', name: 'Retreat Tester' });
  const started = simpleDungeon.startDungeon(player.id, 'frayed-hollow');
  attackUntilDecision(game, repository, started.id, player.id);

  const result = game.retreatDungeon(player.id, started.id);
  assert.equal(result.retreated, true);
  assert.equal(result.run.phase, 'retreated');
  assert.equal(result.run.rewardsGranted, false);
  assert.equal(repository.getActiveRun(player.id), null);
  assert.equal(repository.getRun(started.id).phase, 'retreated');
  repository.close();
});

test('Dungeon defeat applies carried-Gold risk atomically while banked Gold stays safe', () => {
  const { repository, game, simpleDungeon, bank } = setup();
  const player = game.ensurePlayer({ id: 'dungeon-death-player', name: 'Risk Tester' });
  repository.addThreadDust(player.id, 50);
  bank.deposit(player.id, 10);
  const before = bank.getBalance(player.id);
  const started = simpleDungeon.startDungeon(player.id, 'frayed-hollow');

  let state = repository.getRun(started.id);
  for (let step = 0; step < 80 && !['failed', 'complete'].includes(state.phase); step += 1) {
    if (state.phase === 'between_encounter') game.continueDungeon(player.id, started.id);
    else game.attack(player.id, started.id);
    state = repository.getRun(started.id);
  }

  assert.equal(state.phase, 'failed');
  const after = bank.getBalance(player.id);
  assert.equal(after.bankedGold, before.bankedGold);
  assert.equal(after.carriedGold, 32);
  assert.equal(state.deathPenalties[player.id].goldLost, 8);
  assert.equal(repository.getActiveRun(player.id), null);
  repository.close();
});
