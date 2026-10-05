import test from 'node:test';
import assert from 'node:assert/strict';
import { ArcManifestService } from '../src/application/ArcManifestService.js';
import { EventBus } from '../src/application/EventBus.js';
import { PartyService } from '../src/application/PartyService.js';
import { SimpleDungeonService } from '../src/application/SimpleDungeonService.js';
import { Character } from '../src/domain/Character.js';
import { AdventureRun } from '../src/domain/AdventureRun.js';
import { resolveAutomaticHunt } from '../src/domain/HuntEncounter.js';
import { AREA_CONTENT } from '../src/content/AreaContentCatalog.js';
import { SQLiteArcManifestRepository } from '../src/infrastructure/SQLiteArcManifestRepository.js';
import { SQLiteCodexRepository } from '../src/infrastructure/SQLiteCodexRepository.js';
import { SQLiteEquipmentRepository } from '../src/infrastructure/SQLiteEquipmentRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { ShopService } from '../src/application/ShopService.js';

const SIMULATION_SEEDS = 24;
const STARTING_HEALTH = 40;
const MINOR_POTION_HEAL = 8;

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function playerActionsFor(repository, participants) {
  const equipmentRepository = new SQLiteEquipmentRepository({ database: repository.db });
  return Object.fromEntries(participants.map((participant) => {
    const equipment = equipmentRepository.getLoadout(participant.playerId);
    const character = new Character({
      ...repository.getPlayer(participant.playerId),
      equippedItem: equipment.weapon,
      equipment,
    });
    return [participant.playerId, {
      attackPower: character.attackPower,
      defense: character.stats.defense,
      speed: character.stats.speed,
      critChance: character.stats.critChance,
      equipment,
    }];
  }));
}

function freshPartyRun(seed, { loadouts = null } = {}) {
  let nextId = 0;
  const repository = new SQLiteGameRepository({
    filename: ':memory:',
    idFactory: () => `balance-${seed}-${++nextId}`,
  });
  const arcManifestService = new ArcManifestService({
    gameRepository: repository,
    codexRepository: new SQLiteCodexRepository({ database: repository.db }),
    manifestRepository: new SQLiteArcManifestRepository({ database: repository.db }),
    rng: () => 0,
  });
  const eventBus = new EventBus();
  const parties = new PartyService({ repository, eventBus });
  const dungeons = new SimpleDungeonService({
    repository,
    eventBus,
    arcManifestService,
    idFactory: () => `brightbell-balance-${seed}`,
  });
  const leader = repository.getOrCreatePlayer({ threadedUserId: `balance-${seed}:leader`, displayName: 'Leader' });
  const partner = repository.getOrCreatePlayer({ threadedUserId: `balance-${seed}:partner`, displayName: 'Partner' });
  const equipmentRepository = new SQLiteEquipmentRepository({ database: repository.db });
  const shop = new ShopService({ repository, eventBus, idFactory: () => `balance-item-${seed}-${++nextId}` });
  const members = [leader, partner];
  for (const [index, profile] of (loadouts || []).entries()) {
    const skus = ({
      frontline: ['bronze-sword'],
      'frontline-armored': ['bronze-sword', 'bronzeweave-coat'],
      ranged: ['ashstring-bow'],
      healer: ['copper-sparkstaff'],
    })[profile];
    if (!skus) continue;
    for (const sku of skus) {
      const cost = sku === 'copper-sparkstaff' ? 12 : 8;
      repository.addThreadDust(members[index].id, cost);
      const purchase = shop.purchase(members[index].id, sku);
      equipmentRepository.equip(members[index].id, purchase.item.id);
    }
  }
  const party = parties.createParty(leader.id);
  parties.joinParty(partner.id, party.joinCode);
  parties.setReady(partner.id, true);
  const definition = dungeons.definition('brightbell-trial');
  const run = new AdventureRun(dungeons.startDungeon(leader.id, 'brightbell-trial'));
  return { repository, leader, partner, party, definition, run };
}

