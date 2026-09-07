import test from 'node:test';
import assert from 'node:assert/strict';
import { DungeonRun } from '../src/domain/DungeonRun.js';

function soloRun() {
  return DungeonRun.start({
    id: 'intent-run',
    ownerType: 'player',
    ownerId: 'p1',
    startedByPlayerId: 'p1',
    dungeonId: 'frayed-hollow',
    participants: [{ playerId: 'p1', maxHealth: 40 }],
    now: '2026-01-01T00:00:00.000Z',
  });
}

function defeatCurrent(run, attackPower = 99) {
  const result = run.attack({ playerId: 'p1', attackPower, now: '2026-01-01T00:00:00.000Z' });
  assert.ok(result.events.some((event) => event.type === 'EnemyDefeated'));
  return result;
}

function advanceToStalker(run) {
  defeatCurrent(run);
  run.chooseUpgrade('sharpen');
  assert.equal(run.state.enemy.id, 'hollow-stalker');
}

function advanceToGuard(run) {
  advanceToStalker(run);
  defeatCurrent(run);
  run.chooseUpgrade('quicken');
  assert.equal(run.state.enemy.id, 'silkbound-guard');
}

function advanceToBoss(run) {
  advanceToGuard(run);
  defeatCurrent(run);
  run.chooseUpgrade('riposte');
  assert.equal(run.state.phase, 'boss');
  assert.equal(run.state.enemy.id, 'first-needle');
}

test('Frayed Wisp teaches Interrupt through Soul Flare after two ordinary actions', () => {
  const run = soloRun();
  run.attack({ playerId: 'p1', attackPower: 3 });
  const second = run.attack({ playerId: 'p1', attackPower: 3 });

  assert.equal(run.state.enemy.hp, 12);
  assert.equal(run.state.enemyIntent.name, 'Soul Flare');
  assert.equal(run.state.enemyIntent.counter, 'interrupt');
  assert.equal(run.state.enemyIntent.damage, 5);
  assert.ok(second.events.some((event) => event.type === 'EnemyIntentTelegraphed'));
});

test('Interrupt cancels Soul Flare, grants Focus, and staggers the next hit', () => {
  const run = soloRun();
  run.attack({ playerId: 'p1', attackPower: 3 });
  run.attack({ playerId: 'p1', attackPower: 3 });
  const hpBefore = run.participant('p1').hp;

  const interrupt = run.interrupt({ playerId: 'p1' });
  assert.equal(run.state.enemyIntent, null);
  assert.equal(run.participant('p1').hp, hpBefore);
  assert.equal(run.participant('p1').focus, 3);
  assert.equal(run.state.enemy.staggeredHits, 1);
  assert.ok(interrupt.events.some((event) => event.type === 'EnemyInterrupted'));
  assert.ok(interrupt.events.some((event) => event.type === 'EnemyStaggered'));

  const staggeredHit = run.attack({ playerId: 'p1', attackPower: 3 });
  assert.equal(staggeredHit.damage, 5);
  assert.equal(run.state.enemy.staggeredHits, 0);
});

test("Hollow Stalker teaches Guard by turning Predator's Pounce into a Riposte opportunity", () => {
  const run = soloRun();
  advanceToStalker(run);
  run.attack({ playerId: 'p1', attackPower: 3 });
  run.attack({ playerId: 'p1', attackPower: 3 });
  assert.equal(run.state.enemyIntent.name, "Predator's Pounce");
  assert.equal(run.state.enemyIntent.counter, 'guard');

  const hpBefore = run.participant('p1').hp;
  const result = run.guard({ playerId: 'p1' });
  assert.equal(result.countered, true);
  assert.equal(result.retaliation, 4);
  assert.equal(run.participant('p1').hp, hpBefore - 4);
  assert.equal(run.participant('p1').riposteBonus, 3);
  assert.ok(result.events.some((event) => event.type === 'EnemyIntentCountered' && event.counter === 'guard'));
  assert.ok(result.events.some((event) => event.type === 'RipostePrimed'));
});

test('Silkbound Guard teaches Power Strike by breaking Silken Brace before fortification', () => {
  const run = soloRun();
  advanceToGuard(run);
  run.attack({ playerId: 'p1', attackPower: 3 });
  run.attack({ playerId: 'p1', attackPower: 3 });
  assert.equal(run.state.enemyIntent.name, 'Silken Brace');
  assert.equal(run.state.enemyIntent.counter, 'power-strike');
  assert.ok(run.participant('p1').focus >= run.state.runModifiers.powerStrikeCost);

  const result = run.powerStrike({ playerId: 'p1', attackPower: 3 });
  assert.equal(result.countered, true);
  assert.equal(run.state.enemyIntent, null);
  assert.equal(run.state.enemy?.fortifiedHits ?? 0, 0);
  assert.ok(result.events.some((event) => event.type === 'EnemyIntentCountered' && event.counter === 'power-strike'));
});

test('ignoring a telegraph with Attack resolves the enemy mechanic before the attack', () => {
  const run = soloRun();
  advanceToGuard(run);
  run.attack({ playerId: 'p1', attackPower: 3 });
  run.attack({ playerId: 'p1', attackPower: 3 });
  const hpBefore = run.participant('p1').hp;

  const ignored = run.attack({ playerId: 'p1', attackPower: 3 });
  assert.equal(ignored.intentResolved, true);
  assert.equal(ignored.retaliation, 3);
  assert.equal(ignored.damage, 2);
  assert.equal(run.participant('p1').hp, hpBefore - 3);
  assert.equal(run.state.enemy.fortifiedHits, 1);
  assert.ok(ignored.events.some((event) => event.type === 'EnemyFortified'));
});

test('The First Needle rotates Interrupt, Guard, and Power Strike counters learned in prior encounters', () => {
  const run = soloRun();
  advanceToBoss(run);

  run.attack({ playerId: 'p1', attackPower: 1 });
  run.attack({ playerId: 'p1', attackPower: 1 });
  assert.equal(run.state.enemyIntent.name, 'Needle Break');
  assert.equal(run.state.enemyIntent.counter, 'interrupt');
  run.interrupt({ playerId: 'p1' });

  run.attack({ playerId: 'p1', attackPower: 1 });
  run.attack({ playerId: 'p1', attackPower: 1 });
  assert.equal(run.state.enemyIntent.name, 'Thread Sever');
  assert.equal(run.state.enemyIntent.counter, 'guard');
  const guard = run.guard({ playerId: 'p1' });
  assert.equal(guard.countered, true);

  if (run.state.enemy?.hp < 12) run.state.enemy.hp = 12;
  run.attack({ playerId: 'p1', attackPower: 1 });
  run.attack({ playerId: 'p1', attackPower: 1 });
  assert.equal(run.state.enemyIntent.name, 'Loom Ward');
  assert.equal(run.state.enemyIntent.counter, 'power-strike');
});
