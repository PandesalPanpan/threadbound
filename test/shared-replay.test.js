import test from 'node:test';
import assert from 'node:assert/strict';
import { replayMoments } from '../frontend/src/battle/sharedReplay.js';

test('shared replay keeps effect damage on its owner and expands multi-target, healing, status, and Mana events', () => {
  const replay = {
    kind: 'simple-dungeon-battle',
    players: [
      { id: 'player-a', name: 'A', startingHp: 40, endingHp: 34, maxHp: 40, startingMana: 100, endingMana: 0, maxMana: 100 },
      { id: 'player-b', name: 'B', startingHp: 25, endingHp: 30, maxHp: 40, startingMana: 10, endingMana: 28, maxMana: 100 },
    ],
    enemies: [
      { id: 'enemy-a', name: 'First Wisp', startingHp: 12, endingHp: 8, maxHp: 12 },
      { id: 'enemy-b', name: 'Second Wisp', startingHp: 12, endingHp: 9, maxHp: 12 },
    ],
    actions: [{
      index: 0,
      phase: 'player',
      actorId: 'player-a',
      actorName: 'A',
      targetId: 'enemy-a',
      targetName: 'First Wisp',
      actorHpBefore: 40,
      actorHpAfterEffects: 37,
      actorHpAfter: 34,
      effectDamage: 3,
      actionType: 'skill',
      skillId: 'threadsong',
      manaBefore: 100,
      manaAfter: 0,
      damageEvents: [
        { targetId: 'enemy-a', damage: 4, targetHpBefore: 12, targetHpAfter: 8 },
        { targetId: 'enemy-b', damage: 3, targetHpBefore: 12, targetHpAfter: 9 },
      ],
      healingEvents: [{ targetId: 'player-b', healing: 5, targetHpBefore: 25, targetHpAfter: 30 }],
      manaEvents: [
        { combatantId: 'player-a', manaBefore: 100, manaAfter: 0, delta: -100 },
        { combatantId: 'player-b', manaBefore: 10, manaAfter: 28, delta: 18 },
      ],
      effectEvents: [
        { type: 'poison', damage: 3 },
        { type: 'fire', targetId: 'enemy-a', applied: true, incomingPotency: 3 },
      ],
      summary: 'A cast Threadsong across the enemy line.',
    }],
  };

  const moments = replayMoments(replay);
  assert.deepEqual(moments.map((moment) => [moment.actorId, moment.targetId, moment.damage, moment.healing]), [
    ['player-a', 'player-a', 3, 0],
    ['player-a', 'enemy-a', 4, 0],
    ['player-a', 'enemy-b', 3, 0],
    ['player-a', 'player-b', 0, 5],
  ]);
  assert.equal(moments[0].summary, 'A took 3 effect damage.');
  assert.equal(moments[0].retaliation, false);
  assert.equal(moments[1].events.some((event) => event.kind === 'effect-applied' && event.targetId === 'enemy-a'), true);
  assert.deepEqual(moments[2].manaEvents.map((event) => event.combatantId), ['player-a', 'player-b']);
});

test('legacy explicit retaliation still becomes its own shared replay moment', () => {
  const replay = {
    kind: 'simple-dungeon-battle',
    players: [{ id: 'player-a', name: 'A', startingHp: 30, endingHp: 25, maxHp: 30 }],
    enemy: { id: 'enemy-a', name: 'Wisp', startingHp: 10, endingHp: 5, maxHp: 10 },
    beats: [{
      index: 0,
      actorId: 'player-a',
      actorName: 'A',
      targetId: 'enemy-a',
      targetName: 'Wisp',
      damage: 5,
      targetHpBefore: 10,
      targetHpAfter: 5,
      retaliation: 5,
      retaliationActorId: 'enemy-a',
      retaliationTargetId: 'player-a',
      retaliationTargetHpBefore: 30,
      retaliationTargetHpAfter: 25,
      summary: 'A hit Wisp for 5 damage.',
    }],
  };
  const moments = replayMoments(replay);
  assert.equal(moments.length, 2);
  assert.equal(moments[1].retaliation, true);
  assert.equal(moments[1].damage, 5);
  assert.equal(moments[1].targetId, 'player-a');
});
