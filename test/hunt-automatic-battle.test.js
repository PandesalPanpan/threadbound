import test from 'node:test';
import assert from 'node:assert/strict';
import { HuntService } from '../src/application/HuntService.js';
import { resolveAutomaticHunt } from '../src/domain/HuntEncounter.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

test('automatic Hunt preserves the familiar baseline while shared simulator owns turn history and HP', () => {
  const result = resolveAutomaticHunt({
    player: {
      id: 'hero',
      name: 'Adventurer',
      attack: 6,
      defense: 2,
      maxHp: 40,
      speed: 10,
      critChance: 0.05,
      equipment: {},
    },
    currentHealth: 40,
    enemyRoll: 0.99,
    random: () => 0.99,
  });

  assert.equal(result.enemy.id, 'thread-wolf');
  assert.equal(result.victory, true);
  assert.equal(result.remainingHp, 32);
  assert.equal(result.damageTaken, 8);
  assert.equal(result.attacksRequired, 3);
  assert.equal(result.battle.context.activity, 'hunt');
  assert.equal(result.battle.winnerId, 'hero');
  assert.deepEqual(result.battle.turns.map((turn) => turn.actorId), [
    'hero', 'hunt-enemy:thread-wolf', 'hero', 'hunt-enemy:thread-wolf', 'hero',
  ]);
  assert.equal(result.battle.turns[0].metadata.kind, 'basic-attack');
});

test('Hunt consumes shared Speed and constrained equipment-effect semantics', () => {
  const result = resolveAutomaticHunt({
    player: {
      id: 'fast-hero',
      name: 'Fast Adventurer',
      attack: 6,
      defense: 2,
      maxHp: 40,
      speed: 20,
      critChance: 0,
      equipment: {
        weapon: { id: 'opening-weapon', effectCode: 'opening_strike', attackBonus: 0 },
      },
    },
    currentHealth: 40,
    enemyRoll: 0.99,
    random: () => 0.99,
  });

  assert.equal(result.battle.turns[0].metadata.equipmentBonusDamage, 2);
  assert.equal(result.battle.turns[0].targetDamage, 8);
  assert.equal(result.battle.turns[1].actorId, 'fast-hero', 'Speed can grant a consecutive Hunt action');
  assert.equal(result.battle.turns[1].metadata.equipmentBonusDamage, 0, 'opening strike only applies to the first action');
});

test('HuntService persists the shared simulator result while retaining one-command rewards and event compatibility', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'hunt-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'hunt-user', displayName: 'Adventurer' });
  const events = [];
  const service = new HuntService({
    repository,
    eventBus: { publish: (event) => events.push(event) },
    rng: () => 0.99,
  });

  const result = service.hunt(player.id);
  const event = events.find((entry) => entry.type === 'HuntResolved');

  assert.equal(result.battle.context.activity, 'hunt');
  assert.equal(result.battle.outcome, 'victory');
  assert.equal(repository.getPlayer(player.id).currentHealth, result.remainingHp);
  assert.equal(repository.getPlayer(player.id).threadDust, result.gold);
  assert.equal(event.battleOutcome, result.battle.outcome);
  assert.equal(event.battleTurnCount, result.battle.turns.length);
  assert.equal(event.remainingHp, result.remainingHp);
  assert.equal(event.gold, result.gold);
  assert.equal(event.experienceGained, result.experience);
  assert.deepEqual(event.questProgress, []);

  repository.close();
});
