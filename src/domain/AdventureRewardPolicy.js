export const ADVENTURE_COOLDOWN_SECONDS = 45;

const ADVENTURE_REWARDS = Object.freeze({
  1: Object.freeze({
    gold: 6,
    experience: 30,
    dropChance: 0.5,
    storyEventChance: 0.35,
    storyEvents: Object.freeze([
      Object.freeze({ id: 'area-trail-signs', text: 'You spot fresh trail signs from another adventurer.' }),
    ]),
  }),
});

function clampRoll(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(0.999999, numeric));
}

export function adventureRewardForArea(areaNumber) {
  const reward = ADVENTURE_REWARDS[Number(areaNumber)];
  if (!reward) {
    const error = new Error(`No ordinary Adventure reward is configured for Area ${Number(areaNumber)}.`);
    error.code = 'adventure_reward_unavailable';
    throw error;
  }
  return reward;
}

export function resolveAdventureRewards({ areaNumber, victory, lootRoll = 1, storyRoll = 1 } = {}) {
  const reward = adventureRewardForArea(areaNumber);
  if (!victory) {
    return Object.freeze({ gold: 0, experience: 0, drop: false, storyEvent: null, dropChance: 0 });
  }

  const events = reward.storyEvents || [];
  const storyEvent = events.length > 0 && clampRoll(storyRoll) < reward.storyEventChance
    ? events[Math.floor(clampRoll(storyRoll) * events.length)] || events[0]
    : null;

  return Object.freeze({
    gold: reward.gold,
    experience: reward.experience,
    drop: clampRoll(lootRoll) < reward.dropChance,
    dropChance: reward.dropChance,
    storyEvent: storyEvent ? Object.freeze({ ...storyEvent }) : null,
  });
}

export function capAdventureLoot(item) {
  if (!item || typeof item !== 'object') return item;
  const tier = Number(item.rarityTier || 1);
  if (tier <= 3) return item;
  return Object.freeze({
    ...item,
    rarity: 'rare',
    rarityTier: 3,
    attackBonus: Math.min(4, Math.max(3, Number(item.attackBonus || 3))),
  });
}
