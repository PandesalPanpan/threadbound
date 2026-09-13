import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SimulatedAdventurer,
  normalizeSimulatedAdventurerActivityProfile,
  publicSimulatedAdventurerActivityProfiles,
} from '../src/domain/SimulatedAdventurer.js';
import { requireProgressionAdventureParty } from '../src/domain/ProgressionAdventurePolicy.js';

function equipment() {
  return {
    weapon: { id: 'weapon-1', slot: 'weapon', attackBonus: 4 },
    helmet: { id: 'helmet-1', slot: 'helmet', maxHpBonus: 8 },
    armor: { id: 'armor-1', slot: 'armor', defenseBonus: 3 },
    boots: { id: 'boots-1', slot: 'boots', speedBonus: 2 },
    accessory: { id: 'accessory-1', slot: 'accessory', critChanceBonus: 0.05 },
  };
}

test('simulated adventurer activity profiles are bounded categories, not an offline scheduler', () => {
  const profiles = publicSimulatedAdventurerActivityProfiles();
  assert.deepEqual(profiles.map((profile) => profile.id), ['casual', 'steady', 'dedicated']);
  assert.equal(normalizeSimulatedAdventurerActivityProfile('DEDICATED').id, 'dedicated');
  assert.equal(profiles.every((profile) => !Object.hasOwn(profile, 'actionsPerDay')), true);
  assert.equal(profiles.every((profile) => !Object.hasOwn(profile, 'intervalMs')), true);
  assert.throws(
    () => normalizeSimulatedAdventurerActivityProfile('continuous'),
    (error) => error.code === 'simulated_adventurer_invalid_activity_profile',
  );
});

test('simulated adventurer reuses canonical XP, Area, equipment and derived-stat concepts', () => {
  const adventurer = new SimulatedAdventurer({
    id: 'bot-rin',
    name: 'Rin',
    experience: 150,
    currentAreaNumber: 2,
    highestUnlockedAreaNumber: 3,
    huntCount: 27,
    adventureCount: 6,
    equipment: equipment(),
    achievements: ['first-hunt', 'area-two', 'first-hunt'],
    duelRecord: { wins: 4, losses: 2, draws: 1 },
    leaderboardPlacement: 7,
    personality: 'Friendly rival',
    activityProfile: 'dedicated',
  });

  assert.equal(adventurer.kind, 'simulated');
  assert.equal(adventurer.isSimulated, true);
  assert.equal(adventurer.experience, 150);
  assert.equal(adventurer.level, 3);
  assert.equal(adventurer.levelProgression.level, 3);
  assert.equal(adventurer.currentAreaNumber, 2);
  assert.equal(adventurer.highestUnlockedAreaNumber, 3);
  assert.equal(adventurer.huntCount, 27);
  assert.equal(adventurer.adventureCount, 6);
  assert.deepEqual(Object.keys(adventurer.equipment), ['weapon', 'helmet', 'armor', 'boots', 'accessory']);
  assert.deepEqual(adventurer.stats, {
    attack: 10,
    defense: 5,
    maxHp: 48,
    speed: 12,
    critChance: 0.1,
    critChancePercent: 10,
  });
  assert.equal(adventurer.attackPower, 10);
  assert.deepEqual(adventurer.achievements, ['first-hunt', 'area-two']);
  assert.deepEqual(adventurer.duelRecord, { wins: 4, losses: 2, draws: 1, total: 7 });
  assert.equal(adventurer.leaderboardPlacement, 7);
  assert.equal(adventurer.personality, 'Friendly rival');
  assert.equal(adventurer.activityProfile.id, 'dedicated');
  assert.equal(Object.isFrozen(adventurer), true);
  assert.equal(Object.isFrozen(adventurer.equipment), true);
  assert.equal(Object.hasOwn(adventurer, 'honey'), false);
});

test('simulated adventurer model fails closed on invalid progression, equipment and records', () => {
  const base = { id: 'bot-1', name: 'Bot' };

  assert.throws(
    () => new SimulatedAdventurer({ ...base, currentAreaNumber: 3, highestUnlockedAreaNumber: 2 }),
    (error) => error.code === 'simulated_adventurer_invalid_area',
  );
  assert.throws(
    () => new SimulatedAdventurer({ ...base, huntCount: -1 }),
    (error) => error.code === 'simulated_adventurer_invalid_progression',
  );
  assert.throws(
    () => new SimulatedAdventurer({ ...base, leaderboardPlacement: 0 }),
    (error) => error.code === 'simulated_adventurer_invalid_progression',
  );
  assert.throws(
    () => new SimulatedAdventurer({ ...base, duelRecord: { wins: 1.5 } }),
    (error) => error.code === 'simulated_adventurer_invalid_progression',
  );
  assert.throws(
    () => new SimulatedAdventurer({ ...base, equipment: { ring: { id: 'ring-1' } } }),
    (error) => error.code === 'simulated_adventurer_invalid_equipment',
  );
  assert.throws(
    () => new SimulatedAdventurer({ ...base, equipment: { weapon: { id: 'armor-1', slot: 'armor' } } }),
    (error) => error.code === 'simulated_adventurer_invalid_equipment',
  );
});

test('simulated adventurer identity is recognized by the existing human-only progression gate', () => {
  const simulated = new SimulatedAdventurer({ id: 'bot-1', name: 'Bot' });
  const human = { id: 'human-1' };
  const party = {
    status: 'forming',
    leaderPlayerId: 'human-1',
    allReady: true,
    participantIds: () => ['human-1', 'bot-1'],
  };

  assert.throws(
    () => requireProgressionAdventureParty({
      definition: { requiredHumanPlayers: 2 },
      party,
      startedByPlayerId: 'human-1',
      players: [human, simulated],
    }),
    (error) => error.code === 'progression_humans_required',
  );
});
