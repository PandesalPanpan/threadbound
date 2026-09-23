import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/application/EventBus.js';
import { GameService } from '../src/application/GameService.js';
import { InventoryService } from '../src/application/InventoryService.js';
import { AdventureRun } from '../src/domain/AdventureRun.js';
import { equipmentSlotUpgrade, planRelicUpgrade, relicProgression } from '../src/domain/RelicProgressionPolicy.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { SQLiteInventoryRepository } from '../src/infrastructure/SQLiteInventoryRepository.js';
import { arcEquipmentBudgetUsed } from '../src/domain/ArcEquipmentTemplatePolicy.js';

const RELIC_LAB = Object.freeze({
  id: 'relic-lab',
  name: 'Relic Lab',
  minPlayers: 1,
  maxPlayers: 4,
  encounters: Object.freeze([
    Object.freeze({ id: 'training-knot', name: 'Training Knot', hp: 200, retaliation: 1 }),
  ]),
  boss: Object.freeze({ id: 'training-needle', name: 'Training Needle', hp: 200, retaliation: 1 }),
});

function item(id, { slot = 'weapon', rarity = 'rare', attackBonus = 4, upgradeLevel = 0, attunementCode = null, stats = null } = {}) {
  const canonicalStats = {
    attackBonus,
    defenseBonus: 0,
    maxHpBonus: 0,
    speedBonus: 0,
    critChanceBonus: 0,
    ...(stats || {}),
  };
  return {
    id,
    definitionId: `def-${id}`,
    name: `Relic ${id}`,
    slot,
    rarity,
    attackBonus: canonicalStats.attackBonus,
    effectCode: 'none',
    effect: {
      code: 'none',
      name: 'Plain Weave',
      description: 'No special effect.',
      upgradeLevel,
      attunementCode,
      equipmentTemplate: {
        effectCodes: ['none'],
        requiredLevel: 1,
        areaNumber: 1,
        stats: canonicalStats,
        budget: { used: arcEquipmentBudgetUsed({ stats: canonicalStats, effects: ['none'] }), limit: 4 },
      },
    },
    source: 'test',
  };
}

function soloRun() {
  return AdventureRun.start({
    id: 'relic-run',
    ownerType: 'player',
    ownerId: 'a',
    startedByPlayerId: 'a',
    participants: [{ playerId: 'a', maxHealth: 40 }],
    dungeonId: 'relic-lab',
    dungeonDefinition: RELIC_LAB,
    now: '2026-09-08T00:00:00.000Z',
  });
}

function partyRun() {
  return AdventureRun.start({
    id: 'relic-party-run',
    ownerType: 'party',
    ownerId: 'party-a',
    startedByPlayerId: 'a',
    participants: [
      { playerId: 'a', maxHealth: 40 },
      { playerId: 'b', maxHealth: 40 },
    ],
    dungeonId: 'relic-lab',
    dungeonDefinition: RELIC_LAB,
    now: '2026-09-08T00:00:00.000Z',
  });
}

function withIntent(run, { focus = 0 } = {}) {
  const state = run.toJSON();
  state.participants[0].focus = focus;
  state.enemyIntent = {
    id: 'training-heavy',
    name: 'Training Heavy',
    kind: 'damage',
    reaction: 'guard',
    damage: 4,
    dueAt: '2026-09-08T00:00:10.000Z',
    battlePhase: 0,
  };
  return new AdventureRun(state);
}

test('equipment progression is rarity-capped and new Upgrade is neutral by default', () => {
  const equipment = item('policy', { rarity: 'uncommon' });
  assert.deepEqual(relicProgression(equipment), {
    level: 0,
    maxLevel: 2,
    nextCost: 8,
    canUpgrade: true,
    needsAttunement: false,
    attunementCode: null,
    attunement: null,
  });

  const first = planRelicUpgrade(equipment);
  assert.equal(first.cost, 8);
  assert.equal(first.nextLevel, 1);
  assert.equal(first.attunementCode, null);
  assert.equal(first.attunement, null);
  assert.deepEqual([first.statKey, first.statText], ['attackBonus', '+1 Attack']);

  // Old API callers and persisted items can still carry the tactical attunements until
  // their compatibility path is eventually removed.
  const legacyFirst = planRelicUpgrade(equipment, 'bulwark');
  assert.equal(legacyFirst.attunementCode, 'bulwark');
  const legacyUpgraded = item('policy', { rarity: 'uncommon', upgradeLevel: 1, attunementCode: 'bulwark' });
  assert.equal(planRelicUpgrade(legacyUpgraded).cost, 14);
  assert.throws(() => planRelicUpgrade(legacyUpgraded, 'mender'), (error) => error.code === 'relic_attunement_locked');
});

