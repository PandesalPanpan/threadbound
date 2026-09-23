import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventBus } from '../src/application/EventBus.js';
import { GameService } from '../src/application/GameService.js';
import { HuntService } from '../src/application/HuntService.js';
import { PartyService } from '../src/application/PartyService.js';
import { SimpleDungeonService } from '../src/application/SimpleDungeonService.js';
import { SQLiteAreaRepository } from '../src/infrastructure/SQLiteAreaRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function setup() {
  let playerSequence = 0;
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => `health-player-${++playerSequence}` });
  const eventBus = new EventBus();
  const game = new GameService({ repository, eventBus });
  const simpleDungeon = new SimpleDungeonService({ repository, eventBus });
  const hunt = new HuntService({ repository, eventBus, huntCooldownSeconds: 0, rng: () => 0.99 });
  const parties = new PartyService({ repository, idFactory: () => 'health-party-1', joinCodeFactory: () => 'HEALTH1' });
  const areas = new SQLiteAreaRepository({ database: repository.db });
  return { repository, game, simpleDungeon, hunt, parties, areas };
}

function setStats(repository, playerId, { maxHealth = 40, currentHealth = maxHealth, baseAttack = 6 } = {}) {
  repository.db.prepare('UPDATE players SET max_health = ?, current_health = ?, base_attack = ?, health_updated_at = ? WHERE id = ?')
    .run(maxHealth, currentHealth, baseAttack, new Date().toISOString(), playerId);
}

function assertPersistentHpMatchesRun(repository, run) {
  for (const participant of run.participants) {
    assert.equal(repository.getPlayer(participant.playerId).currentHealth, participant.hp, `persistent HP should match ${participant.playerId}`);
  }
}

test('Dungeon inherits one persistent HP pool, syncs every checkpoint, and Hunt resumes from the committed HP', () => {
  const { repository, game, simpleDungeon, hunt } = setup();
  const player = game.ensurePlayer({ id: 'health-cross-activity', name: 'Cross Activity Weaver' });
  setStats(repository, player.id, { maxHealth: 100, currentHealth: 60, baseAttack: 9 });

  const started = simpleDungeon.startDungeon(player.id, 'frayed-hollow');
  assert.equal(started.participants[0].hp, 60);
  assert.equal(repository.getPlayer(player.id).currentHealth, 60);

  let state = repository.getRun(started.id);
  for (let step = 0; step < 12 && !['complete', 'failed'].includes(state.phase); step += 1) {
    if (state.phase === 'between_encounter') game.continueDungeon(player.id, started.id);
    else game.attack(player.id, started.id);
    state = repository.getRun(started.id);
    assertPersistentHpMatchesRun(repository, state);
  }

  assert.equal(state.phase, 'complete');
  const committedHealth = state.participants[0].hp;
  assert.ok(committedHealth > 0);
  const nextHunt = hunt.hunt(player.id);
  assert.equal(nextHunt.startingHp, committedHealth);
  repository.close();
});

test('party Dungeon entry preserves each Weaver’s own wounded-but-living HP and blocks zero HP', () => {
  const { repository, game, simpleDungeon, parties } = setup();
  const leader = game.ensurePlayer({ id: 'health-party-leader', name: 'Peter' });
  const partner = game.ensurePlayer({ id: 'health-party-partner', name: 'Isa' });
  setStats(repository, leader.id, { currentHealth: 22 });
  setStats(repository, partner.id, { currentHealth: 35 });

  parties.createParty(leader.id);
  parties.joinParty(partner.id, 'health1');
  parties.setReady(partner.id, true);

  const readiness = simpleDungeon.readiness(leader.id, 'frayed-hollow');
  assert.deepEqual(readiness.members.map((member) => member.currentHealth), [22, 35]);
  const started = simpleDungeon.startDungeon(leader.id, 'frayed-hollow');
  assert.deepEqual(started.participants.map((participant) => participant.hp), [22, 35]);
  assertPersistentHpMatchesRun(repository, repository.getRun(started.id));

  repository.saveRun({ ...repository.getRun(started.id), phase: 'retreated' });
  repository.setPlayerHealth(partner.id, 0);
  const blockedReadiness = simpleDungeon.readiness(leader.id, 'frayed-hollow');
  const blockedMember = blockedReadiness.members.find((member) => member.playerId === partner.id);
  assert.equal(blockedMember.canEnter, false);
  assert.match(blockedMember.healthError, /too wounded/i);
  parties.setReady(partner.id, true);
  assert.throws(() => simpleDungeon.startDungeon(leader.id, 'frayed-hollow'), (error) => error.code === 'too_wounded_to_enter_dungeon' && error.playerId === partner.id);
  repository.close();
});

