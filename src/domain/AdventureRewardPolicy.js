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

export function resolveAdventureRewards({ areaNumber, rewardProfile = null, victory, lootRoll = 1, storyRoll = 1 } = {}) {
  const reward = rewardProfile || adventureRewardForArea(areaNumber);
  if (!reward || !Number.isFinite(Number(reward.gold)) || !Number.isFinite(Number(reward.experience))) {
    const error = new Error(`No ordinary Adventure reward is configured for Area ${Number(areaNumber)}.`);
    error.code = 'adventure_reward_unavailable';
    throw error;
  }
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
  // Compatibility export retained for callers that used to cap ordinary loot.
  // Generated equipment now carries stats across all five slots, so rewriting its
  // rarity without regenerating every stat and nested budget would mislabel its
  // power. Keep the authored rarity and complete stat identity together.
  return item;
}
