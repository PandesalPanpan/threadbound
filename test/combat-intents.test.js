import test from 'node:test';
import assert from 'node:assert/strict';
import { DungeonRun } from '../src/domain/DungeonRun.js';

function soloRun() {
  return DungeonRun.start({
    id: 'intent-run',
    ownerType: 'player',
    ownerId: 'a',
    startedByPlayerId: 'a',
    dungeonId: 'frayed-hollow',
    participants: [{ playerId: 'a', maxHealth: 80 }],
    now: '2026-09-07T00:00:00.000Z',
  });
}

test('enemy telegraphs a heavy action after a short run of ordinary attacks', () => {
  const run = soloRun();
  run.attack({ playerId: 'a', attackPower: 1, now: '2026-09-07T00:00:00.000Z' });
  run.attack({ playerId: 'a', attackPower: 1, now: '2026-09-07T00:00:00.300Z' });
  const third = run.attack({ playerId: 'a', attackPower: 1, now: '2026-09-07T00:00:00.600Z' });

  assert.equal(run.toJSON().enemyIntent.name, 'Fraying Blow');
  assert.equal(run.toJSON().enemyIntent.damage, 4);
  assert.equal(third.events.some((event) => event.type === 'EnemyIntentTelegraphed'), true);
});

test('Interrupt cancels a telegraphed heavy action without applying its damage', () => {
  const run = soloRun();
  for (let i = 0; i < 3; i += 1) run.attack({ playerId: 'a', attackPower: 1, now: `2026-09-07T00:00:0${i}.000Z` });
  const hpBefore = run.participant('a').hp;

  const result = run.interrupt({ playerId: 'a' });

  assert.equal(run.toJSON().enemyIntent, null);
  assert.equal(run.participant('a').hp, hpBefore);
  assert.equal(result.events[0].type, 'EnemyInterrupted');
});

test('Guard converts a pending heavy action into a reduced hit', () => {
  const run = soloRun();
  for (let i = 0; i < 3; i += 1) run.attack({ playerId: 'a', attackPower: 1, now: `2026-09-07T00:00:0${i}.000Z` });
  const hpBefore = run.participant('a').hp;

  const result = run.guard({ playerId: 'a', now: '2026-09-07T00:00:02.100Z' });
  const damaged = result.events.find((event) => event.type === 'PlayerDamaged');

  assert.equal(damaged.rawDamage, 4);
  assert.equal(damaged.damage, 2);
  assert.equal(run.participant('a').hp, hpBefore - 2);
  assert.equal(run.toJSON().enemyIntent, null);
});

test('an expired telegraph resolves before the next normal attack', () => {
  const run = soloRun();
  for (let i = 0; i < 3; i += 1) run.attack({ playerId: 'a', attackPower: 1, now: `2026-09-07T00:00:0${i}.000Z` });
  const hpBefore = run.participant('a').hp;

  const result = run.attack({ playerId: 'a', attackPower: 1, now: '2026-09-07T00:00:06.000Z' });

  assert.equal(result.events.some((event) => event.type === 'EnemyIntentResolved'), true);
  assert.ok(run.participant('a').hp < hpBefore);
});