test('each equipment slot upgrades its authoritative stat and advances a coherent budget', () => {
  const expectations = [
    ['weapon', { attackBonus: 4 }, 'attackBonus', 5, '+1 Attack', 'attack', 1],
    ['helmet', { attackBonus: 0, defenseBonus: 2, maxHpBonus: 8 }, 'defenseBonus', 3, '+1 Defense', 'defense', 1],
    ['armor', { attackBonus: 0, defenseBonus: 2, maxHpBonus: 8 }, 'maxHpBonus', 12, '+4 Max HP', 'maxHp', 4],
    ['boots', { attackBonus: 0, defenseBonus: 3, speedBonus: 1 }, 'speedBonus', 2, '+1 Speed', 'speed', 1],
    ['accessory', { attackBonus: 0, critChanceBonus: 0.04 }, 'critChanceBonus', 0.05, '+1% Crit Chance', 'critChance', 0.01],
  ];
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'all-slot-upgrade-player' });
  const player = gameRepository.getOrCreatePlayer({ threadedUserId: 'all-slot-upgrade', displayName: 'Weaver' });
  gameRepository.addThreadDust(player.id, 40);
  for (const [slot, stats] of expectations) {
    gameRepository.addItem(player.id, item(`upgrade-${slot}`, { slot, stats }));
  }
  const inventoryRepository = new SQLiteInventoryRepository({ database: gameRepository.db });
  const events = [];
  const eventBus = new EventBus();
  eventBus.subscribe((event) => events.push(event));
  const service = new InventoryService({ inventoryRepository, gameRepository, eventBus });
  const gameService = new GameService({ repository: gameRepository, eventBus });

  for (const [slot, _initialStats, statKey, expectedValue, statText, characterStat, characterIncrease] of expectations) {
    assert.equal(equipmentSlotUpgrade(slot).statText, statText);
    const id = `upgrade-${slot}`;
    gameService.equipItem(player.id, id);
    const beforeUpgradeStat = gameService.dashboard(player.id).character.stats[characterStat];
    const result = service.upgrade(player.id, id);
    const upgraded = result.upgraded;
    const template = upgraded.effect.equipmentTemplate;
    assert.equal(upgraded[statKey], expectedValue, `${slot} projection should apply its slot stat`);
    assert.equal(template.stats[statKey], expectedValue, `${slot} template stat should match its projection`);
    assert.equal(template.budget.used, arcEquipmentBudgetUsed({ stats: template.stats, effects: template.effectCodes }));
    assert.equal(template.budget.used, template.budget.limit, 'one budget point is purchased per Upgrade from an initially full profile');
    assert.equal(template.budget.limit, 5);
    const event = events.at(-1);
    assert.equal(event.type, 'ItemUpgraded');
    assert.equal(event.statText, statText);
    assert.equal(event.attackIncrease, slot === 'weapon' ? 1 : 0);
    const afterUpgradeStat = gameService.dashboard(player.id).character.stats[characterStat];
    assert.ok(Math.abs((afterUpgradeStat - beforeUpgradeStat) - characterIncrease) < 1e-9, `${slot} Upgrade must affect the corresponding character stat`);
  }
  assert.equal(gameRepository.getPlayer(player.id).threadDust, 0);
  gameRepository.close();
});

test('Upgrading atomically spends Gold, raises Attack, keeps new items neutral, and rejects stale replay', () => {
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'p1' });
  const player = gameRepository.getOrCreatePlayer({ threadedUserId: 'u1', displayName: 'Weaver' });
  gameRepository.addThreadDust(player.id, 30);
  gameRepository.addItem(player.id, item('temper', { rarity: 'rare', attackBonus: 4 }));
  const inventoryRepository = new SQLiteInventoryRepository({ database: gameRepository.db });
  const events = [];
  const eventBus = new EventBus();
  eventBus.subscribe((event) => events.push(event));
  const service = new InventoryService({ inventoryRepository, gameRepository, eventBus });

  const result = service.upgrade(player.id, 'temper');
  assert.equal(result.upgraded.attackBonus, 5);
  assert.equal(result.upgraded.effect.upgradeLevel, 1);
  assert.equal(result.upgraded.effect.attunementCode, null);
  assert.equal(gameRepository.getPlayer(player.id).threadDust, 22);
  assert.equal(events.at(-1).type, 'ItemUpgraded');
  assert.equal(events.at(-1).goldSpent, 8);
  assert.equal(events.at(-1).attunementName, null);

  assert.throws(
    () => inventoryRepository.upgradeItem({ playerId: player.id, itemId: 'temper', expectedLevel: 0, cost: 8, attackIncrease: 1, attunementCode: null }),
    (error) => error.code === 'stale_relic_upgrade',
  );
  assert.equal(gameRepository.getPlayer(player.id).threadDust, 22);
  assert.equal(gameRepository.getItem('temper').attackBonus, 5);
  gameRepository.close();
});

