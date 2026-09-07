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

test('Guard creates aggro, halves retaliation, and primes a Riposte', () => {
  const run = partyRun();
  const result = run.guard({ playerId: 'a' });
  const damaged = result.events.find((event) => event.type === 'PlayerDamaged');

  assert.equal(damaged.playerId, 'a');
  assert.equal(damaged.rawDamage, 3);
  assert.equal(damaged.damage, 2);
  assert.equal(run.participant('a').hp, 38);
  assert.equal(run.participant('a').damagePrevented, 1);
  assert.equal(run.participant('a').guarding, false);
  assert.equal(run.participant('a').riposteBonus, 3);
  assert.ok(result.events.some((event) => event.type === 'RipostePrimed'));
});

test('Mend is reusable support gated by an action cooldown rather than a once-per-encounter charge', () => {
  const run = partyRun();
  run.attack({ playerId: 'b', attackPower: 1 });
  assert.equal(run.participant('b').hp, 37);

  const result = run.mend({ playerId: 'a', targetPlayerId: 'b' });
  assert.equal(result.healed, 3);
  assert.equal(run.participant('a').healingDone, 3);
  assert.equal(run.participant('a').cooldowns.mend, 2);

  run.participant('b').hp = 30;
  assert.throws(() => run.mend({ playerId: 'a', targetPlayerId: 'b' }), /cooling down/i);

  run.guard({ playerId: 'a' });
  assert.equal(run.participant('a').cooldowns.mend, 1);
  run.attack({ playerId: 'a', attackPower: 1 });
  assert.equal(run.participant('a').cooldowns.mend, 0);

  const reused = run.mend({ playerId: 'a', targetPlayerId: 'b' });
  assert.ok(reused.healed > 0);
  assert.ok(run.participant('a').healingDone > 3);
});

test('Mender gear increases Mend throughput without creating a separate healing rules path', () => {
  const run = partyRun();
  run.participant('b').hp = 20;
  const result = run.mend({ playerId: 'a', targetPlayerId: 'b', equipmentEffect: 'mender' });
  assert.equal(result.healed, 11);
  assert.equal(run.participant('b').hp, 31);
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
