import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivityStreamService } from '../src/application/ActivityStreamService.js';
import { SQLiteActivityStreamRepository } from '../src/infrastructure/SQLiteActivityStreamRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

test('ItemSold projects one concise Gold receipt and legacy ItemSalvaged history renders canonically', () => {
  let streamId = 0;
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'sell-stream-player' });
  const player = gameRepository.getOrCreatePlayer({ threadedUserId: 'sell-stream-user', displayName: 'Adventurer' });
  const streamRepository = new SQLiteActivityStreamRepository({ database: gameRepository.db, idFactory: () => `sell-stream-${++streamId}` });
  const stream = new ActivityStreamService({ streamRepository, gameRepository });

  const sold = stream.recordDomainEvent({
    type: 'ItemSold',
    playerId: player.id,
    itemId: 'item-1',
    itemName: 'Cinder Helm',
    rarity: 'rare',
    gold: 12,
  });
  assert.equal(sold.body, 'Adventurer sold Cinder Helm · +12 Gold.');
  assert.doesNotMatch(sold.body, /salvage|Thread Dust|Dust/i);

  const legacy = stream.recordDomainEvent({
    type: 'ItemSalvaged',
    playerId: player.id,
    itemName: 'Old Needle',
    threadDust: 7,
  });
  assert.equal(legacy.body, 'Adventurer sold Old Needle · +7 Gold.');
  assert.equal(stream.recent().length, 2);
  gameRepository.close();
});
