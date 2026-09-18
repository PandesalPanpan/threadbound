import { resolveNormalDeathPenalty } from './DeathPenaltyPolicy.js';

/**
 * The simple Dungeon keeps its existing completion-only reward contract while
 * making the cost of continuing visible before the next room starts.
 *
 * A retreat is safe: carried Gold is untouched, but the completion reward has
 * not been secured yet. A defeat uses the same carried-Gold policy as normal
 * death; banked Gold is never part of the loss base.
 */
export const DUNGEON_REWARD_RULES = Object.freeze({
  completionGold: 15,
  completionEquipment: true,
  securityPoint: 'clear',
});

export function projectDungeonRisk({ carriedGold = 0 } = {}) {
  const death = resolveNormalDeathPenalty({ carriedGold });
  return Object.freeze({
    rewardSecurity: DUNGEON_REWARD_RULES.securityPoint,
    completionReward: Object.freeze({
      gold: DUNGEON_REWARD_RULES.completionGold,
      equipment: DUNGEON_REWARD_RULES.completionEquipment,
    }),
    retreat: Object.freeze({
      carriedGoldKept: death.carriedGoldBefore,
      completionRewardSecured: false,
    }),
    death: Object.freeze({
      penaltyType: 'carried_gold',
      goldLost: death.goldLost,
      carriedGoldBefore: death.carriedGoldBefore,
      carriedGoldAfter: death.carriedGoldAfter,
      lossPercent: death.lossPercent,
      bankedGoldSafe: true,
    }),
  });
}
