import test from 'node:test';
import assert from 'node:assert/strict';
import { DUNGEONS, DungeonRun } from '../src/domain/DungeonRun.js';
import { nextEnemyIntent } from '../src/domain/CombatIntentPolicy.js';

function soloRun(enemyId = 'hollow-stalker') {
  const dungeonDefinition = structuredClone(DUNGEONS['frayed-hollow']);
  const enemy = dungeonDefinition.encounters.find((entry) => entry.id === enemyId);
  if (!enemy) throw new Error(`Missing test enemy ${enemyId}`);
  dungeonDefinition.encounters = [enemy];
  return DungeonRun.start({
    id: `intent-run-${enemyId}`,
    ownerType: 'player',
    ownerId: 'a',
    startedByPlayerId: 'a',
    dungeonId: 'frayed-hollow',
    dungeonDefinition,
    participants: [{ playerId: 'a', maxHealth: 80 }],
    now: '2026-09-07T00:00:00.000Z',
  });
}

test('a Hollow Stalker telegraphs heavy pressure before a second ordinary strike', () => {
  const run = soloRun('hollow-stalker');
  const first = run.attack({ playerId: 'a', attackPower: 1, now: '2026-09-07T00:00:00.000Z' });

  assert.equal(run.toJSON().enemyIntent.name, 'Fraying Blow');
  assert.equal(run.toJSON().enemyIntent.damage, 6);
  assert.equal(run.toJSON().enemyIntent.reaction, 'guard');
  assert.equal(first.events.some((event) => event.type === 'EnemyIntentTelegraphed'), true);
});

test('Interrupt cancels a telegraphed heavy action without applying its damage', () => {
  const run = soloRun('hollow-stalker');
  run.attack({ playerId: 'a', attackPower: 1, now: '2026-09-07T00:00:00.000Z' });
  const hpBefore = run.participant('a').hp;

  const result = run.interrupt({ playerId: 'a' });

  assert.equal(run.toJSON().enemyIntent, null);
  assert.equal(run.participant('a').hp, hpBefore);
  assert.equal(result.events[0].type, 'EnemyInterrupted');
});

test('Guard converts Hollow Stalker heavy pressure into a reduced hit', () => {
  const run = soloRun('hollow-stalker');
  run.attack({ playerId: 'a', attackPower: 1, now: '2026-09-07T00:00:00.000Z' });
  const hpBefore = run.participant('a').hp;

  const result = run.guard({ playerId: 'a', now: '2026-09-07T00:00:00.500Z' });
  const damaged = result.events.find((event) => event.type === 'PlayerDamaged');

  assert.equal(damaged.rawDamage, 6);
  assert.equal(damaged.damage, 3);
  assert.equal(run.participant('a').hp, hpBefore - 3);
  assert.equal(run.toJSON().enemyIntent, null);
});

test('an ignored heavy telegraph resolves before the next normal attack', () => {
  const run = soloRun('hollow-stalker');
  run.attack({ playerId: 'a', attackPower: 1, now: '2026-09-07T00:00:00.000Z' });
  const hpBefore = run.participant('a').hp;

  const result = run.attack({ playerId: 'a', attackPower: 1, now: '2026-09-07T00:00:04.000Z' });

  assert.equal(result.events.some((event) => event.type === 'EnemyIntentResolved'), true);
  assert.ok(run.participant('a').hp < hpBefore);
});

test('a Frayed Wisp opens with recovery pressure that rewards Interrupt', () => {
  const run = soloRun('frayed-wisp');
  run.attack({ playerId: 'a', attackPower: 1, now: '2026-09-07T00:00:00.000Z' });

  const intent = run.toJSON().enemyIntent;
  assert.equal(intent.id, 'thread-mend');
  assert.equal(intent.reaction, 'interrupt');
  assert.equal(intent.amount, 5);
  assert.match(intent.name, /heals 5 HP/);
});

test('a mixed Silkbound Guard alternates heavy pressure with self-mending', () => {
  const enemy = {
    id: 'silkbound-guard',
    name: 'Silkbound Guard',
    hp: 12,
    maxHp: 12,
    retaliation: 2,
    abilities: ['heavy_pressure', 'self_mend'],
    isBoss: false,
  };

  const first = nextEnemyIntent({ enemy, intentCount: 0, now: '2026-09-07T00:00:00.000Z' });
  const second = nextEnemyIntent({ enemy, intentCount: 1, now: '2026-09-07T00:00:01.000Z' });

  assert.equal(first.id, 'fraying-blow');
  assert.equal(first.damage, 5);
  assert.equal(second.id, 'thread-mend');
  assert.equal(second.amount, 4);
});

test('generated enemies can use the same constrained ability vocabulary', () => {
  const generated = nextEnemyIntent({
    enemy: {
      id: 'generated-mender',
      name: 'Generated Mender',
      hp: 20,
      maxHp: 20,
      retaliation: 2,
      abilities: ['self_mend'],
      isBoss: false,
    },
    intentCount: 0,
    now: '2026-09-07T00:00:00.000Z',
  });

  assert.equal(generated.id, 'thread-mend');
  assert.equal(generated.amount, 7);
  assert.equal(generated.reaction, 'interrupt');
});
