import test from 'node:test';
import assert from 'node:assert/strict';
import { DUNGEONS, DungeonRun } from '../src/domain/DungeonRun.js';

function soloRun(maxHealth = 80, enemyId = 'hollow-stalker') {
  const dungeonDefinition = structuredClone(DUNGEONS['frayed-hollow']);
  const enemy = dungeonDefinition.encounters.find((entry) => entry.id === enemyId);
  if (!enemy) throw new Error(`Missing combat-v2 fixture enemy ${enemyId}`);
  dungeonDefinition.encounters = [enemy];
  return DungeonRun.start({
    id: `combat-v2-run-${enemyId}`,
    ownerType: 'player', ownerId: 'a', startedByPlayerId: 'a', dungeonId: 'frayed-hollow',
    dungeonDefinition,
    participants: [{ playerId: 'a', maxHealth }], now: '2026-09-08T00:00:00.000Z',
  });
}

function triggerNormalIntent(run, now = '2026-09-08T00:00:00.000Z') {
  run.attack({ playerId: 'a', attackPower: 1, now });
  assert.ok(run.toJSON().enemyIntent);
}

function triggerBossIntent(run) {
  for (let i = 0; i < 3; i += 1) run.attack({ playerId: 'a', attackPower: 1, now: `2026-09-08T00:00:0${i}.000Z` });
  assert.ok(run.toJSON().enemyIntent);
}

function advanceSilkboundToMend(run) {
  triggerNormalIntent(run, '2026-09-08T00:00:00.000Z');
  const marked = run.toJSON().enemyIntent;
  assert.equal(marked.kind, 'targeted-damage');
  assert.equal(marked.reaction, 'guard');
  run.interrupt({ playerId: 'a' });

  triggerNormalIntent(run, '2026-09-08T00:00:01.000Z');
  const heavy = run.toJSON().enemyIntent;
  assert.equal(heavy.kind, 'damage');
  assert.equal(heavy.reaction, 'guard');
  run.interrupt({ playerId: 'a' });

  triggerNormalIntent(run, '2026-09-08T00:00:02.000Z');
  const mend = run.toJSON().enemyIntent;
  assert.equal(mend.kind, 'heal');
  assert.equal(mend.reaction, 'interrupt');
  return mend;
}

test('mindless Attack immediately pays the cost of an unanswered heavy telegraph', () => {
  const run = soloRun();
  triggerNormalIntent(run);
  const hpBefore = run.participant('a').hp;
  const result = run.attack({ playerId: 'a', attackPower: 1, now: '2026-09-08T00:00:04.000Z' });
  assert.ok(run.participant('a').hp < hpBefore);
  assert.equal(result.events.some((event) => event.type === 'EnemyIntentIgnored'), true);
});

test('Silkbound Guard rotates targeted protection, heavy pressure, then interrupt-worthy recovery', () => {
  const run = soloRun(80, 'silkbound-guard');
  const intent = advanceSilkboundToMend(run);
  assert.match(intent.name, /^Thread Mend/);
  assert.ok(intent.amount > 0);
});

test('ignoring Thread Mend restores enemy HP while interrupting it prevents the heal', () => {
  const ignored = soloRun(80, 'silkbound-guard');
  advanceSilkboundToMend(ignored);
  const beforeIgnored = ignored.toJSON().enemy.hp;
  ignored.attack({ playerId: 'a', attackPower: 1, now: '2026-09-08T00:00:05.000Z' });
  const afterIgnored = ignored.toJSON().enemy.hp;

  const answered = soloRun(80, 'silkbound-guard');
  advanceSilkboundToMend(answered);
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
  triggerBossIntent(base);
  base.interrupt({ playerId: 'a' });
  assert.equal(base.participant('a').reactionDamageBonus, 4);
  const before = base.toJSON().enemy.hp;
  const result = base.attack({ playerId: 'a', attackPower: 1, now: '2026-09-08T00:00:04.000Z' });
  assert.equal(result.damage, Math.min(before, 5));
  assert.equal(base.participant('a').reactionDamageBonus, 0);
});
