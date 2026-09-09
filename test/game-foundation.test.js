import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../src/domain/Character.js';
import { DungeonRun, scalingForPlayerCount } from '../src/domain/DungeonRun.js';
import { ITEM_EFFECTS, ItemGenerator } from '../src/domain/ItemGenerator.js';
import { Party } from '../src/domain/Party.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { EventBus } from '../src/application/EventBus.js';
import { AchievementProjector } from '../src/application/AchievementProjector.js';
import { GameService } from '../src/application/GameService.js';
import { HoneyPurchaseService } from '../src/application/HoneyPurchaseService.js';
import { PartyService } from '../src/application/PartyService.js';

function takeReactiveDomainTurn(run, playerId, attackPower = 6) {
  const state = run.toJSON();
  if (state.enemyIntent) {
    if (state.enemyIntent.reaction === 'interrupt') return run.interrupt({ playerId });
    return run.guard({ playerId });
  }
  return run.attack({ playerId, attackPower });
}

function takeReactiveSoloTurn(game, repository, runId, playerId) {
  const state = repository.getRun(runId);
  if (state.enemyIntent) {
    if (state.enemyIntent.reaction === 'interrupt') return game.interrupt(playerId, runId);
    return game.guard(playerId, runId);
  }
  return game.attack(playerId, runId);
}

function takeReactivePartyTurn(game, repository, runId, players, turn) {
  const state = repository.getRun(runId);
  const living = players.filter((playerId) => state.participants.find((participant) => participant.playerId === playerId)?.hp > 0);
  const actor = living[turn % living.length];
  const downed = state.participants.find((participant) => participant.hp <= 0);
  const actorState = state.participants.find((participant) => participant.playerId === actor);

  if (downed && actorState.reviveCharges > 0) {
    game.revive(actor, runId, downed.playerId);
    return turn + 1;
  }
  if (state.enemyIntent) {
    if (state.enemyIntent.reaction === 'interrupt') game.interrupt(actor, runId);
    else game.guard(actor, runId);
    return turn + 1;
  }
  game.attack(actor, runId);
  return turn + 1;
}

function chooseOfferedPower(game, repository, runId, playerId) {
  const state = repository.getRun(runId);
  assert.equal(state.phase, 'upgrade');
  assert.equal(state.runUpgradeOfferIds.length, 3);
  const choiceId = state.runUpgradeOfferIds[0];
  game.chooseUpgrade(playerId, runId, choiceId);
  return choiceId;
}

test('character and solo dungeon domain rules preserve the complete first run loop', () => {
  const character = new Character({ id: 'p1', threadedUserId: '42', displayName: 'Tester', equippedItem: { attackBonus: 3 } });
  assert.equal(character.attackPower, 9);

  const run = DungeonRun.start({
    id: 'r1', ownerType: 'player', ownerId: 'p1', startedByPlayerId: 'p1', dungeonId: 'frayed-hollow',
    participants: [{ playerId: 'p1', maxHealth: 40 }],
  });

  let defeated = 0;
  for (let turn = 0; turn < 40 && run.toJSON().phase === 'combat'; turn += 1) {
    const result = takeReactiveDomainTurn(run, 'p1', 6);
    defeated += result.events.filter((event) => event.type === 'EnemyDefeated').length;
  }
  assert.equal(defeated, 3);
  assert.equal(run.state.phase, 'upgrade');

  run.chooseUpgrade('sharpen');
  assert.equal(run.state.phase, 'boss');
  let final = null;
  for (let turn = 0; turn < 40 && run.toJSON().phase === 'boss'; turn += 1) final = takeReactiveDomainTurn(run, 'p1', 6);
  assert.equal(run.state.phase, 'complete');
  assert.ok(final?.events.some((event) => event.type === 'DungeonCompleted'));
});

test('co-op scaling is sub-linear and contribution is tracked per participant', () => {
  const scaling = scalingForPlayerCount(2);
  assert.equal(scaling.enemyHealthMultiplier, 1.65);
  assert.ok(scaling.enemyHealthMultiplier < 2);

  const run = DungeonRun.start({
    id: 'coop-1', ownerType: 'party', ownerId: 'party-1', startedByPlayerId: 'p1', dungeonId: 'frayed-hollow',
    participants: [{ playerId: 'p1', maxHealth: 40 }, { playerId: 'p2', maxHealth: 40 }],
  });
  assert.equal(run.state.enemy.maxHp, 20);
  run.attack({ playerId: 'p1', attackPower: 6 });
  run.interrupt({ playerId: 'p2' });
  run.attack({ playerId: 'p2', attackPower: 6 });
  assert.equal(run.participant('p1').contributionDamage, 6);
  assert.equal(run.participant('p2').contributionDamage, 6);
});

test('party domain enforces readiness, leadership, and four-player capacity', () => {
  const party = new Party({ id: 'party', leaderPlayerId: 'p1', joinCode: 'ABC123', members: [{ playerId: 'p1', ready: true }] });
  party.addMember('p2');
  party.addMember('p3');
  party.addMember('p4');
  assert.throws(() => party.addMember('p5'), /full/i);
  assert.equal(party.canStart('p1'), false);
  party.setReady('p2', true);
  party.setReady('p3', true);
  party.setReady('p4', true);
  assert.equal(party.canStart('p1'), true);
  assert.equal(party.canStart('p2'), false);
});

