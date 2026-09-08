import test from 'node:test';
import assert from 'node:assert/strict';
import { DungeonRun } from '../src/domain/DungeonRun.js';

function runWithPlayers(count = 1) {
  const participants = Array.from({ length: count }, (_, index) => ({ playerId: `p${index + 1}`, maxHealth: 80 }));
  return DungeonRun.start({
    id: 'skills-run', ownerType: count > 1 ? 'party' : 'player', ownerId: count > 1 ? 'party-1' : 'p1',
    startedByPlayerId: 'p1', dungeonId: 'frayed-hollow', participants,
    now: '2026-09-08T00:00:00.000Z',
  });
}

function withFocus(run, playerId, focus) {
  const state = run.toJSON();
  state.participants.find((participant) => participant.playerId === playerId).focus = focus;
  return new DungeonRun(state);
}

test('ordinary attacks build Focus up to the cap', () => {
  const run = runWithPlayers();
  for (let index = 0; index < 5; index += 1) {
    if (run.toJSON().enemyIntent) run.interrupt({ playerId: 'p1' });
    run.attack({ playerId: 'p1', attackPower: 1 });
  }
  assert.equal(run.participant('p1').focus, 4);
  assert.equal(run.participant('p1').maxFocus, 4);
});

test('Piercing Stitch spends Focus, applies Exposed, and enters cooldown', () => {
  const run = withFocus(runWithPlayers(), 'p1', 2);
  const result = run.useSkill({ playerId: 'p1', skillId: 'piercing-stitch', attackPower: 1 });
  assert.equal(result.damage, 3);
  assert.equal(run.participant('p1').focus, 0);
  assert.equal(run.participant('p1').skillCooldowns['piercing-stitch'], 2);
  assert.equal(run.toJSON().enemy.statuses.exposed, 1);
  assert.equal(result.events.some((event) => event.type === 'EnemyStatusApplied' && event.status === 'exposed'), true);
});

test('a second Weaver can consume Exposed with Severing Knot for a real party combo', () => {
  let run = withFocus(runWithPlayers(2), 'p1', 2);
  run = withFocus(run, 'p2', 3);
  run.useSkill({ playerId: 'p1', skillId: 'piercing-stitch', attackPower: 1 });
  const hpBefore = run.toJSON().enemy.hp;
  const result = run.useSkill({ playerId: 'p2', skillId: 'severing-knot', attackPower: 1 });
  assert.equal(result.damage, Math.min(hpBefore, 9));
  assert.equal(run.toJSON().enemy.statuses.exposed, 0);
  assert.equal(result.events.some((event) => event.type === 'SkillComboTriggered' && event.combo === 'exposed'), true);
});

test('Severing Knot cuts off a pending telegraph while dealing damage', () => {
  let run = withFocus(runWithPlayers(), 'p1', 4);
  for (let index = 0; index < 3; index += 1) run.attack({ playerId: 'p1', attackPower: 1 });
  run = withFocus(run, 'p1', 4);
  assert.ok(run.toJSON().enemyIntent);
  const result = run.useSkill({ playerId: 'p1', skillId: 'severing-knot', attackPower: 1 });
  assert.equal(run.toJSON().enemyIntent, null);
  assert.equal(result.events.some((event) => event.type === 'EnemyInterrupted' && event.bySkillId === 'severing-knot'), true);
});

test('Mending Chorus turns Focus into party-wide recovery', () => {
  let run = withFocus(runWithPlayers(2), 'p1', 3);
  const state = run.toJSON();
  state.participants[0].hp = 50;
  state.participants[1].hp = 60;
  run = new DungeonRun(state);
  const result = run.useSkill({ playerId: 'p1', skillId: 'mending-chorus', attackPower: 1 });
  assert.equal(result.healed, 10);
  assert.equal(run.participant('p1').hp, 53); // heal 5, then ordinary retaliation 2 lands on the caster
  assert.equal(run.participant('p2').hp, 65);
  assert.equal(run.participant('p1').healingDone, 10);
});

test('skill cooldowns are measured in the acting player’s later actions', () => {
  let run = withFocus(runWithPlayers(), 'p1', 4);
  run.useSkill({ playerId: 'p1', skillId: 'piercing-stitch', attackPower: 1 });
  assert.throws(() => run.useSkill({ playerId: 'p1', skillId: 'piercing-stitch', attackPower: 1 }), /cooldown/i);
  run.attack({ playerId: 'p1', attackPower: 1 });
  run = withFocus(run, 'p1', 4);
  assert.doesNotThrow(() => run.useSkill({ playerId: 'p1', skillId: 'piercing-stitch', attackPower: 1 }));
});

test('pre-skill persisted runs hydrate with safe defaults', () => {
  const run = runWithPlayers();
  const legacy = run.toJSON();
  delete legacy.participants[0].focus;
  delete legacy.participants[0].maxFocus;
  delete legacy.participants[0].skillCooldowns;
  delete legacy.enemy.statuses;
  const hydrated = new DungeonRun(legacy);
  assert.equal(hydrated.participant('p1').focus, 0);
  assert.equal(hydrated.participant('p1').maxFocus, 4);
  assert.deepEqual(hydrated.participant('p1').skillCooldowns, {});
  assert.deepEqual(hydrated.toJSON().enemy.statuses, { exposed: 0 });
});
