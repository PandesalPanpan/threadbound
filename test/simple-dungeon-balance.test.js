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
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

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
  return Object.fromEntries(participants.map((participant) => {
    const character = new Character({ ...repository.getPlayer(participant.playerId), equipment: {} });
    return [participant.playerId, {
      attackPower: character.attackPower,
      defense: character.stats.defense,
      speed: character.stats.speed,
      critChance: character.stats.critChance,
      equipment: {},
    }];
  }));
}

function freshPartyRun(seed) {
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
  const party = parties.createParty(leader.id);
  parties.joinParty(partner.id, party.joinCode);
  parties.setReady(partner.id, true);
  const definition = dungeons.definition('brightbell-trial');
  const run = new AdventureRun(dungeons.startDungeon(leader.id, 'brightbell-trial'));
  return { repository, leader, partner, party, definition, run };
}

function simulateFreshParty(seed) {
  const fixture = freshPartyRun(seed);
  const { repository, leader, run, definition } = fixture;
  const playerIds = run.toJSON().participants.map((participant) => participant.playerId);
  const potionStock = new Map(playerIds.map((playerId) => [playerId, 1]));
  const healingWindows = [];
  const enemySkills = [];
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
    };
  } finally {
    repository.close();
  }
}

test('Area 1 progression balance sustains a fair two-player Level 1 endurance run', () => {
  const area = AREA_CONTENT.find((candidate) => candidate.number === 1);
  const results = Array.from({ length: SIMULATION_SEEDS }, (_unused, seed) => simulateFreshParty(seed));
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
  assert.ok(med >= 15 && med <= 19, `median net pre-boss loss should stay in the measured 15–19 HP pressure band; got ${med}`);
  assert.ok(medianFinalNetLoss >= 43 && medianFinalNetLoss <= 51, `median full-run party loss should stay in the measured 43–51 HP endurance band; got ${medianFinalNetLoss}`);
  assert.ok(Math.min(...results.map((result) => result.weakestEndingHp)) >= 1, 'no player should be down at completion');
  assert.ok(median(results.map((result) => result.weakestEndingHp)) >= 7, 'the median weakest player should finish with a positive single-digit HP buffer');

  const castCount = (roomIndex, enemyId, skillId) => results.filter((result) => result.enemySkills.some((cast) => (
    cast.roomIndex === roomIndex && cast.enemyId === enemyId && cast.skillId === skillId
  ))).length;
  assert.equal(castCount(0, 'ribbon-boar', 'shield-break'), SIMULATION_SEEDS, 'the first group should expose its Boar skill pressure');
  assert.ok(castCount(1, 'meadow-breeze', 'threadsong') >= 18, 'the mid-run single-enemy room should exercise its support skill');
  assert.ok(castCount(2, 'parade-golem', 'ember-burst') >= 18, 'the boss should exercise its line attack');
  assert.ok(castCount(2, 'ribbon-boar', 'shield-break') >= 22, 'the boss add should exercise its authored skill in nearly every boss stage');

  const huntPlayer = {
    id: 'area-one-hunt-reference',
    name: 'Fresh Level 1',
    attack: 6,
    defense: 2,
    maxHp: STARTING_HEALTH,
    speed: 10,
    critChance: 0.05,
    equipment: {},
  };
  const areaOneHuntLosses = area.huntEncounters.map((encounter) => resolveAutomaticHunt({
    player: huntPlayer,
    currentHealth: STARTING_HEALTH,
    encounter,
    random: () => 0.5,
  }).damageTaken);
  const twoHuntReferenceLoss = areaOneHuntLosses.reduce((sum, loss) => sum + loss, 0) * 2 / areaOneHuntLosses.length;
  assert.ok(med > twoHuntReferenceLoss, `the challenge's median pre-boss loss (${med}) should exceed two average Area 1 Hunts (${twoHuntReferenceLoss})`);
});
