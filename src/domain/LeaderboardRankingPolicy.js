function whole(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function text(value) {
  return String(value || '').trim();
}

export function leaderboardPowerSummary(entry = {}) {
  const stats = entry.stats || {};
  const equipment = entry.equipment || {};
  return Object.freeze({
    attack: whole(stats.attack ?? entry.attackPower),
    defense: whole(stats.defense),
    maxHp: whole(stats.maxHp),
    speed: whole(stats.speed),
    equippedCount: Object.values(equipment).filter(Boolean).length,
  });
}

function compareEntries(left, right) {
  const keys = [
    'level',
    'experience',
    'highestUnlockedAreaNumber',
    'huntCount',
    'achievementCount',
  ];
  for (const key of keys) {
    const difference = whole(right[key]) - whole(left[key]);
    if (difference) return difference;
  }
  const leftPower = leaderboardPowerSummary(left);
  const rightPower = leaderboardPowerSummary(right);
  for (const key of ['attack', 'defense', 'maxHp', 'speed', 'equippedCount']) {
    const difference = whole(rightPower[key]) - whole(leftPower[key]);
    if (difference) return difference;
  }
  return text(left.name).localeCompare(text(right.name)) || text(left.id).localeCompare(text(right.id));
}

/**
 * Domain policy for stable leaderboard ordering. It only compares already-
 * authoritative progression facts and never mutates player or bot state.
 */
export function rankLeaderboardEntries(entries = []) {
  if (!Array.isArray(entries)) throw new Error('Leaderboard entries must be an array.');
  return Object.freeze([...entries]
    .map((entry) => Object.freeze({
      ...entry,
      achievementCount: whole(entry.achievementCount ?? entry.achievements?.length),
      power: leaderboardPowerSummary(entry),
    }))
    .sort(compareEntries)
    .map((entry, index) => Object.freeze({ ...entry, placement: index + 1 })));
}
