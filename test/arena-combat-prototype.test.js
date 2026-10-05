import assert from 'node:assert/strict';
import test from 'node:test';
import { ARENA_ROSTER, createArenaUnits, simulateArena } from '../frontend/src/battle/arenaCombatPrototype.js';
import { characterSpriteFrame } from '../public/sprite-catalog.js';

test('arena replay is deterministic and team placement changes the simulation', () => {
  const baseline = simulateArena();
  assert.deepEqual(simulateArena(), baseline);
  const alternate = simulateArena({ guard: { x: 7, y: 7 }, archer: { x: 3, y: 5 }, healer: { x: 0, y: 5 } });
  assert.notDeepEqual(alternate.frames, baseline.frames);
  assert.ok(baseline.duration <= 60);
  assert.ok(['victory', 'defeat', 'draw'].includes(baseline.outcome));
  assert.equal(baseline.outcome, 'victory');
  assert.equal(simulateArena({ guard: { x: 6, y: 7 }, archer: { x: 5, y: 7 }, healer: { x: 0, y: 5 } }).outcome, 'defeat');
});

test('arena validates deployment and uses the exact semantic character art', () => {
  assert.throws(() => createArenaUnits({ guard: { x: 1, y: 1 } }), /bottom three rows/);
  assert.throws(() => createArenaUnits({ guard: { x: 2, y: 7 } }), /own tile/);
  assert.throws(() => createArenaUnits({ brawler: { x: 4, y: 2 } }), /bottom three rows/);
  assert.throws(() => simulateArena({}, { maxTicks: Infinity }), /duration/);
  for (const unit of ARENA_ROSTER) assert.equal(characterSpriteFrame(unit).visualAssetId, unit.visualAssetId);
});

test('AI paths avoid living units, defeated units stop acting, and health stays bounded', () => {
  const replay = simulateArena();
  for (let index = 1; index < replay.frames.length; index += 1) {
    const frame = replay.frames[index];
    const prior = replay.frames[index - 1];
    const occupied = frame.units.filter((unit) => unit.hp > 0).map((unit) => `${unit.x},${unit.y}`);
    assert.equal(new Set(occupied).size, occupied.length);
    for (const unit of frame.units) {
      assert.ok(unit.hp >= 0 && unit.hp <= unit.maxHp);
      assert.ok(unit.x >= 0 && unit.x < 8 && unit.y >= 0 && unit.y < 8);
      assert.ok(unit.mana >= 0 && unit.mana <= 100);
      assert.ok(unit.shield >= 0 && unit.shield <= 35);
      const old = prior.units.find((other) => other.id === unit.id);
      assert.ok(Math.abs(unit.x - old.x) + Math.abs(unit.y - old.y) <= 1);
      if (old.hp === 0) {
        assert.equal(unit.hp, 0);
        assert.ok(!frame.events.some((event) => event.actor === unit.id));
      }
    }
  }
});

test('roles choose real healing, shield, ranged attacks, retreat, and mana skills', () => {
  const replay = simulateArena();
  const events = replay.frames.flatMap((frame) => frame.events);
  assert.ok(events.some((event) => event.type === 'heal' && event.amount > 0));
  assert.ok(events.some((event) => event.type === 'shield'));
  assert.ok(events.some((event) => event.type === 'hit' && event.ranged));
  assert.ok(events.some((event) => event.type === 'hit' && event.skill));
  assert.ok(replay.frames.some((frame) => frame.units.some((unit) => unit.intent === 'Keeping distance')));
  for (const frame of replay.frames) for (const event of frame.events) {
    const actor = frame.units.find((unit) => unit.id === event.actor);
    const target = frame.units.find((unit) => unit.id === event.target);
    if (event.type === 'heal' || event.type === 'shield') assert.equal(actor.team, target.team);
    if (event.type === 'hit') assert.notEqual(actor.team, target.team);
  }
});

test('bounded simulation reports draw instead of declaring a false winner', () => {
  const replay = simulateArena({}, { maxTicks: 1 });
  assert.equal(replay.outcome, 'draw');
  assert.equal(replay.frames.length, 2);
});
