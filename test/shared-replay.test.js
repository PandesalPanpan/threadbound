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
