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

test('higher attack speed produces more attacks and respects the individual cooldown', () => {
  const attacks = (speed) => simulateArena({}, { maxTicks: 200, tuning: { archer: { attackSpeed: speed } } })
    .frames.flatMap((frame) => frame.events).filter((event) => event.actor === 'archer' && event.type === 'hit');
  const slow = attacks(0.4);
  const fast = attacks(3);
  assert.ok(fast.length > slow.length);
  for (const [speed, events] of [[0.4, slow], [3, fast]]) {
    for (let index = 1; index < events.length; index += 1) assert.ok(events[index].timeMs - events[index - 1].timeMs >= 1000 / speed - 0.001);
  }
});

test('movement speed changes travel duration and fractional positions, independently of attack speed', () => {
  const slow = simulateArena({}, { maxTicks: 8, tuning: { archer: { moveSpeed: 1 } } });
  const fast = simulateArena({}, { maxTicks: 8, tuning: { archer: { moveSpeed: 4 } } });
  const firstMove = (replay) => replay.frames.flatMap((frame) => frame.events).find((event) => event.actor === 'archer' && event.type === 'move');
  assert.equal(firstMove(slow).durationMs, 1000);
  assert.equal(firstMove(fast).durationMs, 250);
  const sample = (replay) => replay.frames[4].units.find((unit) => unit.id === 'archer');
  assert.ok(Math.hypot(sample(fast).renderX - 2, sample(fast).renderY - 7) > Math.hypot(sample(slow).renderX - 2, sample(slow).renderY - 7));
  assert.equal(sample(slow).attackSpeed, sample(fast).attackSpeed);
  assert.ok(!Number.isInteger(sample(slow).renderY));
});

test('independent motion reserves destinations, and units cannot attack while in transit', () => {
  const replay = simulateArena();
  const departures = replay.frames.flatMap((frame) => frame.events).filter((event) => event.type === 'move');
  assert.ok(new Set(ARENA_ROSTER.map((unit) => departures.find((event) => event.actor === unit.id)?.timeMs)).size > 2);
  assert.ok(new Set(departures.map((event) => event.durationMs)).size > 2);
  for (const frame of replay.frames) {
    const reservations = frame.units.filter((unit) => unit.hp > 0).flatMap((unit) => [
      `${unit.x},${unit.y}`, ...(unit.motion ? [`${unit.motion.x},${unit.motion.y}`] : []),
    ]);
    assert.equal(new Set(reservations).size, reservations.length);
    for (const event of frame.events.filter((event) => ['hit', 'heal'].includes(event.type))) {
      assert.equal(frame.units.find((unit) => unit.id === event.actor).motion, null);
    }
  }
});

test('speed tuning rejects invalid stats and never changes the original roster', () => {
  for (const tuning of [{ archer: { attackSpeed: 0 } }, { archer: { moveSpeed: Infinity } }, { archer: { damage: 100 } }, { unknown: { moveSpeed: 2 } }]) {
    assert.throws(() => simulateArena({}, { tuning }), /speed|speeds/);
  }
  const custom = { archer: { attackSpeed: 3, moveSpeed: 4 } };
  assert.deepEqual(simulateArena({}, { tuning: custom }), simulateArena({}, { tuning: custom }));
  assert.equal(ARENA_ROSTER.find((unit) => unit.id === 'archer').attackSpeed, 1.2);
});
