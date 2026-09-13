import { deriveCharacterStats } from './CharacterStatPolicy.js';
import { EQUIPMENT_SLOTS, emptyEquipmentLoadout, normalizeEquipmentSlot } from './EquipmentSlotPolicy.js';
import { progressionForExperience } from './LevelProgressionPolicy.js';

export const SIMULATED_ADVENTURER_ACTIVITY_PROFILES = Object.freeze({
  casual: Object.freeze({
    id: 'casual',
    label: 'Casual',
    description: 'Acts infrequently. M8-02 owns the exact bounded cadence.',
  }),
  steady: Object.freeze({
    id: 'steady',
    label: 'Steady',
    description: 'Acts at a regular pace. M8-02 owns the exact bounded cadence.',
  }),
  dedicated: Object.freeze({
    id: 'dedicated',
    label: 'Dedicated',
    description: 'Acts more often than other profiles without continuous grinding. M8-02 owns the exact bounded cadence.',
  }),
});

function modelError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requiredText(value, field) {
  const text = String(value ?? '').trim();
  if (!text) throw modelError('simulated_adventurer_invalid_identity', `Simulated adventurer ${field} is required.`);
  return text;
}

function optionalText(value, field, maxLength = 80) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > maxLength) throw modelError('simulated_adventurer_invalid_profile', `${field} is too long.`);
  return text;
}

function nonNegativeInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw modelError('simulated_adventurer_invalid_progression', `${field} must be a non-negative integer.`);
  }
  return number;
}

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw modelError('simulated_adventurer_invalid_progression', `${field} must be a positive integer.`);
  }
  return number;
}

function positiveFinite(value, field, fallback) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number <= 0) {
    throw modelError('simulated_adventurer_invalid_stats', `${field} must be a positive number.`);
  }
  return number;
}

function normalizeAchievements(values = []) {
  if (!Array.isArray(values)) {
    throw modelError('simulated_adventurer_invalid_achievements', 'achievements must be an array of achievement ids.');
  }
  const ids = values.map((value) => requiredText(value, 'achievement id'));
  return Object.freeze([...new Set(ids)]);
}

function normalizeDuelRecord(record = {}) {
  const wins = nonNegativeInteger(record.wins ?? 0, 'duel wins');
  const losses = nonNegativeInteger(record.losses ?? 0, 'duel losses');
  const draws = nonNegativeInteger(record.draws ?? 0, 'duel draws');
  return Object.freeze({ wins, losses, draws, total: wins + losses + draws });
}

function normalizeLeaderboardPlacement(value) {
  if (value == null) return null;
  return positiveInteger(value, 'leaderboard placement');
}

function cloneEquipmentItem(item, slot) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw modelError('simulated_adventurer_invalid_equipment', `${slot} equipment must be an item object or null.`);
  }
  if (item.slot != null && normalizeEquipmentSlot(item.slot) !== slot) {
    throw modelError('simulated_adventurer_invalid_equipment', `${slot} equipment cannot contain an item for ${item.slot}.`);
  }
  return Object.freeze({ ...item, slot });
}

function normalizeEquipment(equipment = {}) {
  if (!equipment || typeof equipment !== 'object' || Array.isArray(equipment)) {
    throw modelError('simulated_adventurer_invalid_equipment', 'equipment must be a canonical five-slot loadout object.');
  }

  const unknownSlots = Object.keys(equipment).filter((slot) => !EQUIPMENT_SLOTS.includes(String(slot).toLowerCase()));
  if (unknownSlots.length) {
    throw modelError('simulated_adventurer_invalid_equipment', `Unknown equipment slot: ${unknownSlots[0]}.`);
  }

  const loadout = emptyEquipmentLoadout();
  for (const slot of EQUIPMENT_SLOTS) {
    const item = equipment[slot] ?? null;
    loadout[slot] = item == null ? null : cloneEquipmentItem(item, slot);
  }
  return Object.freeze(loadout);
}

export function normalizeSimulatedAdventurerActivityProfile(value = 'steady') {
  const id = String(value || '').trim().toLowerCase();
  const profile = SIMULATED_ADVENTURER_ACTIVITY_PROFILES[id];
  if (!profile) {
    throw modelError('simulated_adventurer_invalid_activity_profile', `Unknown simulated adventurer activity profile: ${value || '(empty)'}.`);
  }
  return profile;
}

export function publicSimulatedAdventurerActivityProfiles() {
  return Object.values(SIMULATED_ADVENTURER_ACTIVITY_PROFILES).map((profile) => ({ ...profile }));
}

/**
 * Domain model for persistent simulated adventurer identity/progression state.
 *
 * M8-01 deliberately reuses the same canonical XP, equipment-slot, and derived
 * stat policies as human adventurers. It does not schedule offline actions,
 * persist ticks, spend currency, populate Guild Halls, compute leaderboard
 * order, or resolve Duels; those belong to later ordered milestones.
 */
export class SimulatedAdventurer {
  constructor({
    id,
    name,
    experience = 0,
    currentAreaNumber = 1,
    highestUnlockedAreaNumber = currentAreaNumber,
    huntCount = 0,
    adventureCount = 0,
    equipment = {},
    achievements = [],
    duelRecord = {},
    leaderboardPlacement = null,
    personality = null,
    activityProfile = 'steady',
    baseAttack = 6,
    maxHealth = 40,
  } = {}) {
    const currentArea = positiveInteger(currentAreaNumber, 'current Area number');
    const highestArea = positiveInteger(highestUnlockedAreaNumber, 'highest unlocked Area number');
    if (currentArea > highestArea) {
      throw modelError('simulated_adventurer_invalid_area', 'Current Area cannot be above the highest unlocked Area.');
    }

    this.id = requiredText(id, 'id');
    this.name = requiredText(name, 'name');
    this.kind = 'simulated';
    this.isSimulated = true;

    this.levelProgression = progressionForExperience(experience);
    this.experience = this.levelProgression.experience;
    this.level = this.levelProgression.level;

    this.currentAreaNumber = currentArea;
    this.highestUnlockedAreaNumber = highestArea;
    this.huntCount = nonNegativeInteger(huntCount, 'Hunt count');
    this.adventureCount = nonNegativeInteger(adventureCount, 'Adventure count');

    this.equipment = normalizeEquipment(equipment);
    this.stats = deriveCharacterStats({
      baseAttack: positiveFinite(baseAttack, 'base Attack', 6),
      maxHealth: positiveFinite(maxHealth, 'max Health', 40),
      equipment: this.equipment,
    });
    this.attackPower = this.stats.attack;

    this.achievements = normalizeAchievements(achievements);
    this.duelRecord = normalizeDuelRecord(duelRecord);
    this.leaderboardPlacement = normalizeLeaderboardPlacement(leaderboardPlacement);
    this.personality = optionalText(personality, 'personality');
    this.activityProfile = normalizeSimulatedAdventurerActivityProfile(activityProfile);

    Object.freeze(this);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
      isSimulated: this.isSimulated,
      experience: this.experience,
      level: this.level,
      levelProgression: this.levelProgression,
      currentAreaNumber: this.currentAreaNumber,
      highestUnlockedAreaNumber: this.highestUnlockedAreaNumber,
      huntCount: this.huntCount,
      adventureCount: this.adventureCount,
      equipment: this.equipment,
      stats: this.stats,
      attackPower: this.attackPower,
      achievements: this.achievements,
      duelRecord: this.duelRecord,
      leaderboardPlacement: this.leaderboardPlacement,
      personality: this.personality,
      activityProfile: this.activityProfile,
    };
  }
}
