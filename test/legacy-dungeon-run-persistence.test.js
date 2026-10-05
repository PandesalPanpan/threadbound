import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/application/EventBus.js';
import { GameService } from '../src/application/GameService.js';
import { AdventureRun, DUNGEONS } from '../src/domain/AdventureRun.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

test('a SQLite-hydrated pre-upgrade automatic Dungeon is migrated by its next action', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:' });
  const game = new GameService({ repository, eventBus: new EventBus() });
  const player = game.ensurePlayer({ id: 'legacy-dungeon-player', name: 'Legacy Dungeon Player' });
  repository.db.prepare('UPDATE players SET base_attack = 1, max_health = 100, current_health = 100 WHERE id = ?').run(player.id);

  const legacyState = AdventureRun.startSimple({
    id: 'pre-upgrade-active-run',
    ownerType: 'player',
    ownerId: player.id,
    startedByPlayerId: player.id,
    participants: [{ playerId: player.id, maxHealth: 100, currentHealth: 100 }],
    dungeonId: 'frayed-hollow',
    dungeonDefinition: DUNGEONS['frayed-hollow'],
    sharedSurface: false,
    now: '2026-09-23T00:00:00.000Z',
  }).toJSON();

  // Represent the old persisted shape: one authoritative `enemy`, no versioned
  // roster, and no combatant ID added by the current compatibility projection.
  delete legacyState.enemies;
  delete legacyState.simpleCombatVersion;
  delete legacyState.enemy.combatantId;
  legacyState.enemy.hp = 100;
  legacyState.enemy.maxHp = 100;

  repository.createRun(legacyState);
  repository.db.prepare('UPDATE dungeon_runs SET state_json = ?, version = 0 WHERE id = ?')
    .run(JSON.stringify(legacyState), legacyState.id);

  const loaded = repository.getActiveRun(player.id);
  assert.equal(loaded.id, legacyState.id);
  assert.equal(loaded.version, 0, 'SQLite supplies the stored optimistic-lock version');
  assert.equal(loaded.sharedSurface, false);
  assert.equal('simpleCombatVersion' in loaded, false, 'the stored pre-upgrade payload remains untouched on read');
  assert.equal('enemies' in loaded, false);
  assert.equal('combatantId' in loaded.enemy, false);

  const dashboardRun = game.dashboard(player.id).activeRun;
  assert.equal(dashboardRun.id, legacyState.id);
  assert.equal(dashboardRun.enemies.length, 1, 'the service projects the old singleton enemy for readers');
  assert.equal(dashboardRun.enemies[0].id, legacyState.enemy.id);

  const enemyHpBefore = loaded.enemy.hp;
  const result = game.attack(player.id, legacyState.id);
  const persisted = repository.getRun(legacyState.id);

  assert.equal(result.simpleCombat, true);
  assert.ok(result.battleReplay.arenaReplay, 'the next legacy action records the authoritative arena replay');
  assert.equal(persisted.phase, 'combat');
  assert.equal(persisted.sharedSurface, false);
  assert.equal(persisted.simpleCombatVersion, 2, 'the persisted v1 run is upgraded at the command boundary');
  assert.equal(persisted.enemies.length, 1);
  assert.equal(persisted.enemies[0].id, loaded.enemy.id);
  assert.ok(persisted.enemy.hp >= 0 && persisted.enemy.hp <= enemyHpBefore);
  assert.equal(persisted.enemies[0].hp, persisted.enemy.hp, 'the compatibility roster mirrors the authoritative singleton enemy');
  assert.equal(persisted.lastBattleReplay.kind, 'arena-combat-replay');
  assert.equal(persisted.version, 1, 'the resumed state saves through the normal repository version check');

  repository.close();
});
