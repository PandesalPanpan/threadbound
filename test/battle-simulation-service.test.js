import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleSimulationService } from '../src/application/BattleSimulationService.js';
import { GameService } from '../src/application/GameService.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

test('BattleSimulationService returns one authoritative, replayable Figma 3v3 projection', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'battle-owner' });
  try {
    const player = repository.getOrCreatePlayer({ threadedUserId: 'battle-owner-user', displayName: 'Battle Owner' });
    const gameService = new GameService({ repository });
    const before = gameService.dashboard(player.id).character;
    const payload = new BattleSimulationService({ gameService }).preview(player.id);

    assert.equal(payload.authoritative, true);
    assert.equal(payload.replayable, true);
    assert.equal(payload.figma.fileKey, 'xfAbc94dv0LxhxhC9q9BhK');
    assert.equal(payload.figma.pageNodeId, '91:2');
    assert.deepEqual(payload.figma.referenceNodes, ['115:3', '115:199', '127:2', '115:395', '115:601']);
    assert.equal(payload.battle.players.length, 3);
    assert.equal(payload.battle.enemies.length, 3);
    assert.equal(new Set(payload.battle.combatants.map((combatant) => combatant.visualAssetId)).size, 6);
    assert.equal(payload.details.turns.length, payload.battle.turns.length);
    assert.ok(payload.battle.events.some((event) => event.type === 'SkillCastStarted'));
    assert.ok(payload.battle.events.some((event) => event.type === 'ManaChanged'));
    assert.match(payload.receipt.text, /Victory|Defeat|Draw/);
    assert.deepEqual(gameService.dashboard(player.id).character, before);
  } finally {
    repository.close();
  }
});
