import test from 'node:test';
import assert from 'node:assert/strict';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { SQLiteQuestRepository } from '../src/infrastructure/SQLiteQuestRepository.js';

test('SQLiteQuestRepository migrates an existing active row and preserves its accepted time and objective progress', () => {
  const game = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'legacy-quest-player' });
  const player = game.getOrCreatePlayer({ threadedUserId: 'legacy-quest-user', displayName: 'Legacy Quest Player' });
  const objectiveProgress = [{ objectiveId: 'complete-hunt', current: 2, target: 3, complete: false }];

  try {
    game.db.exec('DROP TABLE IF EXISTS player_quests');
    game.db.exec(`
      CREATE TABLE player_quests (
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        quest_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active', 'completed', 'claimed')),
        accepted_at TEXT NOT NULL,
        completed_at TEXT,
        claimed_at TEXT,
        objective_progress_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (player_id, quest_id)
      )
    `);
    game.db.prepare(`
      INSERT INTO player_quests (player_id, quest_id, status, accepted_at, objective_progress_json)
      VALUES (?, ?, 'active', ?, ?)
    `).run(player.id, 'guild-field-check', '2026-09-20T10:15:00.000Z', JSON.stringify(objectiveProgress));

    const migrated = new SQLiteQuestRepository({ database: game.db });
    const restored = migrated.get(player.id, 'guild-field-check');
    assert.deepEqual(restored.toJSON(), {
      questId: 'guild-field-check',
      status: 'active',
      acceptedAt: '2026-09-20T10:15:00.000Z',
      completedAt: null,
      claimedAt: null,
      objectiveProgress,
    });
    assert.ok(game.db.prepare('PRAGMA table_info(player_quests)').all().some((column) => column.name === 'definition_json'));

    const reopened = new SQLiteQuestRepository({ database: game.db });
    assert.deepEqual(reopened.get(player.id, 'guild-field-check').toJSON(), restored.toJSON());
  } finally {
    game.close();
  }
});
