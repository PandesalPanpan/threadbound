import test from 'node:test';
import assert from 'node:assert/strict';
import { enforceBoundedStreamHistory, streamMessageRole } from '../public/ui-v2/stream.js';

test('presentation v2 classifies player, partner, NPC, and Threadbound messages without owning game state', () => {
  assert.equal(streamMessageRole({ kind: 'chat', actorPlayerId: 'p1' }, 'p1'), 'player');
  assert.equal(streamMessageRole({ kind: 'chat', actorPlayerId: 'p2' }, 'p1'), 'partner');
  assert.equal(streamMessageRole({ kind: 'system', eventType: 'NpcInteracted' }, 'p1'), 'npc');
  assert.equal(streamMessageRole({ kind: 'system', eventType: 'HuntResolved' }, 'p1'), 'threadbound');
});

test('presentation v2 bounds the live DOM while preserving the newest entries', () => {
  const entries = Array.from({ length: 105 }, (_, index) => ({
    index,
    removed: false,
    remove() { this.removed = true; },
  }));
  const log = { querySelectorAll: () => entries.filter((entry) => !entry.removed) };
  assert.equal(enforceBoundedStreamHistory(log, 100), 5);
  assert.deepEqual(entries.filter((entry) => entry.removed).map((entry) => entry.index), [0, 1, 2, 3, 4]);
  assert.deepEqual(entries.filter((entry) => !entry.removed).slice(0, 2).map((entry) => entry.index), [5, 6]);
});
