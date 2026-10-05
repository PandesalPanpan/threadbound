import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/application/EventBus.js';
import { GameService } from '../src/application/GameService.js';
import { AdventureRun, DUNGEONS } from '../src/domain/AdventureRun.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

test('a reloaded tactical-era run resolves its persisted room with the arena and keeps run upgrades and pending reaction', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:' });
  const firstService = new GameService({ repository, eventBus: new EventBus(), idFactory: () => 'legacy-arena-run' });
  const player = firstService.ensurePlayer({ id: 'legacy-arena-player', name: 'Arena Migrant' });
  repository.db.prepare('UPDATE players SET base_attack = 100, max_health = 100, current_health = 100 WHERE id = ?').run(player.id);
  const started = firstService.startDungeon(player.id, 'frayed-hollow');
  const saved = repository.getRun(started.id);
  saved.runAttackBonus = 3;
  saved.selectedUpgrades = ['sharpen'];
  saved.participants[0].reactionDamageBonus = 2;
  saved.enemyIntent = {
    id: 'saved-wisp-intent',
    enemyId: saved.enemy.id,
    targetPlayerId: player.id,
    reaction: 'guard',
    createdAt: '2026-10-01T00:00:00.000Z',
  };
  const persistedBefore = repository.saveRun(saved);

  // A newly constructed service represents another process after reconnect.
  const resumedService = new GameService({ repository, eventBus: new EventBus() });
  const result = resumedService.guard(player.id, started.id);
  const persisted = repository.getRun(started.id);
  const arenaPlayer = result.battleReplay.arenaReplay.combatants.find((unit) => unit.id === player.id);

  assert.equal(saved.simpleCombat, false);
  assert.equal(result.battleReplay.arenaReplay.kind, 'arena-combat-replay');
  assert.equal(result.battleReplay.arenaReplay.context.legacyIntent.id, 'saved-wisp-intent');
  assert.equal(arenaPlayer.attack, 103, 'saved run Attack remains part of the real Arena combatant');
  assert.equal(arenaPlayer.firstActionDamageBonus, 2, 'a primed reaction remains a one-action combat bonus');
  assert.ok(result.events.some((event) => event.type === 'CombatReactionSucceeded' && event.reaction === 'guard'));
  assert.equal(persisted.simpleCombat, false, 'migration keeps the legacy run lifecycle and chosen power');
  assert.equal(persisted.arenaCombatVersion, 1);
  assert.equal(persisted.selectedUpgrades[0], 'sharpen');
  assert.equal(persisted.lastBattleReplay.kind, 'arena-combat-replay');
  assert.equal(persisted.version, persistedBefore.version + 1);
  repository.close();
});

test('the legacy Revive command restores a downed Weaver into the authoritative arena roster', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:' });
  const game = new GameService({ repository, eventBus: new EventBus() });
  const rescuer = game.ensurePlayer({ id: 'arena-rescuer', name: 'Rescuer' });
  const downed = game.ensurePlayer({ id: 'arena-downed', name: 'Downed Weaver' });
  repository.db.prepare('UPDATE players SET base_attack = 100, max_health = 100, current_health = 100 WHERE id IN (?, ?)').run(rescuer.id, downed.id);
  const run = AdventureRun.start({
    id: 'legacy-revive-arena-run',
    ownerType: 'player',
    ownerId: rescuer.id,
    startedByPlayerId: rescuer.id,
    participants: [
      { playerId: rescuer.id, maxHealth: 100, currentHealth: 100 },
      { playerId: downed.id, maxHealth: 100, currentHealth: 100 },
    ],
    dungeonId: 'frayed-hollow',
    dungeonDefinition: DUNGEONS['frayed-hollow'],
  });
  const state = run.toJSON();
  state.participants.find((participant) => participant.playerId === downed.id).hp = 0;
  repository.createRun(state);

  const result = game.revive(rescuer.id, run.state.id, downed.id);
  const arenaRoster = result.battleReplay.arenaReplay.combatants;
  const restored = repository.getRun(run.state.id).participants.find((participant) => participant.playerId === downed.id);

  assert.ok(result.events.some((event) => event.type === 'PlayerRevived' && event.targetPlayerId === downed.id));
  assert.equal(arenaRoster.find((unit) => unit.id === downed.id).hp, 30);
  assert.ok(restored.hp > 0);
  assert.equal(repository.getRun(run.state.id).lastBattleReplay.kind, 'arena-combat-replay');
  repository.close();
});
