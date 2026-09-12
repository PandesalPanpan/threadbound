import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AreaProgression, areaIdForNumber, projectArea } from '../src/domain/AreaProgression.js';
import { SQLiteAreaRepository } from '../src/infrastructure/SQLiteAreaRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

test('Area progression starts in Area 1 and exposes stable generic identity without inventing Arc content', () => {
  const progression = new AreaProgression();

  assert.deepEqual(progression.toJSON(), {
    currentAreaNumber: 1,
    highestUnlockedAreaNumber: 1,
    currentArea: { id: 'area-1', number: 1, name: 'Area 1' },
    highestUnlockedArea: { id: 'area-1', number: 1, name: 'Area 1' },
  });
  assert.equal(areaIdForNumber(3), 'area-3');
  assert.deepEqual(projectArea(2), { id: 'area-2', number: 2, name: 'Area 2' });
});

test('Area progression enforces current <= highest unlocked and never moves unlock progress backwards', () => {
  assert.throws(
    () => new AreaProgression({ currentAreaNumber: 2, highestUnlockedAreaNumber: 1 }),
    /cannot be above the highest unlocked Area/,
  );

  const unlocked = new AreaProgression().withHighestUnlockedArea(3);
  assert.equal(unlocked.canVisit(1), true);
  assert.equal(unlocked.canVisit(3), true);
  assert.equal(unlocked.canVisit(4), false);
  assert.equal(unlocked.withCurrentArea(2).currentAreaNumber, 2);
  assert.throws(() => unlocked.withCurrentArea(4), /not unlocked/);
  assert.throws(() => unlocked.withHighestUnlockedArea(2), /cannot move backwards/);
});

test('SQLite Area repository creates migration-safe defaults and persists current/highest state across restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'threadbound-area-'));
  const filename = join(directory, 'threadbound.sqlite');
  try {
    let game = new SQLiteGameRepository({ filename, idFactory: () => 'area-player' });
    const player = game.getOrCreatePlayer({ threadedUserId: 'area-user', displayName: 'Area Adventurer' });
    let areas = new SQLiteAreaRepository({ database: game.db });

    const initial = areas.get(player.id);
    assert.equal(initial.currentAreaNumber, 1);
    assert.equal(initial.highestUnlockedAreaNumber, 1);

    const unlocked = new AreaProgression().withHighestUnlockedArea(3).withCurrentArea(2);
    const saved = areas.save(player.id, unlocked);
    assert.equal(saved.currentArea.id, 'area-2');
    assert.equal(saved.highestUnlockedArea.id, 'area-3');
    game.close();

    game = new SQLiteGameRepository({ filename });
    areas = new SQLiteAreaRepository({ database: game.db });
    const restoredPlayer = game.getPlayer(player.id);
    const restored = areas.get(restoredPlayer.id);
    assert.equal(restored.currentAreaNumber, 2);
    assert.equal(restored.highestUnlockedAreaNumber, 3);
    assert.equal(restored.currentArea.name, 'Area 2');
    game.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('SQLite Area repository rejects unknown players rather than creating orphaned world state', () => {
  const game = new SQLiteGameRepository({ filename: ':memory:' });
  try {
    const areas = new SQLiteAreaRepository({ database: game.db });
    assert.throws(() => areas.get('missing-player'), /Player not found/);
  } finally {
    game.close();
  }
});
