import { AdventureRun, DUNGEONS } from '../src/domain/AdventureRun.js';

function integerFlag(name, fallback) {
  const match = process.argv.find((argument) => argument.startsWith(`${name}=`));
  const value = match ? Number(match.slice(name.length + 1)) : fallback;
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

const samples = integerFlag('--samples', 100);
const attackPower = integerFlag('--attack', 9);
const maxHealth = integerFlag('--health', 100);
const partySize = Math.min(4, integerFlag('--party', 1));
const usePotion = process.argv.includes('--potion');

function createParticipants(sample) {
  return Array.from({ length: partySize }, (_, index) => ({
    playerId: `sim-${sample}-${index + 1}`,
    maxHealth,
  }));
}

function runSample(sample) {
  const participants = createParticipants(sample);
  const run = AdventureRun.startSimple({
    id: `simple-sim-${attackPower}-${partySize}-${sample}`,
    ownerType: 'party',
    ownerId: `sim-party-${sample}`,
    startedByPlayerId: participants[0].playerId,
    participants,
    dungeonId: 'frayed-hollow',
    dungeonDefinition: DUNGEONS['frayed-hollow'],
    sharedSurface: true,
    now: '2026-09-22T00:00:00.000Z',
  });
  let roomCount = 0;
  let rounds = 0;
  let enemyActions = 0;
  let damageTaken = 0;
  const targets = {};
  while (!['complete', 'failed', 'retreated'].includes(run.toJSON().phase) && roomCount < 12) {
    const state = run.toJSON();
    if (state.phase === 'between_encounter') {
      const actor = state.participants.find((participant) => participant.hp > 0);
      if (!actor) break;
      if (usePotion && actor.hp < actor.maxHp) {
        run.usePotionBetweenEncounters({ playerId: actor.playerId, healed: actor.maxHp - actor.hp });
      }
      else run.continueEncounter({ playerId: actor.playerId });
      continue;
    }
    const playerActions = Object.fromEntries(state.participants
      .filter((participant) => participant.hp > 0)
      .map((participant) => [participant.playerId, { attackPower, equipmentEffect: 'none' }]));
    const outcome = run.resolveSimpleEncounter({ playerActions, now: '2026-09-22T00:00:01.000Z' });
    roomCount += 1;
    rounds += Number(outcome.rounds || 0);
    enemyActions += outcome.actions.filter((action) => action.phase === 'enemy').length;
    damageTaken += outcome.actions.filter((action) => action.phase === 'enemy').reduce((sum, action) => sum + Number(action.damage || 0), 0);
    for (const action of outcome.actions.filter((candidate) => candidate.phase === 'enemy')) {
      const profile = action.targetingProfile || 'random';
      targets[profile] = (targets[profile] || 0) + 1;
    }
  }
  const final = run.toJSON();
  return {
    outcome: final.phase,
    endingHp: final.participants.reduce((sum, participant) => sum + participant.hp, 0),
    rounds,
    roomCount,
    enemyActions,
    damageTaken,
    targets,
  };
}

const results = Array.from({ length: samples }, (_, index) => runSample(index));
const completed = results.filter((result) => result.outcome === 'complete').length;
const failed = results.filter((result) => result.outcome === 'failed').length;
const sum = (key) => results.reduce((total, result) => total + result[key], 0);
const targetDistribution = results.reduce((all, result) => {
  for (const [profile, count] of Object.entries(result.targets)) all[profile] = (all[profile] || 0) + count;
  return all;
}, {});

console.log(JSON.stringify({
  dungeonId: 'frayed-hollow',
  samples,
  attackPower,
  maxHealth,
  partySize,
  usePotion,
  completionRate: Number((completed / samples).toFixed(3)),
  defeatRate: Number((failed / samples).toFixed(3)),
  averageEndingHp: Number((sum('endingHp') / samples).toFixed(2)),
  averageRounds: Number((sum('rounds') / samples).toFixed(2)),
  averageRooms: Number((sum('roomCount') / samples).toFixed(2)),
  averageEnemyActions: Number((sum('enemyActions') / samples).toFixed(2)),
  averageDamageTaken: Number((sum('damageTaken') / samples).toFixed(2)),
  targetDistribution,
}, null, 2));
