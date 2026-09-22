import test from 'node:test';
import assert from 'node:assert/strict';
import { replayBeats, replayFrameAt, replayEpochMs, replayDurationMs, replayMoments } from '../frontend/src/battle/sharedReplay.js';

test('shared replay frames are derived from the server entry epoch', () => {
  const replay = { kind: 'simple-dungeon-battle', beats: [{ summary: 'one' }, { summary: 'two' }, { summary: 'three' }] };
  const createdAt = '2026-09-22T00:00:00.000Z';
  const epoch = replayEpochMs(createdAt);
  assert.equal(replayBeats(replay).length, 3);
  assert.equal(replayDurationMs(replay), 3750);
  assert.equal(replayFrameAt(replay, createdAt, epoch + 10).visibleIndex, 0);
  assert.equal(replayFrameAt(replay, createdAt, epoch + 1300).visibleIndex, 1);
  assert.equal(replayFrameAt(replay, createdAt, epoch + 5000).complete, true);
});

test('reduced-motion shared replay jumps to the committed final beat', () => {
  const replay = { kind: 'automatic-battle-result', details: { turns: [{ summary: 'attack' }, { summary: 'defeat' }] } };
  const frame = replayFrameAt(replay, '2026-09-22T00:00:00.000Z', 0, { reducedMotion: true });
  assert.equal(frame.visibleIndex, 1);
  assert.equal(frame.complete, true);
});

test('dungeon retaliation is a second synchronized visual moment', () => {
  const replay = {
    kind: 'simple-dungeon-battle',
    players: [{ id: 'weaver-1', displayName: 'Aster', startingHp: 20, maxHp: 20 }],
    enemy: { id: 'mold-mite', name: 'Mold Mite', startingHp: 10, maxHp: 10 },
    beats: [{
      actorId: 'weaver-1',
      actorName: 'Aster',
      targetId: 'mold-mite',
      targetName: 'Mold Mite',
      damage: 3,
      targetHpBefore: 10,
      targetHpAfter: 7,
      retaliation: 2,
      retaliationActorId: 'mold-mite',
      retaliationTargetId: 'weaver-1',
      retaliationActorHpBefore: 7,
      retaliationActorHpAfter: 7,
      retaliationTargetHpBefore: 20,
      retaliationTargetHpAfter: 18,
      summary: 'Aster hit Mold Mite for 3 damage.',
    }],
  };
  const moments = replayMoments(replay);
  assert.equal(moments.length, 2);
  assert.equal(moments[0].retaliation, false);
  assert.equal(moments[1].retaliation, true);
  assert.equal(replayFrameAt(replay, 0, 500).phase, 'trajectory');
  assert.equal(replayFrameAt(replay, 0, 1250 + 600).currentActorId, 'mold-mite');
});

test('multi-enemy replays preserve atomic action order and combatant identities', () => {
  const replay = {
    kind: 'simple-dungeon-battle',
    players: [{ id: 'p1', displayName: 'Peter', startingHp: 20, maxHp: 20 }, { id: 'p2', displayName: 'Isa', startingHp: 20, maxHp: 20 }],
    enemies: [
      { id: 'room-2:mite:0', combatantId: 'room-2:mite:0', name: 'Mold Mite', startingHp: 4, maxHp: 4, endingHp: 0 },
      { id: 'room-2:wolf:1', combatantId: 'room-2:wolf:1', name: 'Ridge Wolf', startingHp: 8, maxHp: 8, endingHp: 6 },
      { id: 'room-2:raven:2', combatantId: 'room-2:raven:2', name: 'Ash Raven', startingHp: 8, maxHp: 8, endingHp: 6 },
    ],
    actions: [
      { phase: 'player', actorId: 'p1', targetId: 'room-2:mite:0', damage: 4, targetHpBefore: 4, targetHpAfter: 0, defeated: true, summary: 'Peter defeated Mold Mite.' },
      { phase: 'player', actorId: 'p2', targetId: 'room-2:wolf:1', damage: 2, targetHpBefore: 8, targetHpAfter: 6, summary: 'Isa hit Ridge Wolf.' },
      { phase: 'enemy', actorId: 'room-2:wolf:1', targetId: 'p2', damage: 2, actorHpBefore: 6, actorHpAfter: 6, targetHpBefore: 20, targetHpAfter: 18, summary: 'Ridge Wolf hit Isa.' },
      { phase: 'enemy', actorId: 'room-2:raven:2', targetId: 'p1', damage: 2, actorHpBefore: 8, actorHpAfter: 8, targetHpBefore: 20, targetHpAfter: 18, summary: 'Ash Raven hit Peter.' },
    ],
  };
  const moments = replayMoments(replay);
  assert.deepEqual(moments.map((moment) => [moment.actorId, moment.targetId]), [
    ['p1', 'room-2:mite:0'],
    ['p2', 'room-2:wolf:1'],
    ['room-2:wolf:1', 'p2'],
    ['room-2:raven:2', 'p1'],
  ]);
  assert.equal(moments[0].defeated, true);
  assert.equal(moments[2].retaliation, false, 'new atomic enemy actions do not create a synthetic retaliation moment');
  assert.equal(replayFrameAt(replay, 0, 1250 * 3 + 600).currentActorId, 'room-2:raven:2');
});