test('insufficient Gold and active runs leave equipment progression unchanged', () => {
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'p1' });
  const player = gameRepository.getOrCreatePlayer({ threadedUserId: 'u1', displayName: 'Weaver' });
  gameRepository.addItem(player.id, item('locked', { rarity: 'rare', attackBonus: 4 }));
  const inventoryRepository = new SQLiteInventoryRepository({ database: gameRepository.db });
  const eventBus = new EventBus();
  const service = new InventoryService({ inventoryRepository, gameRepository, eventBus });
  const gameService = new GameService({ repository: gameRepository, eventBus });

  assert.throws(() => service.upgrade(player.id, 'locked'), (error) => {
    assert.equal(error.code, 'insufficient_thread_dust');
    assert.match(error.message, /Gold/);
    return true;
  });
  assert.equal(gameRepository.getItem('locked').attackBonus, 4);
  assert.equal(gameRepository.getItem('locked').effect.upgradeLevel, 0);

  gameRepository.addThreadDust(player.id, 20);
  const run = AdventureRun.start({
    id: 'active-run',
    ownerType: 'player',
    ownerId: player.id,
    startedByPlayerId: player.id,
    participants: [{ playerId: player.id, maxHealth: 40 }],
    dungeonId: 'frayed-hollow',
  });
  gameRepository.createRun(run.toJSON());
  assert.throws(() => service.upgrade(player.id, 'locked'), (error) => error.code === 'relic_upgrade_during_run');
  assert.throws(
    () => inventoryRepository.upgradeItem({ playerId: player.id, itemId: 'locked', expectedLevel: 0, cost: 8, attackIncrease: 1, attunementCode: null }),
    (error) => error.code === 'relic_upgrade_during_run',
  );
  assert.throws(() => gameService.equipItem(player.id, 'locked'), (error) => error.code === 'item_equip_during_run');
  assert.throws(() => gameRepository.equipItem(player.id, 'locked'), (error) => error.code === 'item_equip_during_run');
  assert.equal(gameRepository.getPlayer(player.id).equippedItemId, null);
  assert.equal(gameRepository.getPlayer(player.id).threadDust, 20);
  assert.equal(gameRepository.getItem('locked').attackBonus, 4);
  assert.equal(gameRepository.getItem('locked').effect.upgradeLevel, 0);
  gameRepository.close();
});

test('legacy Bulwark still turns a successful Guard into two Focus instead of one', () => {
  const run = withIntent(soloRun(), { focus: 0 });
  const outcome = run.guard({ playerId: 'a', attunementCode: 'bulwark', now: '2026-09-08T00:00:01.000Z' });
  assert.equal(outcome.state.participants[0].focus, 2);
  assert.ok(outcome.events.some((event) => event.type === 'RelicAttunementTriggered' && event.effect === 'bonus_focus' && event.amount === 1));
});

test('legacy Disruptor still produces measurable next-hit damage', () => {
  const run = withIntent(soloRun(), { focus: 0 });
  const interrupted = run.interrupt({ playerId: 'a', attunementCode: 'disruptor' });
  assert.equal(interrupted.state.participants[0].reactionDamageBonus, 3);
  const hpBefore = interrupted.state.enemy.hp;
  const attack = run.attack({ playerId: 'a', attackPower: 6, attunementCode: 'disruptor', now: '2026-09-08T00:00:02.000Z' });
  assert.equal(hpBefore - attack.state.enemy.hp, 9);
});

test('legacy Executioner combo remains readable for persisted tactical runs', () => {
  const run = soloRun();
  const state = run.toJSON();
  state.participants[0].focus = 4;
  state.enemy.statuses.exposed = 1;
  const attuned = new AdventureRun(state);
  const finisher = attuned.useSkill({ playerId: 'a', skillId: 'severing-knot', attackPower: 6, attunementCode: 'executioner' });
  assert.ok(finisher.events.some((event) => event.type === 'SkillComboTriggered'));
  assert.equal(finisher.state.participants[0].reactionDamageBonus, 4);
  const hpBefore = finisher.state.enemy.hp;
  const attack = attuned.attack({ playerId: 'a', attackPower: 6, attunementCode: 'executioner', now: '2026-09-08T00:00:02.000Z' });
  assert.equal(hpBefore - attack.state.enemy.hp, 10);
});

test('legacy Mender recovery remains readable for persisted tactical runs', () => {
  const run = partyRun();
  const state = run.toJSON();
  for (const participant of state.participants) {
    participant.hp = 20;
    participant.focus = 4;
  }
  const attuned = new AdventureRun(state);
  const outcome = attuned.useSkill({ playerId: 'a', skillId: 'mending-chorus', attackPower: 6, attunementCode: 'mender' });
  assert.equal(outcome.healed, 14);
  assert.deepEqual(outcome.events.filter((event) => event.type === 'PlayerHealed').map((event) => event.amount), [7, 7]);
  assert.equal(outcome.retaliation, 2);
  assert.equal(outcome.state.participants.find((participant) => participant.playerId === 'a').hp, 25);
  assert.equal(outcome.state.participants.find((participant) => participant.playerId === 'b').hp, 27);
  assert.equal(outcome.state.participants.find((participant) => participant.playerId === 'a').healingDone, 14);
  assert.ok(outcome.events.some((event) => event.type === 'RelicAttunementTriggered' && event.effect === 'bonus_healing' && event.amount === 4));
});