test('passive recovery pauses on active Dungeon HP and resumes from the final committed exit HP', () => {
  const { repository, game, simpleDungeon } = setup();
  const player = game.ensurePlayer({ id: 'health-recovery', name: 'Recovery Weaver' });
  setStats(repository, player.id, { maxHealth: 100, currentHealth: 30, baseAttack: 9 });
  const started = simpleDungeon.startDungeon(player.id, 'frayed-hollow', { sharedSurface: false });
  const oldTimestamp = new Date(Date.now() - 5 * 60 * 1000 - 1000).toISOString();
  repository.db.prepare('UPDATE players SET health_updated_at = ? WHERE id = ?').run(oldTimestamp, player.id);

  const activePlayer = repository.getPlayer(player.id);
  assert.equal(activePlayer.currentHealth, 30, 'active run HP must not lazily regenerate');
  const activeDashboard = game.dashboard(player.id);
  assert.equal(activeDashboard.character.currentHealth, 30);
  assert.deepEqual(activeDashboard.character.healthRecovery, { nextHealthInSeconds: 0, fullHealthInSeconds: 0 });

  const room = game.resolveSimpleEncounter(player.id, started.id);
  assert.equal(room.run.phase, 'between_encounter');
  const retreated = game.retreatDungeon(player.id, started.id);
  const finalHealth = retreated.run.viewer.hp;
  assert.equal(repository.getPlayer(player.id).currentHealth, finalHealth);
  repository.db.prepare('UPDATE players SET health_updated_at = ? WHERE id = ?').run(oldTimestamp, player.id);
  assert.ok(repository.getPlayer(player.id).currentHealth > finalHealth, 'recovery should resume after the run exits');
  repository.close();
});

test('fixed potion healing is bounded at every edge and higher tiers use the same inventory', () => {
  const { repository, game, hunt, areas } = setup();
  const player = game.ensurePlayer({ id: 'potion-tiers', name: 'Potion Weaver' });

  repository.setPlayerHealth(player.id, 5);
  assert.equal(hunt.heal(player.id).currentHealth, 13);
  repository.addConsumable(player.id, 'minor-health-potion', 1);
  repository.setPlayerHealth(player.id, 22);
  assert.equal(hunt.heal(player.id).currentHealth, 30);
  repository.addConsumable(player.id, 'minor-health-potion', 1);
  repository.setPlayerHealth(player.id, 36);
  const bounded = hunt.heal(player.id);
  assert.equal(bounded.currentHealth, 40);
  assert.equal(bounded.healed, 4);

  repository.addConsumable(player.id, 'health-potion', 1);
  repository.db.prepare("UPDATE player_consumables SET quantity = 0 WHERE player_id = ? AND consumable_id = 'minor-health-potion'").run(player.id);
  repository.setPlayerHealth(player.id, 10);
  assert.throws(() => hunt.heal(player.id, 'health'), (error) => error.code === 'potion_locked');
  areas.save(player.id, { currentAreaNumber: 2, highestUnlockedAreaNumber: 2 });
  const greater = hunt.heal(player.id, 'health');
  assert.equal(greater.consumableId, 'health-potion');
  assert.equal(greater.healed, 16);
  assert.equal(game.dashboard(player.id).character.potions.find((potion) => potion.id === 'health-potion').quantity, 0);
  repository.close();
});

test('legacy health_potions values migrate into the minor consumable tier without loss', () => {
  const directory = mkdtempSync(join(tmpdir(), 'threadbound-potion-migration-'));
  const filename = join(directory, 'legacy.sqlite');
  const first = new SQLiteGameRepository({ filename, idFactory: () => 'legacy-potion-player' });
  const player = first.getOrCreatePlayer({ threadedUserId: 'legacy-threaded', displayName: 'Legacy Weaver' });
  first.db.prepare('DELETE FROM player_consumables WHERE player_id = ?').run(player.id);
  first.db.prepare('UPDATE players SET health_potions = 3 WHERE id = ?').run(player.id);
  first.close();

  const migrated = new SQLiteGameRepository({ filename });
  assert.equal(migrated.getConsumableQuantity(player.id, 'minor-health-potion'), 3);
  assert.equal(migrated.getPlayer(player.id).healthPotions, 3);
  migrated.addConsumable(player.id, 'minor-health-potion', 2);
  assert.equal(migrated.getConsumableQuantity(player.id, 'minor-health-potion'), 5);
  assert.equal(migrated.getPlayer(player.id).healthPotions, 5);
  migrated.close();
  rmSync(directory, { recursive: true, force: true });
});
