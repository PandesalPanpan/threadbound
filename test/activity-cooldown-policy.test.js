import test from 'node:test';
import assert from 'node:assert/strict';
import { HuntService } from '../src/application/HuntService.js';
import { ACTIVITY_COOLDOWN_RULES, resolveActivityCooldown } from '../src/domain/ActivityCooldownPolicy.js';
import { ITEM_EFFECTS } from '../src/domain/ItemGenerator.js';
import { SQLiteEquipmentRepository } from '../src/infrastructure/SQLiteEquipmentRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

test('activity cooldown policy applies allowlisted equipment and future buff modifiers with a hard cap', () => {
  const equipment = {
    boots: { id: 'boots', effectCode: 'quick_hunt' },
  };
  const result = resolveActivityCooldown({
    activity: 'hunt',
    baseCooldownSeconds: 15,
    equipment,
    buffCodes: ['hunt_haste_major', 'hunt_haste_minor'],
  });

  assert.equal(result.requestedReductionPercent, 55);
  assert.equal(result.appliedReductionPercent, ACTIVITY_COOLDOWN_RULES.maxReductionPercent);
  assert.equal(result.effectiveCooldownSeconds, 8);
  assert.equal(result.capped, true);
  assert.deepEqual(result.modifiers.map(({ source, code }) => [source, code]), [
    ['equipment', 'quick_hunt'],
    ['buff', 'hunt_haste_major'],
    ['buff', 'hunt_haste_minor'],
  ]);
});

test('activity cooldown policy ignores unrelated equipment and rejects unknown buff mechanics', () => {
  const baseline = resolveActivityCooldown({
    activity: 'hunt',
    baseCooldownSeconds: 15,
    equipment: { weapon: { id: 'weapon', effectCode: 'ember_edge' } },
  });
  assert.equal(baseline.effectiveCooldownSeconds, 15);
  assert.equal(baseline.appliedReductionPercent, 0);

  assert.throws(() => resolveActivityCooldown({
    activity: 'hunt',
    baseCooldownSeconds: 15,
    buffCodes: ['arbitrary_generated_code'],
  }), /Unsupported activity cooldown buff code/);
});

test('zero-second test cooldown remains zero even when modifiers are present', () => {
  const result = resolveActivityCooldown({
    activity: 'hunt',
    baseCooldownSeconds: 0,
    equipment: { accessory: { id: 'a', effectCode: 'quick_hunt' } },
    buffCodes: ['hunt_haste_major'],
  });
  assert.equal(result.effectiveCooldownSeconds, 0);
});

test('equipped quick_hunt effect shortens the authoritative Hunt claim and projection', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'cooldown-mod-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'cooldown-mod-user', displayName: 'Runner' });
  const equipmentRepository = new SQLiteEquipmentRepository({ database: repository.db });
  const item = {
    id: 'quick-hunt-boots',
    definitionId: 'generated-boots',
    name: 'Trailrunner Boots',
    slot: 'boots',
    rarity: 'rare',
    rarityTier: 3,
    attackBonus: 0,
    effectCode: 'quick_hunt',
    effect: { ...ITEM_EFFECTS.quick_hunt, upgradeLevel: 0, attunementCode: null },
    visualAssetId: 'item.leather-boots.v1',
    source: 'test',
  };
  repository.addItem(player.id, item);
  equipmentRepository.equip(player.id, item.id);

  let now = new Date('2026-09-12T11:00:00.000Z');
  const events = [];
  const service = new HuntService({
    repository,
    equipmentRepository,
    eventBus: { publish: (event) => events.push(event) },
    rng: () => 0.99,
    now: () => new Date(now),
    huntCooldownSeconds: 15,
  });

  const first = service.hunt(player.id);
  assert.equal(first.cooldown.baseCooldownSeconds, 15);
  assert.equal(first.cooldown.reductionPercent, 20);
  assert.equal(first.cooldown.remainingSeconds, 12);
  assert.equal(first.cooldown.nextReadyAt, '2026-09-12T11:00:12.000Z');
  const event = events.find((entry) => entry.type === 'HuntResolved');
  assert.equal(event.huntBaseCooldownSeconds, 15);
  assert.equal(event.huntCooldownSeconds, 12);
  assert.equal(event.huntCooldownReductionPercent, 20);

  now = new Date('2026-09-12T11:00:11.000Z');
  assert.throws(() => service.hunt(player.id), (error) => {
    assert.equal(error.code, 'hunt_cooldown');
    assert.equal(error.remainingSeconds, 1);
    return true;
  });

  now = new Date('2026-09-12T11:00:12.000Z');
  assert.doesNotThrow(() => service.hunt(player.id));
  repository.close();
});