test('generated rewards only use registered effect vocabulary', () => {
  const values = [0.1, 0.2, 0.3, 0.4, 0.5];
  let index = 0;
  const generator = new ItemGenerator({ rng: () => values[(index++) % values.length], idFactory: () => 'item-1' });
  const item = generator.generateReward();
  assert.ok(Object.hasOwn(ITEM_EFFECTS, item.effectCode));
  assert.ok(item.attackBonus >= 1 && item.attackBonus <= 3);
});

test('service layer preserves solo reward, progression, achievements, and equipment power across build drafts and a discovery', () => {
  let id = 0;
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => `player-${++id}` });
  const bus = new EventBus();
  const projector = new AchievementProjector(repository);
  bus.subscribe((event) => projector.handle(event));
  const service = new GameService({
    repository,
    eventBus: bus,
    idFactory: () => 'run-1',
    itemGenerator: new ItemGenerator({ rng: () => 0.1, idFactory: () => 'reward-1' }),
  });
  const player = service.ensurePlayer({ id: 1001, name: 'Tester' });
  const run = service.startDungeon(player.id, 'frayed-hollow');

  for (let turn = 0; turn < 40 && repository.getRun(run.id).phase === 'combat'; turn += 1) takeReactiveSoloTurn(service, repository, run.id, player.id);
  const firstPower = repository.getRun(run.id);
  assert.equal(firstPower.phase, 'upgrade');
  assert.ok(firstPower.runUpgradeResume?.enemy);
  chooseOfferedPower(service, repository, run.id, player.id);
  assert.equal(repository.getRun(run.id).phase, 'combat');

  for (let turn = 0; turn < 40 && repository.getRun(run.id).phase === 'combat'; turn += 1) takeReactiveSoloTurn(service, repository, run.id, player.id);
  const discovery = repository.getRun(run.id);
  assert.equal(discovery.phase, 'event');
  assert.ok(discovery.runEvent?.choices?.length === 2);
  service.chooseUpgrade(player.id, run.id, discovery.runEvent.choices[0].id);
  assert.equal(repository.getRun(run.id).phase, 'combat');

  for (let turn = 0; turn < 40 && repository.getRun(run.id).phase === 'combat'; turn += 1) takeReactiveSoloTurn(service, repository, run.id, player.id);
  const finalPower = repository.getRun(run.id);
  assert.equal(finalPower.phase, 'upgrade');
  assert.equal(finalPower.runUpgradeResume, null);
  chooseOfferedPower(service, repository, run.id, player.id);

  let completed = null;
  for (let turn = 0; turn < 60 && repository.getRun(run.id).phase === 'boss'; turn += 1) completed = takeReactiveSoloTurn(service, repository, run.id, player.id);

  assert.equal(completed?.state.phase, 'complete');
  assert.equal(repository.getRun(run.id).runEventHistory.length, 1);
  assert.equal(repository.getRun(run.id).selectedUpgrades.length, 2);
  assert.equal(repository.listItems(player.id).length, 1);
  assert.equal(repository.getPlayer(player.id).threadDust, 15);
  assert.equal(repository.getWorldState().frayedHollowClears, 1);
  assert.deepEqual(repository.listAchievements(player.id).map((achievement) => achievement.id).sort(), ['first_blood', 'hollow_cleared']);

  service.equipItem(player.id, 'reward-1');
  assert.ok(service.dashboard(player.id).character.attackPower > 6);
  assert.ok(repository.listAchievements(player.id).some((achievement) => achievement.id === 'armed_and_threaded'));
  repository.close();
});

