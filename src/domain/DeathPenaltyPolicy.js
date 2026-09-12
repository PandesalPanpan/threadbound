export const NORMAL_DEATH_RULES = Object.freeze({
  carriedGoldLossPercent: 20,
});

export const DANGEROUS_DEATH_WARNING_ID = 'dangerous-item-loss-v1';

function nonNegativeWhole(value, label) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be a non-negative whole number.`);
  return number;
}

function timestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function itemIsProtected(item) {
  if (!item || typeof item !== 'object') return true;
  if (item.bound === true || item.protected === true) return true;
  if (item.effect?.bound === true || item.effect?.protected === true) return true;
  if (['bound', 'protected'].includes(String(item.effect?.lossProtection || '').toLowerCase())) return true;
  // Honey purchases must never become an ordinary gameplay death sink.
  if (String(item.source || '').toLowerCase() === 'honey-purchase') return true;
  return false;
}

export function dangerousDeathWarning({ minimumCarriedGold } = {}) {
  const minimum = nonNegativeWhole(minimumCarriedGold ?? 0, 'minimumCarriedGold');
  return Object.freeze({
    id: DANGEROUS_DEATH_WARNING_ID,
    minimumCarriedGold: minimum,
    text: `Dangerous activity: if you die while carrying less than ${minimum} Gold, one eligible equipped item may be lost. Bound, protected, and Honey-purchased equipment is safe.`,
  });
}

export function isEligibleDangerousDeathItem(item) {
  return Boolean(item?.id) && !itemIsProtected(item);
}

function hasValidPreEntryWarning({ activityId, activityStartedAt, riskAcknowledgement }) {
  const startedAt = timestamp(activityStartedAt);
  const acknowledgedAt = timestamp(riskAcknowledgement?.acknowledgedAt);
  return Boolean(
    activityId
    && startedAt !== null
    && acknowledgedAt !== null
    && acknowledgedAt <= startedAt
    && riskAcknowledgement?.warningId === DANGEROUS_DEATH_WARNING_ID
    && riskAcknowledgement?.activityId === activityId
  );
}

/**
 * Canonical normal-death penalty. Only carried Gold is at risk here; banked Gold
 * is deliberately outside this policy and must never be included in the loss base.
 */
export function resolveNormalDeathPenalty({ carriedGold } = {}) {
  const carried = nonNegativeWhole(carriedGold ?? 0, 'carriedGold');
  const goldLost = Math.floor((carried * NORMAL_DEATH_RULES.carriedGoldLossPercent) / 100);
  return Object.freeze({
    carriedGoldBefore: carried,
    goldLost,
    carriedGoldAfter: carried - goldLost,
    lossPercent: NORMAL_DEATH_RULES.carriedGoldLossPercent,
  });
}

/**
 * Opt-in dangerous-content fallback. Ordinary activities continue to use the
 * normal carried-Gold rule. Item loss is possible only when the activity has an
 * explicit configured threshold AND authoritative evidence that the canonical
 * warning was acknowledged before that activity started.
 */
export function resolveDangerousDeathPenalty({
  carriedGold,
  config = null,
  activityId = null,
  activityStartedAt = null,
  riskAcknowledgement = null,
  equippedItems = [],
} = {}) {
  const normal = resolveNormalDeathPenalty({ carriedGold });
  const enabled = config?.enabled === true;
  const minimumCarriedGold = nonNegativeWhole(config?.minimumCarriedGold ?? 0, 'minimumCarriedGold');

  const goldResult = (fallbackReason = null) => Object.freeze({
    ...normal,
    penaltyType: 'gold',
    minimumCarriedGold,
    itemLoss: null,
    fallbackReason,
  });

  if (!enabled || normal.carriedGoldBefore >= minimumCarriedGold) return goldResult();
  if (!hasValidPreEntryWarning({ activityId, activityStartedAt, riskAcknowledgement })) {
    return goldResult('pre-entry-warning-required');
  }

  const eligible = [...(Array.isArray(equippedItems) ? equippedItems : [])]
    .filter(isEligibleDangerousDeathItem)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const selected = eligible[0];
  if (!selected) return goldResult('no-eligible-equipped-item');

  return Object.freeze({
    ...normal,
    goldLost: 0,
    carriedGoldAfter: normal.carriedGoldBefore,
    penaltyType: 'item-loss',
    minimumCarriedGold,
    itemLoss: Object.freeze({ id: selected.id, name: selected.name || 'Equipment', slot: selected.slot || null }),
    fallbackReason: null,
  });
}
