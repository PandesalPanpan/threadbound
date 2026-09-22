import test from 'node:test';
import assert from 'node:assert/strict';
import { replayBeats, replayFrameAt, replayEpochMs, replayDurationMs } from '../frontend/src/battle/sharedReplay.js';

test('shared replay frames are derived from the server entry epoch', () => {
  const replay = { kind: 'simple-dungeon-battle', beats: [{ summary: 'one' }, { summary: 'two' }, { summary: 'three' }] };
  const createdAt = '2026-09-22T00:00:00.000Z';
  const epoch = replayEpochMs(createdAt);
  assert.equal(replayBeats(replay).length, 3);
  assert.equal(replayDurationMs(replay), 2160);
  assert.equal(replayFrameAt(replay, createdAt, epoch + 10).visibleIndex, 0);
  assert.equal(replayFrameAt(replay, createdAt, epoch + 800).visibleIndex, 1);
  assert.equal(replayFrameAt(replay, createdAt, epoch + 5000).complete, true);
});

test('reduced-motion shared replay jumps to the committed final beat', () => {
  const replay = { kind: 'automatic-battle-result', details: { turns: [{ summary: 'attack' }, { summary: 'defeat' }] } };
  const frame = replayFrameAt(replay, '2026-09-22T00:00:00.000Z', 0, { reducedMotion: true });
  assert.equal(frame.visibleIndex, 1);
  assert.equal(frame.complete, true);
});
