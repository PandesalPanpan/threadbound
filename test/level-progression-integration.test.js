import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/application/EventBus.js';
import { GameService } from '../src/application/GameService.js';
import { HuntService } from '../src/application/HuntService.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { SQLitePlayerProgressionRepository } from '../src/infrastructure/SQLitePlayerProgressionRepository.js';

test('existing players start at zero XP and Hunt progression is persisted and projected', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-level' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'legacy-user', displayName: 'Adventurer' });

  // The progression table is additive. A player created before this repository exists
  // has no migration row yet and must project safely as Level 1 / 0 XP.
  const progressionRepository = new SQLitePlayerProgressionRepository({ database: repository.db });
  assert.deepEqual(progressionRepository.get(player.id), {
    playerId: player.id,
    experience: 0,
    updatedAt: null,
  });

  progressionRepository.addExperience(player.id, 40);
  const events = [];
  const eventBus = new EventBus();
  eventBus.subscribe((event) => events.push(event));
  const rolls = [0.99, 0.99, 0.99];
  const huntService = new HuntService({
    repository,
    progressionRepository,
    eventBus,
    rng: () => rolls.shift() ?? 0.99,
  });

  const result = huntService.hunt(player.id);
  assert.equal(result.enemy.name, 'Thread Wolf');
  assert.equal(result.experience, 20);
  assert.equal(result.progression.experience, 60);
  assert.equal(result.progression.level, 2);
  assert.equal(result.leveledUp, true);
  assert.equal(result.levelsGained, 1);
  assert.equal(progressionRepository.get(player.id).experience, 60);

  const huntEvent = events.find((event) => event.type === 'HuntResolved');
  assert.equal(huntEvent.experienceGained, 20);
  assert.equal(huntEvent.xp, 20);
  assert.equal(huntEvent.experience, 60);
  assert.equal(huntEvent.level, 2);
  assert.equal(huntEvent.leveledUp, true);
  assert.equal(huntEvent.levelsGained, 1);

  const gameService = new GameService({ repository, progressionRepository, eventBus });
  const dashboard = gameService.dashboard(player.id);
  assert.equal(dashboard.character.experience, 60);
  assert.equal(dashboard.character.xp, 60);
  assert.equal(dashboard.character.level, 2);
  assert.equal(dashboard.character.levelProgression.experienceIntoLevel, 10);
  assert.equal(dashboard.character.levelProgression.experienceToNextLevel, 90);

  repository.close();
});

test('a failed Hunt grants neither Gold nor XP', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-failed-hunt' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'failed-user', displayName: 'Adventurer' });
  repository.setPlayerHealth(player.id, 4);
  const progressionRepository = new SQLitePlayerProgressionRepository({ database: repository.db });
  const events = [];
  const eventBus = new EventBus();
  eventBus.subscribe((event) => events.push(event));
  const huntService = new HuntService({ repository, progressionRepository, eventBus, rng: () => 0.99 });

  const result = huntService.hunt(player.id);
  assert.equal(result.victory, false);
  assert.equal(result.gold, 0);
  assert.equal(result.experience, 0);
  assert.equal(progressionRepository.get(player.id).experience, 0);
  assert.equal(repository.getPlayer(player.id).threadDust, 0);

  const huntEvent = events.find((event) => event.type === 'HuntResolved');
  assert.equal(huntEvent.experienceGained, 0);
  assert.equal(huntEvent.level, 1);
  assert.equal(huntEvent.leveledUp, false);

  repository.close();
});
