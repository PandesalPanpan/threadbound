import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivityStreamService } from '../src/application/ActivityStreamService.js';
import { SQLiteActivityStreamRepository } from '../src/infrastructure/SQLiteActivityStreamRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function setup() {
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-a' });
  const streamRepository = new SQLiteActivityStreamRepository({ database: gameRepository.db });
  const service = new ActivityStreamService({ streamRepository, gameRepository });
  const player = gameRepository.getOrCreatePlayer({ threadedUserId: 'local:a', displayName: 'Local Weaver A' });
  return { gameRepository, service, player };
}

test('Tempering creates one readable social progression entry', () => {
  const { gameRepository, service, player } = setup();
  const entry = service.recordDomainEvent({
    type: 'ItemUpgraded',
    playerId: player.id,
    itemId: 'relic-a',
    itemName: 'Frayed Needle',
    level: 1,
    maxLevel: 3,
    attackIncrease: 1,
    threadDustSpent: 8,
    attunementCode: 'bulwark',
    attunementName: 'Bulwark Weave',
  });

  assert.match(entry.body, /Tempered Frayed Needle to 1\/3/);
  assert.match(entry.body, /Bulwark Weave/);
  assert.match(entry.body, /\+1 Attack/);
  assert.match(entry.body, /−8 Dust/);
  assert.equal(service.recent().length, 1);
  gameRepository.close();
});

test('fine-grained relic trigger stays private while the same combat receipt explains its payoff', () => {
  const { gameRepository, service, player } = setup();
  const trigger = service.recordDomainEvent({
    type: 'RelicAttunementTriggered',
    runId: 'run-a',
    dungeonId: 'frayed-hollow',
    playerId: player.id,
    attunementCode: 'bulwark',
    attunementName: 'Bulwark Weave',
    effect: 'bonus_focus',
    amount: 1,
  });
  const receipt = service.recordDomainEvent({
    type: 'CombatActionResolved',
    action: 'guard',
    playerId: player.id,
    runId: 'run-a',
    dungeonId: 'frayed-hollow',
    enemyId: 'frayed-wisp',
    enemyName: 'Frayed Wisp',
    enemyHp: 8,
    enemyMaxHp: 12,
    actorHp: 36,
    actorMaxHp: 40,
    actorFocus: 2,
    actorMaxFocus: 4,
    retaliation: 2,
    prevented: 2,
    targetPlayerId: player.id,
    phase: 'combat',
    relicAttunement: { code: 'bulwark', name: 'Bulwark Weave', effect: 'bonus_focus', amount: 1 },
  });

  assert.equal(trigger, null);
  assert.match(receipt.body, /Bulwark Weave: \+1 Focus/);
  assert.equal(service.recent().length, 1);
  gameRepository.close();
});