test('two-player party owns one run, leader owns shared discoveries and power drafts, and both players receive completion rewards', () => {
  let playerSequence = 0;
  let rewardSequence = 0;
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => `player-${++playerSequence}` });
  const bus = new EventBus();
  const projector = new AchievementProjector(repository);
  bus.subscribe((event) => projector.handle(event));
  const game = new GameService({
    repository,
    eventBus: bus,
    idFactory: () => 'party-run-1',
    itemGenerator: new ItemGenerator({ rng: () => 0.1, idFactory: () => `coop-reward-${++rewardSequence}` }),
  });
  const parties = new PartyService({ repository, idFactory: () => 'party-1', joinCodeFactory: () => 'ABC123' });
  const leader = game.ensurePlayer({ id: 2001, name: 'Leader' });
  const partner = game.ensurePlayer({ id: 2002, name: 'Partner' });

  parties.createParty(leader.id);
  parties.joinParty(partner.id, 'abc123');
  assert.throws(() => game.startDungeon(leader.id, 'frayed-hollow'), /ready party leader/i);
  parties.setReady(partner.id, true);

  const run = game.startDungeon(leader.id, 'frayed-hollow');
  assert.equal(run.ownerType, 'party');
  assert.equal(run.ownerId, 'party-1');
  assert.equal(run.participants.length, 2);
  assert.equal(game.dashboard(partner.id).activeRun.id, run.id);

  let turn = 0;
  const players = [leader.id, partner.id];
  while (repository.getRun(run.id).phase === 'combat') turn = takeReactivePartyTurn(game, repository, run.id, players, turn);

  let choiceState = repository.getRun(run.id);
  assert.equal(choiceState.phase, 'upgrade');
  let powerId = choiceState.runUpgradeOfferIds[0];
  assert.throws(() => game.chooseUpgrade(partner.id, run.id, powerId), /party leader/i);
  game.chooseUpgrade(leader.id, run.id, powerId);
  assert.equal(repository.getRun(run.id).phase, 'combat');

  while (repository.getRun(run.id).phase === 'combat') turn = takeReactivePartyTurn(game, repository, run.id, players, turn);
  choiceState = repository.getRun(run.id);
  assert.equal(choiceState.phase, 'event');
  const eventChoice = choiceState.runEvent.choices[0].id;
  assert.throws(() => game.chooseUpgrade(partner.id, run.id, eventChoice), /party leader/i);
  game.chooseUpgrade(leader.id, run.id, eventChoice);
  assert.equal(repository.getRun(run.id).runEventHistory.length, 1);

  while (repository.getRun(run.id).phase === 'combat') turn = takeReactivePartyTurn(game, repository, run.id, players, turn);
  choiceState = repository.getRun(run.id);
  assert.equal(choiceState.phase, 'upgrade');
  powerId = choiceState.runUpgradeOfferIds[0];
  assert.throws(() => game.chooseUpgrade(partner.id, run.id, powerId), /party leader/i);
  game.chooseUpgrade(leader.id, run.id, powerId);

  while (repository.getRun(run.id).phase === 'boss') turn = takeReactivePartyTurn(game, repository, run.id, players, turn);

  const completed = repository.getRun(run.id);
  assert.equal(completed.phase, 'complete');
  assert.equal(completed.rewardsGranted, true);
  assert.equal(completed.selectedUpgrades.length, 2);
  assert.ok(completed.participants.every((participant) => participant.contributionDamage > 0));
  assert.ok(completed.participants.some((participant) => participant.successfulGuards + participant.successfulInterrupts > 0));
  assert.equal(repository.listItems(leader.id).length, 1);
  assert.equal(repository.listItems(partner.id).length, 1);
  assert.equal(repository.getPlayer(leader.id).threadDust, 15);
  assert.equal(repository.getPlayer(partner.id).threadDust, 15);
  assert.equal(repository.getWorldState().frayedHollowClears, 1);
  assert.ok(repository.listAchievements(leader.id).some((achievement) => achievement.id === 'hollow_cleared'));
  assert.ok(repository.listAchievements(partner.id).some((achievement) => achievement.id === 'hollow_cleared'));

  const partyAfterRun = repository.getParty('party-1');
  assert.equal(partyAfterRun.status, 'forming');
  assert.equal(partyAfterRun.members.find((member) => member.playerId === leader.id).ready, true);
  assert.equal(partyAfterRun.members.find((member) => member.playerId === partner.id).ready, false);
  repository.close();
});

test('Honey sequential retries call Threaded again but grant exactly once', async () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-1' });
  const player = repository.getOrCreatePlayer({ threadedUserId: '1001', displayName: 'Tester' });
  let calls = 0;
  const gateway = {
    async spendPoints(_token, request) {
      calls += 1;
      assert.equal(request.amount, 25);
      return { transaction_id: 'txn-1', balance: 75 };
    },
  };
  const service = new HoneyPurchaseService({ repository, threadedGateway: gateway });
  const input = { playerId: player.id, threadedUserId: '1001', accessToken: 'token', idempotencyKey: 'same-key-123' };
  const first = await service.purchaseTrainingCache(input);
  const second = await service.purchaseTrainingCache(input);

  assert.equal(first.grantApplied, true);
  assert.equal(second.grantApplied, false);
  assert.equal(calls, 2);
  assert.equal(repository.listItems(player.id).length, 1);
  repository.close();
});

test('Honey concurrent retries converge on one durable grant', async () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-1' });
  const player = repository.getOrCreatePlayer({ threadedUserId: '1001', displayName: 'Tester' });
  let arrivals = 0;
  let release;
  const bothArrived = new Promise((resolve) => { release = resolve; });
  const gateway = {
    async spendPoints() {
      arrivals += 1;
      if (arrivals === 2) release();
      await bothArrived;
      return { transaction_id: 'txn-concurrent-1', balance: 75 };
    },
  };
  const service = new HoneyPurchaseService({ repository, threadedGateway: gateway });
  const input = { playerId: player.id, threadedUserId: '1001', accessToken: 'token', idempotencyKey: 'concurrent-key-123' };
  const results = await Promise.all([
    service.purchaseTrainingCache(input),
    service.purchaseTrainingCache(input),
  ]);

  assert.equal(results.filter((result) => result.grantApplied).length, 1);
  assert.equal(repository.listItems(player.id).length, 1);
  assert.equal(repository.getPurchaseGrant(player.id, input.idempotencyKey).threadedTransactionId, 'txn-concurrent-1');
  repository.close();
});
