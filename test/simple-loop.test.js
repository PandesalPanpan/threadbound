import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveHunt } from '../src/domain/HuntEncounter.js';
import { AdventureRun, DUNGEONS } from '../src/domain/AdventureRun.js';
import { prepareSimpleDungeon, dungeonReadiness } from '../src/domain/SimpleDungeonPolicy.js';

function startSimple({ attackPower = 9, maxHealth = 100 } = {}) {
  const run = AdventureRun.startSimple({
    id: 'simple-run',
    ownerType: 'player',
    ownerId: 'p1',
    startedByPlayerId: 'p1',
    participants: [{ playerId: 'p1', maxHealth }],
    dungeonId: 'frayed-hollow',
    dungeonDefinition: DUNGEONS['frayed-hollow'],
    now: '2026-09-10T00:00:00.000Z',
  });
  return { run, attackPower };
}

function attackUntilTransition(run, attackPower, max = 20) {
  const initialPhase = run.toJSON().phase;
  const initialEnemy = run.toJSON().enemy?.id;
  for (let step = 0; step < max; step += 1) {
    const outcome = run.attack({ playerId: 'p1', attackPower, equipmentEffect: 'none', now: `2026-09-10T00:00:${String(step).padStart(2, '0')}.000Z` });
    const state = outcome.state;
    if (state.phase !== initialPhase || state.enemy?.id !== initialEnemy) return outcome;
  }
  throw new Error('Simple dungeon did not transition in the expected number of attacks.');
}

test('hunt resolves one enemy in one command using permanent stats', () => {
  const weak = resolveHunt({ attackPower: 6, maxHealth: 40, enemyRoll: 0.99 });
  const strong = resolveHunt({ attackPower: 10, maxHealth: 40, enemyRoll: 0.99 });

  assert.equal(weak.enemy.name, 'Thread Wolf');
  assert.equal(weak.victory, true);
  assert.equal(weak.attacksRequired, 3);
  assert.equal(weak.damageTaken, 8);
  assert.equal(weak.threadDust, 3);
  assert.equal(strong.attacksRequired, 2);
  assert.equal(strong.damageTaken, 4);
});

test('simple dungeon policy makes Frayed Hollow a real Attack stat check', () => {
  const original = DUNGEONS['frayed-hollow'];
  const hardened = prepareSimpleDungeon(original);

  assert.equal(original.encounters[0].hp, 12);
  assert.equal(hardened.encounters[0].hp, 24);
  assert.equal(hardened.encounters[0].retaliation, 3);
  assert.equal(hardened.boss.hp, 48);
  assert.equal(hardened.boss.retaliation, 6);
  assert.deepEqual(hardened.encounters[0].abilities, []);
  assert.equal(hardened.recommendedAttack, 9);

  assert.equal(dungeonReadiness({ attackPower: 6, maxHealth: 40, definition: hardened }).ready, false);
  assert.equal(dungeonReadiness({ attackPower: 9, maxHealth: 40, definition: hardened }).ready, true);
});

test('new simple dungeon has Attack only and never enters buffs, events, Focus, or upgrade drafts', () => {
  const { run, attackPower } = startSimple();
  const start = run.toJSON();

  assert.equal(start.simpleCombat, true);
  assert.equal(start.runPowerDraftsEnabled, false);
  assert.equal(start.enemy.maxHp, 24);
  assert.equal(start.participants[0].focus, 0);
  assert.equal(start.participants[0].mendCharges, 0);
  assert.throws(() => run.guard({ playerId: 'p1' }), /Attack is the only combat action/);
  assert.throws(() => run.interrupt({ playerId: 'p1' }), /Attack is the only combat action/);

  let state = run.toJSON();
  let transitions = 0;
  while (!['complete', 'failed'].includes(state.phase) && transitions < 8) {
    const outcome = attackUntilTransition(run, attackPower);
    state = outcome.state;
    transitions += 1;
    assert.notEqual(state.phase, 'event');
    assert.notEqual(state.phase, 'upgrade');
    assert.equal(state.enemyIntent, null);
    assert.equal(state.runAttackBonus, 0);
    assert.deepEqual(state.selectedUpgrades, []);
    assert.equal(state.participants[0].focus, 0);
  }

  assert.equal(state.phase, 'complete');
  assert.equal(state.enemy, null);
});

test('base Attack can clear rooms but fails the harder boss while recommended Attack survives', () => {
  const simulate = (attackPower) => {
    const { run } = startSimple({ attackPower, maxHealth: 40 });
    let state = run.toJSON();
    for (let action = 0; action < 40 && !['complete', 'failed'].includes(state.phase); action += 1) {
      state = run.attack({ playerId: 'p1', attackPower, equipmentEffect: 'none', now: `2026-09-10T00:01:${String(action).padStart(2, '0')}.000Z` }).state;
    }
    return state;
  };

  assert.equal(simulate(6).phase, 'failed');
  assert.equal(simulate(9).phase, 'complete');
});
