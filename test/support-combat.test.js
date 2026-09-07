import test from 'node:test';
import assert from 'node:assert/strict';
import { DungeonRun } from '../src/domain/DungeonRun.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function partyRun({ firstHealth = 40, secondHealth = 40 } = {}) {
  return DungeonRun.start({
    id: 'support-run',
    ownerType: 'party',
    ownerId: 'party-1',
    startedByPlayerId: 'a',
    dungeonId: 'frayed-hollow',
    participants: [
      { playerId: 'a', maxHealth: firstHealth },
      { playerId: 'b', maxHealth: secondHealth },
    ],
  });
}

test('Guard creates aggro and halves the retaliation that lands on the guarder', () => {
  const run = partyRun();
  const result = run.guard({ playerId: 'a' });
  const damaged = result.events.find((event) => event.type === 'PlayerDamaged');

  assert.equal(damaged.playerId, 'a');
  assert.equal(damaged.rawDamage, 3);
  assert.equal(damaged.damage, 2);
  assert.equal(run.participant('a').hp, 38);
  assert.equal(run.participant('a').damagePrevented, 1);
  assert.equal(run.participant('a').guarding, false);
});

test('Mend heals a wounded ally once per encounter and records support contribution', () => {
  const run = partyRun();
  run.attack({ playerId: 'b', attackPower: 1 });
  assert.equal(run.participant('b').hp, 37);

  const result = run.mend({ playerId: 'a', targetPlayerId: 'b' });
  assert.equal(result.healed, 3);
  assert.equal(run.participant('a').healingDone, 3);
  assert.equal(run.participant('a').mendCharges, 0);

  run.participant('b').hp = 30;
  assert.throws(() => run.mend({ playerId: 'a', targetPlayerId: 'b' }), /already been used this encounter/i);
});

test('Revive restores a downed ally and is limited to once per run for the acting player', () => {
  const run = partyRun({ firstHealth: 40, secondHealth: 2 });
  run.attack({ playerId: 'b', attackPower: 1 });
  assert.equal(run.participant('b').hp, 0);

  const result = run.revive({ playerId: 'a', targetPlayerId: 'b' });
  assert.equal(result.restoredHp, 1);
  assert.equal(run.participant('b').hp, 1);
  assert.equal(run.participant('a').revives, 1);
  assert.equal(run.participant('a').reviveCharges, 0);

  run.participant('b').hp = 0;
  assert.throws(() => run.revive({ playerId: 'a', targetPlayerId: 'b' }), /already been used this run/i);
});

test('optimistic run versions reject a stale second write instead of losing an action', () => {
  let id = 0;
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => `player-${++id}` });
  const a = repository.getOrCreatePlayer({ threadedUserId: 'local:a', displayName: 'A' });
  repository.getOrCreatePlayer({ threadedUserId: 'local:b', displayName: 'B' });
  const run = DungeonRun.start({
    id: 'versioned-run',
    ownerType: 'player',
    ownerId: a.id,
    startedByPlayerId: a.id,
    dungeonId: 'frayed-hollow',
    participants: [{ playerId: a.id, maxHealth: 40 }],
  });
  repository.createRun(run.toJSON());

  const firstReader = repository.getRun('versioned-run');
  const staleReader = repository.getRun('versioned-run');
  firstReader.participants[0].threat = 4;
  const saved = repository.saveRun(firstReader);
  assert.equal(saved.version, 1);

  staleReader.participants[0].threat = 9;
  assert.throws(() => repository.saveRun(staleReader), (error) => error.code === 'stale_run_version');
  assert.equal(repository.getRun('versioned-run').participants[0].threat, 4);
  assert.equal(repository.getRun('versioned-run').version, 1);

  repository.close();
});
