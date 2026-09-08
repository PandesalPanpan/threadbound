import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/application/EventBus.js';
import { GameService } from '../src/application/GameService.js';
import { DungeonRun } from '../src/domain/DungeonRun.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

test('GameService exposes the skill catalog and persists one rich skill result', () => {
  let sequence = 0;
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => `player-${++sequence}` });
  const bus = new EventBus();
  const events = [];
  bus.subscribe((event) => events.push(event));
  const game = new GameService({ repository, eventBus: bus, idFactory: () => 'skills-service-run' });
  const player = game.ensurePlayer({ id: 'threaded-1', name: 'Skill Tester' });
  const started = game.startDungeon(player.id, 'frayed-hollow');

  const initialDashboard = game.dashboard(player.id);
  assert.deepEqual(initialDashboard.combatSkills.map((skill) => skill.id), ['piercing-stitch', 'severing-knot', 'mending-chorus']);
  assert.equal(initialDashboard.activeRun.viewer.focus, 0);
  assert.equal(initialDashboard.activeRun.viewer.maxFocus, 4);

  game.attack(player.id, started.id);
  game.attack(player.id, started.id); // first enemy defeated; Focus carries into encounter two
  const focused = game.dashboard(player.id);
  assert.equal(focused.activeRun.viewer.focus, 2);

  const outcome = game.useSkill(player.id, started.id, 'piercing-stitch');
  assert.equal(outcome.skillId, 'piercing-stitch');
  assert.equal(outcome.state.viewer.focus, 0);
  assert.equal(outcome.state.viewer.skillCooldowns['piercing-stitch'], 2);
  assert.equal(outcome.state.enemy.statuses.exposed, 1);

  const publicResult = events.filter((event) => event.type === 'CombatActionResolved').at(-1);
  assert.equal(publicResult.action, 'skill');
  assert.equal(publicResult.skillId, 'piercing-stitch');
  assert.equal(publicResult.actorFocus, 0);
  assert.equal(publicResult.actorMaxFocus, 4);
  assert.equal(publicResult.actorSkillCooldowns['piercing-stitch'], 2);
  assert.equal(publicResult.enemyStatuses.exposed, 1);
  repository.close();
});

test('optimistic run versioning prevents two stale skill spends from both committing', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-1' });
  const bus = new EventBus();
  const game = new GameService({ repository, eventBus: bus, idFactory: () => 'skills-race-run' });
  const player = game.ensurePlayer({ id: 'threaded-1', name: 'Race Tester' });
  const started = game.startDungeon(player.id, 'frayed-hollow');

  const seeded = repository.getRun(started.id);
  seeded.participants[0].focus = 4;
  repository.saveRun(seeded);

  const sameVersionA = repository.getRun(started.id);
  const sameVersionB = repository.getRun(started.id);
  assert.equal(sameVersionA.version, sameVersionB.version);

  const first = new DungeonRun(sameVersionA);
  const second = new DungeonRun(sameVersionB);
  first.useSkill({ playerId: player.id, skillId: 'piercing-stitch', attackPower: 6 });
  second.useSkill({ playerId: player.id, skillId: 'piercing-stitch', attackPower: 6 });

  const committed = repository.saveRun(first.toJSON());
  assert.equal(committed.participants[0].focus, 2);
  assert.throws(
    () => repository.saveRun(second.toJSON()),
    (error) => error?.code === 'stale_run_version',
  );
  assert.equal(repository.getRun(started.id).participants[0].focus, 2);
  repository.close();
});