function simulateFreshParty(seed, options = {}) {
  const fixture = freshPartyRun(seed, options);
  const { repository, leader, run, definition } = fixture;
  const playerIds = run.toJSON().participants.map((participant) => participant.playerId);
  const potionStock = new Map(playerIds.map((playerId) => [playerId, 1]));
  const healingWindows = [];
  const enemySkills = [];
  const healingEvents = [];
  const battleDurations = [];
  let playerActionCount = 0;
  let playerDamageDealt = 0;
  let potionUses = 0;
  let hpAtBossStart = null;

  try {
    while (!['complete', 'failed'].includes(run.toJSON().phase)) {
      const state = run.toJSON();
      if (state.phase === 'between_encounter') {
        const weakest = [...state.participants]
          .filter((participant) => participant.hp > 0)
          .sort((left, right) => left.hp - right.hp || left.playerId.localeCompare(right.playerId))[0];
        const claim = run.intermissionPotionStatus();
        if (weakest
          && weakest.hp <= weakest.maxHp - MINOR_POTION_HEAL
          && potionStock.get(weakest.playerId) > 0
          && !claim?.potionClaimed) {
          run.usePotionBetweenEncounters({ playerId: weakest.playerId, healed: MINOR_POTION_HEAL });
          potionStock.set(weakest.playerId, potionStock.get(weakest.playerId) - 1);
          potionUses += 1;
          healingWindows.push(claim.windowId);
        }
        run.continueEncounter({ playerId: leader.id });
        continue;
      }

      if (state.encounterIndex === definition.simpleStages.length && hpAtBossStart === null) {
        hpAtBossStart = state.participants.reduce((sum, participant) => sum + participant.hp, 0);
      }
      const outcome = run.resolveSimpleEncounter({
        playerActions: playerActionsFor(repository, state.participants),
        signatureSkills: true,
        now: '2026-09-23T00:00:00.000Z',
      });
      healingEvents.push(...outcome.arenaReplay.events
        .filter((event) => event.healingEvents?.length)
        .flatMap((event) => event.healingEvents));
      battleDurations.push(outcome.arenaReplay.durationMs);
      for (const action of outcome.actions) {
        if (!playerIds.includes(String(action.actorCombatantId))) continue;
        playerActionCount += 1;
        playerDamageDealt += Number(action.damage || 0);
      }
      enemySkills.push(...outcome.actions
        .filter((action) => action.phase === 'enemy' && action.actionType === 'skill')
        .map((action) => ({
          roomIndex: state.encounterIndex,
          combatantId: action.actorCombatantId,
          enemyId: action.actorDefinitionId,
          skillId: action.skillId,
        })));
    }

    const final = run.toJSON();
    return {
      seed,
      phase: final.phase,
      startingPartyHp: STARTING_HEALTH * playerIds.length,
      hpAtBossStart,
      endingPartyHp: final.participants.reduce((sum, participant) => sum + participant.hp, 0),
      weakestEndingHp: Math.min(...final.participants.map((participant) => participant.hp)),
      downed: final.participants.some((participant) => participant.hp <= 0),
      potionUses,
      healingWindows,
      enemySkills,
      healingEvents,
      battleDurations,
      playerActionCount,
      playerDamageDealt,
    };
  } finally {
    repository.close();
  }
}

test('Area 1 progression balance sustains a geared two-player Level 1 endurance run', () => {
  const area = AREA_CONTENT.find((candidate) => candidate.number === 1);
  const results = Array.from({ length: SIMULATION_SEEDS }, (_unused, seed) => simulateFreshParty(seed, {
    loadouts: ['frontline-armored', 'frontline-armored'],
  }));
  const preBossNetLosses = results.map((result) => result.startingPartyHp - result.hpAtBossStart);
  const finalNetLosses = results.map((result) => result.startingPartyHp - result.endingPartyHp);
  const med = median(preBossNetLosses);
  const medianFinalNetLoss = median(finalNetLosses);

  assert.equal(area.progressionChallenge.requiredHumanPlayers, 2);
  assert.equal(results.length, SIMULATION_SEEDS);
  assert.ok(results.every((result) => result.phase === 'complete'), 'every deterministic party should clear the challenge');
  assert.ok(results.every((result) => !result.downed), 'both fresh Level 1 players should survive each measured clear');
  assert.ok(results.every((result) => result.potionUses >= 1 && result.potionUses <= 2), 'each run should use the available intermission pressure without exceeding fresh potion stock');
  assert.ok(results.every((result) => new Set(result.healingWindows).size === result.healingWindows.length), 'the party should use at most one Heal in each intermission window');
  assert.ok(med >= 10 && med <= 15, `median net pre-boss loss should stay in the measured 10–15 HP pressure band; got ${med}`);
  assert.ok(medianFinalNetLoss >= 24 && medianFinalNetLoss <= 34, `median full-run party loss should stay in the measured 24–34 HP endurance band; got ${medianFinalNetLoss}`);
  assert.ok(Math.min(...results.map((result) => result.weakestEndingHp)) >= 1, 'no player should be down at completion');
  assert.ok(median(results.map((result) => result.weakestEndingHp)) >= 14, 'the median weakest player should finish with a meaningful HP buffer after equipping Defense and Max HP');

  const castCount = (roomIndex, enemyId, skillId) => results.filter((result) => result.enemySkills.some((cast) => (
    cast.roomIndex === roomIndex && cast.enemyId === enemyId && cast.skillId === skillId
  ))).length;
  assert.ok(castCount(0, 'ribbon-boar', 'shield-break') >= 16, 'the first group should expose its Boar skill pressure without requiring every loadout to wait for the cast');
  assert.ok(castCount(1, 'meadow-breeze', 'threadsong') >= 17, 'the timed mid-run room should exercise its support skill in most measured clears');
  assert.ok(castCount(2, 'parade-golem', 'ember-burst') >= 18, 'the boss should exercise its line attack');
  assert.ok(castCount(2, 'ribbon-boar', 'shield-break') >= 13, 'the boss add should survive long enough to exercise its authored skill in more than half of measured boss stages');

  const huntPlayer = {
    id: 'area-one-hunt-reference',
    name: 'Equipped Level 1',
    attack: 7,
    defense: 3,
    maxHp: STARTING_HEALTH + 4,
    speed: 10,
    critChance: 0.05,
    equipment: {
      weapon: { slot: 'weapon', weaponFamily: 'sword', combatProfileCode: 'frontline', attackBonus: 1 },
      armor: { slot: 'armor', defenseBonus: 1, maxHpBonus: 4 },
    },
  };
  const areaOneHuntLosses = area.huntEncounters.map((encounter) => resolveAutomaticHunt({
    player: huntPlayer,
    currentHealth: STARTING_HEALTH,
    encounter,
    random: () => 0.5,
  }).damageTaken);
  const twoHuntReferenceLoss = areaOneHuntLosses.reduce((sum, loss) => sum + loss, 0) * 2 / areaOneHuntLosses.length;
  assert.ok(medianFinalNetLoss > twoHuntReferenceLoss, `the full challenge's median party loss (${medianFinalNetLoss}) should exceed two average Area 1 Hunts (${twoHuntReferenceLoss})`);
});

