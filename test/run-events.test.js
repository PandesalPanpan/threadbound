import test from 'node:test';
import assert from 'node:assert/strict';
import { AdventureRun } from '../src/domain/AdventureRun.js';
import { DungeonRun } from '../src/domain/DungeonRun.js';
import { RUN_EVENTS, selectRunEvent, snapshotRunEventSchedule } from '../src/domain/RunEventCatalog.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

const QUICK_HOLLOW = Object.freeze({
  id: 'frayed-hollow',
  name: 'Quick Frayed Hollow',
  minPlayers: 1,
  maxPlayers: 4,
  recommendedPlayers: 2,
  encounters: Object.freeze([
    Object.freeze({ id: 'one', name: 'One', hp: 1, retaliation: 1 }),
    Object.freeze({ id: 'two', name: 'Two', hp: 1, retaliation: 1 }),
    Object.freeze({ id: 'three', name: 'Three', hp: 1, retaliation: 1 }),
  ]),
  boss: Object.freeze({ id: 'boss', name: 'Boss', hp: 1, retaliation: 1 }),
});

function run(id = 'event-run-a') {
  return AdventureRun.start({
    id,
    ownerType: 'party',
    ownerId: 'party-1',
    startedByPlayerId: 'a',
    dungeonId: 'frayed-hollow',
    dungeonDefinition: QUICK_HOLLOW,
    participants: [
      { playerId: 'a', maxHealth: 80 },
      { playerId: 'b', maxHealth: 80 },
    ],
    now: '2026-09-08T00:00:00.000Z',
  });
}

function reachEvent(model) {
  model.attack({ playerId: 'a', attackPower: 10 });
  const second = model.attack({ playerId: 'a', attackPower: 10 });
  return second;
}

test('Frayed Hollow snapshots a deterministic event schedule at run start', () => {
  const schedule = snapshotRunEventSchedule('frayed-hollow');
  assert.equal(schedule.afterEncounterIndex, 1);
  assert.equal(schedule.events.length, 2);
  assert.deepEqual(schedule.events.map((event) => event.id).sort(), ['echoing-loom', 'frayed-cache']);
  assert.deepEqual(selectRunEvent(schedule, 'same-seed'), selectRunEvent(schedule, 'same-seed'));
  assert.notEqual(schedule.events[0], RUN_EVENTS[schedule.events[0].id]);
});

test('the second encounter pauses into one durable run decision instead of spawning the next foe immediately', () => {
  const model = run();
  const outcome = reachEvent(model);
  const state = model.toJSON();

  assert.equal(state.phase, 'event');
  assert.equal(state.enemy, null);
  assert.equal(state.encounterIndex, 2);
  assert.ok(state.runEvent);
  assert.equal(state.runEvent.choices.length, 2);
  assert.equal(state.runEventResume.enemy.id, 'three');
  assert.equal(outcome.events.some((event) => event.type === 'RunEventDiscovered'), true);
  assert.equal(state.runEventHistory.length, 0);
});

test('choosing a run event applies its real tradeoff once and resumes the snapshotted next encounter', () => {
  const model = run('choice-run');
  reachEvent(model);
  const before = model.toJSON();
  const choice = before.runEvent.choices[0];
  const hpBefore = before.participants.map((participant) => participant.hp);
  const focusBefore = before.participants.map((participant) => participant.focus);
  const attackBefore = before.runAttackBonus;

  const outcome = model.chooseRunEvent(choice.id);
  const after = model.toJSON();
  const effects = choice.effects || {};

  assert.equal(after.phase, 'combat');
  assert.equal(after.encounterIndex, 2);
  assert.equal(after.enemy.id, 'three');
  assert.equal(after.runEvent, null);
  assert.equal(after.runEventResume, null);
  assert.deepEqual(after.runEventHistory, [{ eventId: before.runEvent.id, choiceId: choice.id }]);
  assert.equal(after.runAttackBonus, attackBefore + Number(effects.runAttackBonus || 0));
  for (let index = 0; index < after.participants.length; index += 1) {
    const participant = after.participants[index];
    const expectedHp = Math.max(1, Math.min(participant.maxHp, hpBefore[index] + Number(effects.healAll || 0) - Number(effects.damageAll || 0)));
    const expectedFocus = Math.max(0, Math.min(participant.maxFocus, focusBefore[index] + Number(effects.focusAll || 0)));
    assert.equal(participant.hp, expectedHp);
    assert.equal(participant.focus, expectedFocus);
  }
  assert.equal(outcome.events[0].type, 'RunEventChosen');
  assert.equal(outcome.events[0].choiceId, choice.id);
});

test('combat is blocked while the party decision is unresolved', () => {
  const model = run();
  reachEvent(model);
  assert.throws(() => model.attack({ playerId: 'a', attackPower: 10 }), /Choose the run event/i);
});

test('repository treats the unresolved decision as the same active run across reconnects', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'a' });
  repository.getOrCreatePlayer({ threadedUserId: 'local:a', displayName: 'Weaver A' });
  let model = AdventureRun.start({
    id: 'persisted-event-run',
    ownerType: 'player',
    ownerId: 'a',
    startedByPlayerId: 'a',
    dungeonId: 'frayed-hollow',
    dungeonDefinition: QUICK_HOLLOW,
    participants: [{ playerId: 'a', maxHealth: 80 }],
  });
  let persisted = repository.createRun(model.toJSON());

  model = new AdventureRun(persisted);
  persisted = repository.saveRun(model.attack({ playerId: 'a', attackPower: 10 }).state);
  model = new AdventureRun(persisted);
  persisted = repository.saveRun(model.attack({ playerId: 'a', attackPower: 10 }).state);

  const active = repository.getActiveRun('a');
  assert.equal(active.id, 'persisted-event-run');
  assert.equal(active.phase, 'event');
  assert.ok(active.runEvent);
  assert.equal(active.version, persisted.version);
  repository.close();
});

test('pre-event persisted runs hydrate without gaining a surprise mid-run decision', () => {
  const legacy = DungeonRun.start({
    id: 'legacy-run',
    ownerType: 'player',
    ownerId: 'a',
    startedByPlayerId: 'a',
    dungeonId: 'frayed-hollow',
    dungeonDefinition: QUICK_HOLLOW,
    participants: [{ playerId: 'a', maxHealth: 80 }],
  });
  const model = new AdventureRun(legacy.toJSON());
  model.attack({ playerId: 'a', attackPower: 10 });
  model.attack({ playerId: 'a', attackPower: 10 });
  assert.equal(model.toJSON().phase, 'combat');
  assert.equal(model.toJSON().enemy.id, 'three');
});
