import test from 'node:test';
import assert from 'node:assert/strict';
import { DungeonRun } from '../src/domain/DungeonRun.js';

const PHASE_DUNGEON = Object.freeze({
  id: 'phase-lab',
  name: 'Phase Lab',
  minPlayers: 1,
  maxPlayers: 4,
  encounters: Object.freeze([
    Object.freeze({ id: 'warmup', name: 'Warmup', hp: 1, retaliation: 1 }),
  ]),
  boss: Object.freeze({ id: 'phase-boss', name: 'Phase Boss', hp: 40, retaliation: 4 }),
});

function bossRun({ vulnerableHp = 24 } = {}) {
  const run = DungeonRun.start({
    id: 'phase-run',
    ownerType: 'party',
    ownerId: 'party-a',
    startedByPlayerId: 'a',
    dungeonId: 'phase-lab',
    dungeonDefinition: PHASE_DUNGEON,
    participants: [
      { playerId: 'a', maxHealth: 80 },
      { playerId: 'b', maxHealth: 80 },
    ],
    now: '2026-09-08T00:00:00.000Z',
  });
  run.attack({ playerId: 'a', attackPower: 5, now: '2026-09-08T00:00:00.100Z' });
  assert.equal(run.toJSON().phase, 'upgrade');
  run.chooseUpgrade('reinforce');
  const state = run.toJSON();
  state.participants.find((participant) => participant.playerId === 'b').hp = vulnerableHp;
  return new DungeonRun(state);
}

function reachThreadmark(run) {
  let phaseChange = null;
  for (let index = 0; index < 20; index += 1) {
    const state = run.toJSON();
    if (state.enemyIntent?.id === 'threadmark-lunge') return phaseChange;
    if (state.enemyIntent) {
      if (state.enemyIntent.reaction === 'interrupt') run.interrupt({ playerId: 'a' });
      else run.guard({ playerId: 'a', now: `2026-09-08T00:00:${String(index).padStart(2, '0')}.500Z` });
      continue;
    }
    const result = run.attack({ playerId: 'a', attackPower: 10, now: `2026-09-08T00:00:${String(index).padStart(2, '0')}.000Z` });
    phaseChange ||= result.events.find((event) => event.type === 'BossPhaseChanged') || null;
  }
  throw new Error('Boss did not reach the Phase II Threadmark window.');
}

test('boss enters Unraveling Phase II at half health and telegraphs faster', () => {
  const run = bossRun();
  const phaseChange = reachThreadmark(run);
  const state = run.toJSON();

  assert.ok(phaseChange);
  assert.equal(phaseChange.fromBattlePhase, 1);
  assert.equal(phaseChange.battlePhase, 2);
  assert.equal(state.enemy.battlePhase, 2);
  assert.equal(state.enemy.phaseName, 'Unraveling');
  assert.equal(state.enemyIntent.id, 'threadmark-lunge');
  assert.equal(state.enemyIntent.battlePhase, 2);
});

test('Phase II Threadmark targets the most vulnerable living Weaver', () => {
  const run = bossRun({ vulnerableHp: 18 });
  reachThreadmark(run);

  assert.equal(run.toJSON().enemyIntent.targetPlayerId, 'b');
  assert.match(run.toJSON().enemyIntent.hint, /Any living Weaver can Guard/i);
});

test('a teammate Guard intercepts Threadmark and keeps the marked ally untouched', () => {
  const run = bossRun({ vulnerableHp: 24 });
  reachThreadmark(run);
  const markedHpBefore = run.participant('b').hp;
  const protectorHpBefore = run.participant('a').hp;
  const rawDamage = run.toJSON().enemyIntent.damage;

  const result = run.guard({ playerId: 'a', now: '2026-09-08T00:00:30.000Z' });
  const protectedEvent = result.events.find((event) => event.type === 'PlayerProtected');

  assert.ok(protectedEvent);
  assert.equal(protectedEvent.playerId, 'a');
  assert.equal(protectedEvent.targetPlayerId, 'b');
  assert.equal(run.participant('b').hp, markedHpBefore);
  assert.equal(run.participant('a').hp, protectorHpBefore - Math.ceil(rawDamage / 2));
  assert.equal(protectedEvent.prevented, rawDamage - Math.ceil(rawDamage / 2));
  assert.equal(run.participant('a').successfulGuards, 1);
});

test('blindly attacking through Threadmark damages the marked ally instead', () => {
  const run = bossRun({ vulnerableHp: 24 });
  reachThreadmark(run);
  const markedHpBefore = run.participant('b').hp;
  const rawDamage = run.toJSON().enemyIntent.damage;

  const result = run.attack({ playerId: 'a', attackPower: 1, now: '2026-09-08T00:00:30.000Z' });

  assert.equal(result.events.some((event) => event.type === 'EnemyIntentIgnored'), true);
  assert.equal(result.events.some((event) => event.type === 'PlayerProtected'), false);
  assert.equal(run.participant('b').hp, Math.max(0, markedHpBefore - rawDamage));
});
