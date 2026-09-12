import test from 'node:test';
import assert from 'node:assert/strict';
import { HEALING_RULES, passiveRecoveryProjection, resolveHealAction } from '../src/domain/HealingPolicy.js';
import { HuntService } from '../src/application/HuntService.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function setup() {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-1' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'threaded-1', displayName: 'Test Adventurer' });
  const events = [];
  const service = new HuntService({
    repository,
    eventBus: { publish: (event) => events.push(event) },
    huntCooldownSeconds: 0,
  });
  return { repository, player, service, events };
}

function captureError(action) {
  try {
    action();
  } catch (error) {
    return error;
  }
  assert.fail('Expected action to throw.');
}

test('routine Heal consumes one potion and heals by the canonical bounded amount', () => {
  const { repository, player, service, events } = setup();
  repository.setPlayerHealth(player.id, 25);

  const recovery = service.heal(player.id);

  assert.equal(HEALING_RULES.healthPotionHeal, 12);
  assert.deepEqual(recovery, { healed: 12, currentHealth: 37, maxHealth: 40, healthPotions: 0 });
  assert.equal(repository.getPlayer(player.id).currentHealth, 37);
  assert.equal(events.at(-1).type, 'HealthPotionUsed');
  assert.equal(events.at(-1).healMethod, 'health_potion');
});

test('Heal is rejected at full health and when no potion is available', () => {
  const fullHealthError = captureError(() => resolveHealAction({ currentHealth: 40, maxHealth: 40, healthPotions: 1 }));
  assert.equal(fullHealthError.code, 'health_already_full');
  assert.match(fullHealthError.message, /full health/i);

  const noPotionError = captureError(() => resolveHealAction({ currentHealth: 20, maxHealth: 40, healthPotions: 0 }));
  assert.equal(noPotionError.code, 'no_health_potions');
  assert.match(noPotionError.message, /heal naturally/i);
});

test('routine Heal remains outside active dungeons while legacy potion route keeps its error code', () => {
  const activeRun = { id: 'legacy-run' };
  assert.throws(
    () => resolveHealAction({ activeRun, currentHealth: 20, maxHealth: 40, healthPotions: 1 }),
    (error) => error.code === 'heal_during_dungeon' && /Heal is only available/i.test(error.message),
  );

  const { repository, player, service } = setup();
  repository.getActiveRun = () => activeRun;
  assert.throws(
    () => service.useHealthPotion(player.id),
    (error) => error.code === 'potion_during_dungeon' && /Heal is only available/i.test(error.message),
  );
});

test('passive out-of-combat recovery projects one HP per minute', () => {
  const now = Date.parse('2026-09-12T12:05:30.000Z');
  const projection = passiveRecoveryProjection({
    currentHealth: 37,
    maxHealth: 40,
    healthUpdatedAt: '2026-09-12T12:05:00.000Z',
    now,
  });

  assert.equal(HEALING_RULES.passiveRecoverySecondsPerHp, 60);
  assert.deepEqual(projection, { nextHealthInSeconds: 30, fullHealthInSeconds: 150 });
});

test('passive recovery reports zero timers at full health', () => {
  assert.deepEqual(
    passiveRecoveryProjection({ currentHealth: 40, maxHealth: 40, healthUpdatedAt: '2026-09-12T12:00:00.000Z' }),
    { nextHealthInSeconds: 0, fullHealthInSeconds: 0 },
  );
});
