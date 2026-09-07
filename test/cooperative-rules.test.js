import test from 'node:test';
import assert from 'node:assert/strict';
import { DungeonRun } from '../src/domain/DungeonRun.js';

test('a downed participant cannot act while surviving party members can continue', () => {
  const run = DungeonRun.start({
    id: 'downed-run',
    ownerType: 'party',
    ownerId: 'party-1',
    startedByPlayerId: 'fragile',
    dungeonId: 'frayed-hollow',
    participants: [
      { playerId: 'fragile', maxHealth: 2 },
      { playerId: 'survivor', maxHealth: 40 },
    ],
  });

  run.attack({ playerId: 'fragile', attackPower: 1 });
  assert.equal(run.participant('fragile').hp, 0);
  assert.equal(run.state.phase, 'combat');
  assert.throws(() => run.attack({ playerId: 'fragile', attackPower: 6 }), /defeated player/i);

  const survivorAttack = run.attack({ playerId: 'survivor', attackPower: 6 });
  assert.equal(survivorAttack.state.phase, 'combat');
  assert.ok(run.participant('survivor').hp > 0);
});
