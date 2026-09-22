import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivityStreamService } from '../src/application/ActivityStreamService.js';
import { EventBus } from '../src/application/EventBus.js';
import { GameService } from '../src/application/GameService.js';
import { SimpleDungeonService } from '../src/application/SimpleDungeonService.js';
import { SQLiteBankRepository } from '../src/infrastructure/SQLiteBankRepository.js';
import { SQLiteActivityStreamRepository } from '../src/infrastructure/SQLiteActivityStreamRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function setup() {
  let id = 0;
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => `player-${++id}` });
  const eventBus = new EventBus();
  const game = new GameService({ repository, eventBus });
  const simpleDungeon = new SimpleDungeonService({ repository, eventBus });
  const bank = new SQLiteBankRepository({ database: repository.db });
  const streamRepository = new SQLiteActivityStreamRepository({ database: repository.db });
  const activityStream = new ActivityStreamService({ streamRepository, gameRepository: repository });
  eventBus.subscribe((event) => activityStream.recordDomainEvent(event));
  return { repository, game, simpleDungeon, bank, activityStream };
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

test('shared simple rooms auto-resolve once, preserve HP, and emit one replay receipt per command', () => {
  const { repository, game, simpleDungeon, activityStream } = setup();
  const player = game.ensurePlayer({ id: 'shared-room-player', name: 'Shared Room Tester' });
  // Use the published readiness baseline so this test exercises the complete
  // shared replay lifecycle rather than the separate low-gear defeat policy.
  repository.db.prepare('UPDATE players SET base_attack = 9, max_health = 100, current_health = 100 WHERE id = ?').run(player.id);
  const started = simpleDungeon.startDungeon(player.id, 'frayed-hollow');
  let state = repository.getRun(started.id);
  let commandCount = 0;
  let previousRoomEndingHp = null;
  let completion = null;

  for (let step = 0; step < 20 && !['complete', 'failed'].includes(state.phase); step += 1) {
    let result;
    if (state.phase === 'between_encounter') {
      result = game.continueDungeon(player.id, started.id);
      if (previousRoomEndingHp !== null) {
        assert.equal(result.battleReplay.players[0].startingHp, previousRoomEndingHp);
      }
    } else {
      result = game.attack(player.id, started.id);
    }
    commandCount += 1;
    assert.ok(result.battleReplay, 'the shared command returns an immutable replay projection');
    assert.ok(result.battleReplay.beats.length > 0);
    previousRoomEndingHp = result.battleReplay.players[0].endingHp;
    assert.ok(result.battleReplay.players[0].startingHp >= result.battleReplay.players[0].endingHp, 'a room never auto-heals the party');
    state = repository.getRun(started.id);
    const entries = activityStream.recent().filter((entry) => entry.runId === started.id);
    assert.equal(entries.length, commandCount, 'fine-grained combat events do not create extra public receipts');
    assert.ok(entries.every((entry) => entry.eventType === 'CombatActionResolved'));
    if (result.battleReplay.status === 'victory') completion = result;
  }

  assert.equal(state.phase, 'complete');
  assert.ok(completion);
  assert.equal(completion.battleReplay.rewards.length, 1);
  assert.equal(repository.getRun(started.id).rewardsGranted, true);
  assert.equal(activityStream.recent().filter((entry) => entry.runId === started.id && entry.metadata.battleReplay?.status === 'victory').length, 1);
  repository.close();
});

test('Dungeon pause is an authoritative active run and Potion spends persisted inventory atomically', () => {
  const { repository, game, simpleDungeon } = setup();
  const player = game.ensurePlayer({ id: 'dungeon-potion-player', name: 'Potion Tester' });
  const started = simpleDungeon.startDungeon(player.id, 'frayed-hollow');
  attackUntilDecision(game, repository, started.id, player.id);

  const paused = repository.getRun(started.id);
  assert.equal(paused.phase, 'between_encounter');
  assert.equal(repository.getActiveRun(player.id).phase, 'between_encounter');
  assert.ok(paused.participants[0].hp > 0 && paused.participants[0].hp < paused.participants[0].maxHp);
  assert.equal(repository.getPlayer(player.id).healthPotions, 1);

  const result = game.useDungeonPotion(player.id, started.id);
  assert.equal(result.recovery.method, 'dungeon_health_potion');
  assert.equal(result.recovery.healed, paused.participants[0].maxHp - paused.participants[0].hp);
  assert.equal(result.recovery.healthPotions, 0);
  assert.equal(result.battleReplay.status, 'room_clear');
  assert.equal(result.battleReplay.recovery.currentHealth, 40);
  assert.equal(repository.getRun(started.id).phase, 'between_encounter');
  assert.ok(repository.getRun(started.id).participants[0].hp > 0);
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