function progressionBalanceSummary(loadouts) {
  const results = Array.from({ length: SIMULATION_SEEDS }, (_unused, seed) => simulateFreshParty(seed, { loadouts }));
  return {
    results,
    clears: results.filter((result) => result.phase === 'complete').length,
    survivors: results.filter((result) => !result.downed).length,
    medianFinalNetLoss: median(results.map((result) => result.startingPartyHp - result.endingPartyHp)),
    medianHealingHp: median(results.map((result) => result.healingEvents.reduce((sum, event) => sum + Number(event.healing || 0), 0))),
    medianHealingActions: median(results.map((result) => result.healingEvents.length)),
    medianEncounterDuration: median(results.flatMap((result) => result.battleDurations)),
    medianDamagePerSecond: median(results.map((result) => (
      result.playerDamageDealt / Math.max(1, result.battleDurations.reduce((sum, duration) => sum + duration, 0) / 1_000)
    ))),
  };
}

test('Area 1 balance gives same-role and mixed loadouts distinct, viable trade-offs', () => {
  const scenarios = {
    frontline: progressionBalanceSummary(['frontline-armored', 'frontline-armored']),
    frontlineRanged: progressionBalanceSummary(['frontline', 'ranged']),
    frontlineHealer: progressionBalanceSummary(['frontline', 'healer']),
    rangedPair: progressionBalanceSummary(['ranged', 'ranged']),
    healerPair: progressionBalanceSummary(['healer', 'healer']),
  };
  for (const [name, scenario] of Object.entries(scenarios)) {
    assert.equal(scenario.clears, SIMULATION_SEEDS, `${name} clears every deterministic Area 1 run`);
    assert.ok(scenario.results.every((result) => result.battleDurations.every((duration) => duration < 60_000)), `${name} encounters finish under the 60-second arena cap`);
  }
  assert.equal(scenarios.frontline.survivors, SIMULATION_SEEDS, 'Defense and Max HP make the frontline same-role party reliable');
  assert.ok(scenarios.frontlineRanged.survivors >= 21, 'the mixed frontline/ranged party sustains its measured survival rate');
  assert.ok(scenarios.rangedPair.survivors >= 23, 'a ranged party can trade some Dungeon HP for reach and damage');
  assert.equal(scenarios.frontlineHealer.survivors, SIMULATION_SEEDS, 'a healer protects a mixed party through the authored stages');
  assert.equal(scenarios.healerPair.survivors, SIMULATION_SEEDS, 'a healer-only party remains viable');
  assert.ok(scenarios.frontlineHealer.medianHealingActions > 0 && scenarios.healerPair.medianHealingHp > scenarios.frontlineHealer.medianHealingHp);
  assert.ok(scenarios.healerPair.medianEncounterDuration > scenarios.frontline.medianEncounterDuration * 2, 'healing-heavy fights trade encounter speed for HP sustain');
  assert.ok(scenarios.healerPair.medianDamagePerSecond < scenarios.frontline.medianDamagePerSecond * 0.7, 'healer strikes and healing actions trade damage rate for sustain');
  assert.ok(scenarios.rangedPair.medianFinalNetLoss > scenarios.frontline.medianFinalNetLoss, 'ranged reach trades HP preservation for reliable action opportunities in the same-role party');
});
