import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivityStreamService } from '../src/application/ActivityStreamService.js';
import { SQLiteActivityStreamRepository } from '../src/infrastructure/SQLiteActivityStreamRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

test('Area travel produces one concise public Adventure Stream receipt from committed domain facts', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'area-stream-player' });
  try {
    const player = repository.getOrCreatePlayer({ threadedUserId: 'area-stream-user', displayName: 'Mira' });
    const streamRepository = new SQLiteActivityStreamRepository({ database: repository.db, idFactory: () => 'area-stream-entry' });
    const stream = new ActivityStreamService({ streamRepository, gameRepository: repository });

    const entry = stream.recordDomainEvent({
      type: 'AreaTraveled',
      playerId: player.id,
      fromArea: { id: 'area-1', number: 1, name: 'Area 1' },
      toArea: { id: 'area-2', number: 2, name: 'Area 2' },
      highestUnlockedArea: { id: 'area-2', number: 2, name: 'Area 2' },
    });

    assert.equal(entry.kind, 'system');
    assert.equal(entry.eventType, 'AreaTraveled');
    assert.equal(entry.actorName, 'THREADBOUND');
    assert.equal(entry.body, 'Mira traveled from Area 1 to Area 2.');
    assert.equal(stream.recent().length, 1);
  } finally {
    repository.close();
  }
});
