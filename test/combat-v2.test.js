import test from 'node:test';
import assert from 'node:assert/strict';
import { DungeonRun } from '../src/domain/DungeonRun.js';

function soloRun(maxHealth = 80) {
  return DungeonRun.start({
    id: 'combat-v2-run', ownerType: 'player', ownerId: 'a', startedByPlayerId: 'a', dungeonId: 'frayed-hollow',
    participants: [{ playerId: 'a', maxHealth }], now: '2026-09-08T00:00:00.000Z',
  });
}

function triggerIntent(run, attackPower = 1) {
  for (let i = 0; i < 3; i += 1) run.attack({ playerId: 'a', attackPower, now: `2026-09-08T00:00:0${i}.000Z` });
}

test('mindless Attack immediately pays the cost of an unanswered telegraph', () => {
  const run = soloRun();
  triggerIntent(run);
  const hpBefore = run.participant('a').hp;
  const result = run.attack({ playerId: 'a', attackPower: 1, now: '2026-09-08T00:00:02.200Z' });
  assert.ok(run.participant('a').hp < hpBefore);
  assert.equal(result.events.some((event) => event.type === 'EnemyIntentIgnored'), true);
});

test('enemy intent cycle includes an interrupt-worthy heal after the heavy attack', () => {
  const run = soloRun();
  triggerIntent(run);
  run.interrupt({ playerId: 'a' });
  triggerIntent(run);
  const intent = run.toJSON().enemyIntent;
  assert.equal(intent.kind, 'heal');
  assert.equal(intent.reaction, 'interrupt');
  assert.match(intent.name, /^Thread Mend/);
  assert.ok(intent.amount > 0);
});

test('ignoring Thread Mend restores enemy HP while interrupting it prevents the heal', () => {
  const ignored = soloRun();
  triggerIntent(ignored);
  ignored.interrupt({ playerId: 'a' });
  triggerIntent(ignored);
  const beforeIgnored = ignored.toJSON().enemy.hp;
  ignored.attack({ playerId: 'a', attackPower: 1, now: '2026-09-08T00:00:05.000Z' });
  const afterIgnored = ignored.toJSON().enemy.hp;

  const answered = soloRun();
  triggerIntent(answered);
  answered.interrupt({ playerId: 'a' });
  triggerIntent(answered);
  const beforeAnswered = answered.toJSON().enemy.hp;
  answered.interrupt({ playerId: 'a' });

  assert.ok(afterIgnored >= beforeIgnored - 1);
  assert.equal(answered.toJSON().enemy.hp, beforeAnswered);
});

test('reaction upgrades create build-defining payoff instead of flat attack only', () => {
  const base = soloRun(200);
  while (base.toJSON().phase === 'combat') base.attack({ playerId: 'a', attackPower: 20, now: '2026-09-08T00:00:00.000Z' });
  assert.equal(base.toJSON().phase, 'upgrade');
  base.chooseUpgrade('disrupt');
  triggerIntent(base);
  base.interrupt({ playerId: 'a' });
  assert.equal(base.participant('a').reactionDamageBonus, 4);
  const before = base.toJSON().enemy.hp;
  const result = base.attack({ playerId: 'a', attackPower: 1, now: '2026-09-08T00:00:04.000Z' });
  assert.equal(result.damage, Math.min(before, 5));
  assert.equal(base.participant('a').reactionDamageBonus, 0);
});
