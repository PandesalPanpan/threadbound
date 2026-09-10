import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/application/EventBus.js';
import { GameService } from '../src/application/GameService.js';
import { InventoryService } from '../src/application/InventoryService.js';
import { AdventureRun } from '../src/domain/AdventureRun.js';
import { planRelicUpgrade, relicProgression } from '../src/domain/RelicProgressionPolicy.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { SQLiteInventoryRepository } from '../src/infrastructure/SQLiteInventoryRepository.js';

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

function item(id, { rarity = 'rare', attackBonus = 4, upgradeLevel = 0, attunementCode = null } = {}) {
  return {
    id,
    definitionId: `def-${id}`,
    name: `Relic ${id}`,
    slot: 'weapon',
    rarity,
    attackBonus,
    effectCode: 'none',
    effect: {
      code: 'none',
      name: 'Plain Weave',
      description: 'No special effect.',
      upgradeLevel,
      attunementCode,
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

function withIntent(run, { reaction = 'guard' } = {}) {
  const state = run.toJSON();
  state.enemyIntent = {
    id: 'training-heavy',
    name: 'Training Heavy',
    kind: 'damage',
    reaction,
    damage: 4,
    dueAt: '2026-09-08T00:00:10.000Z',
    battlePhase: 0,
  };
  return new AdventureRun(state);
}

test('relic progression is rarity-capped and first Temper locks a build attunement', () => {
  const relic = item('policy', { rarity: 'uncommon' });
  assert.deepEqual(relicProgression(relic), {
    level: 0,
    maxLevel: 2,
    nextCost: 8,
    canUpgrade: true,
    needsAttunement: true,
    attunementCode: null,
    attunement: null,
  });
  assert.throws(() => planRelicUpgrade(relic), (error) => error.code === 'invalid_relic_attunement');
  const first = planRelicUpgrade(relic, 'bulwark');
  assert.equal(first.cost, 8);
  assert.equal(first.nextLevel, 1);
  assert.equal(first.attunementCode, 'bulwark');

  const tempered = item('policy', { rarity: 'uncommon', upgradeLevel: 1, attunementCode: 'bulwark' });
  assert.equal(planRelicUpgrade(tempered).cost, 14);
  assert.throws(() => planRelicUpgrade(tempered, 'mender'), (error) => error.code === 'relic_attunement_locked');
});

test('Tempering atomically spends Dust, raises Attack, persists attunement, and rejects stale replay', () => {
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'p1' });
  const player = gameRepository.getOrCreatePlayer({ threadedUserId: 'u1', displayName: 'Weaver' });
  gameRepository.addThreadDust(player.id, 30);
  gameRepository.addItem(player.id, item('temper', { rarity: 'rare', attackBonus: 4 }));
  const inventoryRepository = new SQLiteInventoryRepository({ database: gameRepository.db });
  const events = [];
  const eventBus = new EventBus();
  eventBus.subscribe((event) => events.push(event));
  const service = new InventoryService({ inventoryRepository, gameRepository, eventBus });

  const result = service.upgrade(player.id, 'temper', 'disruptor');
  assert.equal(result.upgraded.attackBonus, 5);
  assert.equal(result.upgraded.effect.upgradeLevel, 1);
  assert.equal(result.upgraded.effect.attunementCode, 'disruptor');
  assert.equal(gameRepository.getPlayer(player.id).threadDust, 22);
  assert.equal(events.at(-1).type, 'ItemUpgraded');
  assert.equal(events.at(-1).attunementName, 'Disruptor Weave');

  assert.throws(
    () => inventoryRepository.upgradeItem({ playerId: player.id, itemId: 'temper', expectedLevel: 0, cost: 8, attackIncrease: 1, attunementCode: 'disruptor' }),
    (error) => error.code === 'stale_relic_upgrade',
  );
  assert.equal(gameRepository.getPlayer(player.id).threadDust, 22);
  assert.equal(gameRepository.getItem('temper').attackBonus, 5);
  gameRepository.close();
});

test('insufficient Dust and active runs leave relic progression and equipment unchanged', () => {
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'p1' });
  const player = gameRepository.getOrCreatePlayer({ threadedUserId: 'u1', displayName: 'Weaver' });
  gameRepository.addItem(player.id, item('locked', { rarity: 'rare', attackBonus: 4 }));
  const inventoryRepository = new SQLiteInventoryRepository({ database: gameRepository.db });
  const eventBus = new EventBus();
  const service = new InventoryService({ inventoryRepository, gameRepository, eventBus });
  const gameService = new GameService({ repository: gameRepository, eventBus });

  assert.throws(() => service.upgrade(player.id, 'locked', 'bulwark'), (error) => error.code === 'insufficient_thread_dust');
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
  assert.throws(() => service.upgrade(player.id, 'locked', 'bulwark'), (error) => error.code === 'relic_upgrade_during_run');
  assert.throws(
    () => inventoryRepository.upgradeItem({ playerId: player.id, itemId: 'locked', expectedLevel: 0, cost: 8, attackIncrease: 1, attunementCode: 'bulwark' }),
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

test('Bulwark turns a successful streamlined Guard into primed damage without Focus', () => {
  const run = withIntent(soloRun());
  const outcome = run.guard({ playerId: 'a', attunementCode: 'bulwark', now: '2026-09-08T00:00:01.000Z' });
  assert.equal(outcome.state.participants[0].focus, 0);
  assert.equal(outcome.state.participants[0].reactionDamageBonus, 2);
  assert.ok(outcome.events.some((event) => event.type === 'RelicAttunementTriggered' && event.effect === 'prime_damage' && event.amount === 2));
  assert.equal(outcome.events.some((event) => event.type === 'FocusChanged'), false);

  const hpBefore = outcome.state.enemy.hp;
  const attack = run.attack({ playerId: 'a', attackPower: 6, attunementCode: 'bulwark', now: '2026-09-08T00:00:02.000Z' });
  assert.equal(hpBefore - attack.state.enemy.hp, 8);
});

test('Disruptor turns a successful Interrupt into measurable next-hit damage without Focus', () => {
  const run = withIntent(soloRun(), { reaction: 'interrupt' });
  const interrupted = run.interrupt({ playerId: 'a', attunementCode: 'disruptor' });
  assert.equal(interrupted.state.participants[0].focus, 0);
  assert.equal(interrupted.state.participants[0].reactionDamageBonus, 3);
  const hpBefore = interrupted.state.enemy.hp;
  const attack = run.attack({ playerId: 'a', attackPower: 6, attunementCode: 'disruptor', now: '2026-09-08T00:00:02.000Z' });
  assert.equal(hpBefore - attack.state.enemy.hp, 9);
});

test('Executioner rewards a Severing Knot interrupt with a primed follow-up without Exposed', () => {
  const run = withIntent(soloRun(), { reaction: 'interrupt' });
  const finisher = run.useSkill({ playerId: 'a', skillId: 'severing-knot', attackPower: 6, attunementCode: 'executioner' });
  assert.equal(finisher.state.participants[0].focus, 0);
  assert.equal(finisher.state.enemy.statuses.exposed, 0);
  assert.equal(finisher.events.some((event) => event.type === 'SkillComboTriggered'), false);
  assert.ok(finisher.events.some((event) => event.type === 'EnemyInterrupted' && event.bySkillId === 'severing-knot'));
  assert.equal(finisher.state.participants[0].reactionDamageBonus, 4);
  const hpBefore = finisher.state.enemy.hp;
  const attack = run.attack({ playerId: 'a', attackPower: 6, attunementCode: 'executioner', now: '2026-09-08T00:00:02.000Z' });
  assert.equal(hpBefore - attack.state.enemy.hp, 10);
});

test('Mender adds two recovery per living Weaver and keeps contribution totals honest without Focus', () => {
  const run = partyRun();
  const state = run.toJSON();
  for (const participant of state.participants) participant.hp = 20;
  const attuned = new AdventureRun(state);
  const outcome = attuned.useSkill({ playerId: 'a', skillId: 'mending-chorus', attackPower: 6, attunementCode: 'mender' });
  assert.equal(outcome.healed, 14);
  assert.deepEqual(outcome.events.filter((event) => event.type === 'PlayerHealed').map((event) => event.amount), [7, 7]);
  assert.equal(outcome.events.some((event) => event.type === 'FocusChanged'), false);
  assert.equal(outcome.retaliation, 2);
  assert.equal(outcome.state.participants.find((participant) => participant.playerId === 'a').hp, 25);
  assert.equal(outcome.state.participants.find((participant) => participant.playerId === 'b').hp, 27);
  assert.equal(outcome.state.participants.find((participant) => participant.playerId === 'a').healingDone, 14);
  assert.ok(outcome.events.some((event) => event.type === 'RelicAttunementTriggered' && event.effect === 'bonus_healing' && event.amount === 4));
});
