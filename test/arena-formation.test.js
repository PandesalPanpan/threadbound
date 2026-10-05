import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaFormationService } from '../src/application/ArenaFormationService.js';
import { EventBus } from '../src/application/EventBus.js';
import { GameService } from '../src/application/GameService.js';
import { PartyService } from '../src/application/PartyService.js';
import { SimpleDungeonService } from '../src/application/SimpleDungeonService.js';
import { normalizePlayerArenaPosition } from '../src/domain/ArenaFormationPolicy.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function setup() {
  let id = 0;
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => `formation-player-${++id}` });
  const eventBus = new EventBus();
  return {
    repository,
    eventBus,
    game: new GameService({ repository, eventBus }),
    dungeons: new SimpleDungeonService({ repository, eventBus, idFactory: () => 'formation-run' }),
    parties: new PartyService({ repository, eventBus, joinCodeFactory: () => 'FORM01' }),
    formations: new ArenaFormationService({ repository, eventBus }),
  };
}

test('player deployment validates the legal side and deployment rows', () => {
  assert.deepEqual(normalizePlayerArenaPosition({ x: 7, y: 5 }, 'Ari'), { x: 7, y: 5 });
  for (const position of [{ x: -1, y: 5 }, { x: 8, y: 5 }, { x: 3, y: 4 }, { x: 3, y: 8 }, { x: 1.5, y: 6 }]) {
    assert.throws(() => normalizePlayerArenaPosition(position, 'Ari'), (error) => error.code === 'invalid_arena_formation');
  }
});

test('saved party placements are owned, versioned, public to members, and clear pre-run readiness', () => {
  const { repository, parties, formations } = setup();
  const leader = repository.getOrCreatePlayer({ threadedUserId: 'formation-leader', displayName: 'Leader' });
  const partner = repository.getOrCreatePlayer({ threadedUserId: 'formation-partner', displayName: 'Partner' });
  const party = parties.createParty(leader.id);
  parties.joinParty(partner.id, party.joinCode);
  parties.setReady(leader.id, true);
  parties.setReady(partner.id, true);

  const changed = formations.set(leader.id, { x: 1, y: 7 }, 0);
  assert.deepEqual(changed.position, { x: 1, y: 7 });
  assert.equal(changed.version, 1);
  assert.ok(changed.members.some((member) => member.playerId === partner.id && member.position === null));
  assert.ok(repository.getPartyForPlayer(leader.id).members.every((member) => !member.ready));
  assert.throws(() => formations.set(partner.id, { x: 1, y: 7 }, 0), (error) => error.code === 'arena_formation_tile_occupied');
  assert.throws(() => formations.set(leader.id, { x: 2, y: 7 }, 0), (error) => error.code === 'stale_formation_version');

  const updated = formations.set(partner.id, { x: 2, y: 7 }, 0);
  assert.deepEqual(updated.members.find((member) => member.playerId === leader.id).position, { x: 1, y: 7 });
  assert.deepEqual(repository.getArenaFormation(partner.id), { position: { x: 2, y: 7 }, version: 1, updatedAt: repository.getArenaFormation(partner.id).updatedAt });
  repository.close();
});

test('Dungeon formation snapshots drive replay and party readiness gates intermission Continue', () => {
  const { repository, game, dungeons, parties, formations } = setup();
  const leader = repository.getOrCreatePlayer({ threadedUserId: 'formation-run-leader', displayName: 'Leader' });
  const partner = repository.getOrCreatePlayer({ threadedUserId: 'formation-run-partner', displayName: 'Partner' });
  repository.db.prepare('UPDATE players SET base_attack = 30, max_health = 200, current_health = 200 WHERE id IN (?, ?)').run(leader.id, partner.id);
  const party = parties.createParty(leader.id);
  parties.joinParty(partner.id, party.joinCode);
  formations.set(leader.id, { x: 1, y: 7 }, 0);
  formations.set(partner.id, { x: 2, y: 7 }, 0);
  parties.setReady(leader.id, true);
  parties.setReady(partner.id, true);

  const started = dungeons.startDungeon(leader.id, 'frayed-hollow');
  assert.deepEqual(started.arenaFormation, { [leader.id]: { x: 1, y: 7 }, [partner.id]: { x: 2, y: 7 } });
  const firstFight = game.resolveSimpleEncounter(leader.id, started.id);
  const firstLeader = firstFight.battleReplay.arenaReplay.combatants.find((unit) => unit.id === leader.id);
  assert.deepEqual({ x: firstLeader.x, y: firstLeader.y }, { x: 1, y: 7 });
  assert.equal(repository.getRun(started.id).phase, 'between_encounter');

  const beforeEdit = repository.getRun(started.id);
  const changed = game.setDungeonFormation(leader.id, started.id, { x: 0, y: 6 }, 0);
  assert.deepEqual(changed.run.arenaFormation[leader.id], { x: 0, y: 6 });
  assert.equal(changed.run.formationRevision, 1);
  assert.equal(changed.run.participants.find((participant) => participant.playerId === leader.id).hp, beforeEdit.participants.find((participant) => participant.playerId === leader.id).hp);
  assert.equal(changed.run.participants.find((participant) => participant.playerId === leader.id).mana, beforeEdit.participants.find((participant) => participant.playerId === leader.id).mana);
  assert.throws(() => game.setDungeonFormation(partner.id, started.id, { x: 3, y: 6 }, 0), (error) => error.code === 'stale_formation_version');
  assert.throws(() => game.continueDungeon(leader.id, started.id), (error) => error.code === 'arena_formation_not_ready');
  game.setDungeonFormationReady(leader.id, started.id);
  assert.throws(() => game.continueDungeon(leader.id, started.id), (error) => error.code === 'arena_formation_not_ready');
  game.setDungeonFormationReady(partner.id, started.id);

  const nextRoom = game.continueDungeon(leader.id, started.id);
  const nextLeader = nextRoom.battleReplay.arenaReplay.combatants.find((unit) => unit.id === leader.id);
  assert.deepEqual({ x: nextLeader.x, y: nextLeader.y }, { x: 0, y: 6 });
  assert.deepEqual(nextRoom.battleReplay.arenaReplay.context.formationSnapshot[leader.id], { x: 0, y: 6 });
  assert.equal(repository.getRun(started.id).participants.find((participant) => participant.playerId === leader.id).hp, nextRoom.run.participants.find((participant) => participant.playerId === leader.id).hp, 'formation edits never restore HP');
  repository.close();
});
