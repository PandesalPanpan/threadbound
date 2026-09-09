import test from 'node:test';
import assert from 'node:assert/strict';
import { DungeonRun } from '../src/domain/DungeonRun.js';
import { criticalStrike, CRITICAL_STRIKE_RULES } from '../src/domain/CriticalStrikePolicy.js';

function customDungeon(abilities = ['heavy_pressure']) {
  return {
    id:'clarity-fixture',
    name:'Clarity Fixture',
    minPlayers:1,
    maxPlayers:4,
    recommendedPlayers:1,
    encounters:[{ id:'fixture-foe', name:'Fixture Foe', hp:20, retaliation:4, abilities, intentCadence:1 }],
    boss:{ id:'fixture-boss', name:'Fixture Boss', hp:30, retaliation:5, abilities:['basic_retaliation'], intentCadence:2 },
  };
}

function pendingLethalRun(abilities = ['heavy_pressure']) {
  const started = DungeonRun.start({
    id:'clarity-run',
    ownerType:'player',
    ownerId:'p1',
    startedByPlayerId:'p1',
    participants:[{ playerId:'p1', maxHealth:40 }],
    dungeonId:'clarity-fixture',
    dungeonDefinition:customDungeon(abilities),
  }).toJSON();
  started.version = 7;
  started.enemy.hp = 3;
  started.enemyIntent = {
    id:'fraying-blow', name:'Fraying Blow', kind:'damage', reaction:'guard', damage:12,
    dueAt:new Date(Date.now()+3000).toISOString(), windowMs:3000, battlePhase:0,
  };
  return new DungeonRun(started);
}

test('a lethal player attack cancels an ordinary pending enemy intent', () => {
  const run = pendingLethalRun();
  const hpBefore = run.participant('p1').hp;
  const outcome = run.attack({ playerId:'p1', attackPower:3 });
  assert.equal(outcome.retaliation,0);
  assert.equal(outcome.state.participants[0].hp,hpBefore);
  assert.ok(outcome.events.some((event) => event.type === 'EnemyIntentCancelledByDefeat'));
  assert.ok(outcome.events.some((event) => event.type === 'EnemyDefeated'));
  assert.equal(outcome.events.some((event) => event.type === 'EnemyIntentResolved'),false);
});

test('an explicit death_burst remains allowed to hurt the party after a lethal hit', () => {
  const run = pendingLethalRun(['death_burst']);
  // Death burst is the explicit exception; remove the ordinary pending telegraph so the
  // assertion isolates the on-death mechanic.
  const state = run.toJSON();
  state.enemyIntent = null;
  const bursting = new DungeonRun(state);
  const hpBefore = bursting.participant('p1').hp;
  const outcome = bursting.attack({ playerId:'p1', attackPower:3 });
  assert.ok(outcome.retaliation > 0);
  assert.ok(outcome.state.participants[0].hp < hpBefore);
  assert.ok(outcome.events.some((event) => event.type === 'EnemyDeathEffectResolved' && event.effect === 'death_burst'));
});

test('critical strike rolls are deterministic for a run version and exposed raises the chance', () => {
  const args = { runId:'crit-run', runVersion:4, playerId:'p1', enemyId:'foe', actionKey:'attack', baseDamage:8 };
  const first = criticalStrike(args);
  const second = criticalStrike(args);
  assert.deepEqual(first,second);
  assert.equal(first.chance,CRITICAL_STRIKE_RULES.baseChance);
  assert.equal(criticalStrike({ ...args, exposed:true }).chance,CRITICAL_STRIKE_RULES.baseChance + CRITICAL_STRIKE_RULES.exposedBonus);

  let found = null;
  for (let index=0; index<500; index+=1) {
    const result = criticalStrike({ ...args, runId:`crit-run-${index}` });
    if (result.critical) { found = result; break; }
  }
  assert.ok(found,'expected deterministic policy to produce at least one critical seed');
  assert.ok(found.damage > args.baseDamage);
});
