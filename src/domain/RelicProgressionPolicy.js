export const RELIC_ATTUNEMENTS = Object.freeze({
  bulwark: Object.freeze({
    code: 'bulwark',
    name: 'Bulwark Weave',
    description: 'A successful Guard generates +1 additional Focus.',
    playstyle: 'Guard / protector',
  }),
  disruptor: Object.freeze({
    code: 'disruptor',
    name: 'Disruptor Weave',
    description: 'A successful Interrupt primes +3 damage for your next damaging action.',
    playstyle: 'Interrupt / reaction',
  }),
  executioner: Object.freeze({
    code: 'executioner',
    name: 'Executioner Weave',
    description: 'Consuming Exposed with Severing Knot primes +4 damage for your next damaging action.',
    playstyle: 'Skill combo',
  }),
  mender: Object.freeze({
    code: 'mender',
    name: 'Mender Weave',
    description: 'Mending Chorus restores +2 additional HP to each ally it heals.',
    playstyle: 'Party support',
  }),
});

const RARITY_MAX_LEVEL = Object.freeze({
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 3,
  legendary: 3,
});

const UPGRADE_COSTS = Object.freeze([8, 14, 22]);

function currentLevel(item) {
  const value = Number(item?.upgradeLevel ?? item?.effect?.upgradeLevel ?? 0);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function currentAttunementCode(item) {
  return item?.attunementCode || item?.effect?.attunementCode || null;
}

export function maxRelicUpgradeLevel(item) {
  return RARITY_MAX_LEVEL[String(item?.rarity || 'common').toLowerCase()] ?? 1;
}

export function publicRelicAttunements() {
  return Object.values(RELIC_ATTUNEMENTS).map((attunement) => ({ ...attunement }));
}

export function relicProgression(item) {
  const level = currentLevel(item);
  const maxLevel = maxRelicUpgradeLevel(item);
  const nextCost = level < maxLevel ? UPGRADE_COSTS[level] : null;
  const attunementCode = currentAttunementCode(item);
  const attunement = attunementCode ? RELIC_ATTUNEMENTS[attunementCode] || null : null;
  return {
    level,
    maxLevel,
    nextCost,
    canUpgrade: level < maxLevel,
    needsAttunement: level === 0,
    attunementCode: attunement?.code || null,
    attunement: attunement ? { ...attunement } : null,
  };
}

export function planRelicUpgrade(item, requestedAttunementCode = null) {
  if (!item?.id) throw new Error('Relic is required for upgrading.');
  const progression = relicProgression(item);
  if (!progression.canUpgrade) {
    const error = new Error('This relic is already at its maximum Temper level.');
    error.code = 'relic_max_level';
    throw error;
  }

  let attunementCode = progression.attunementCode;
  if (progression.needsAttunement) {
    attunementCode = String(requestedAttunementCode || '').toLowerCase();
    if (!RELIC_ATTUNEMENTS[attunementCode]) {
      const error = new Error('Choose a valid relic attunement before the first Temper.');
      error.code = 'invalid_relic_attunement';
      throw error;
    }
  } else if (requestedAttunementCode && String(requestedAttunementCode).toLowerCase() !== attunementCode) {
    const error = new Error('A Tempered relic cannot change attunement.');
    error.code = 'relic_attunement_locked';
    throw error;
  }

  return {
    expectedLevel: progression.level,
    nextLevel: progression.level + 1,
    maxLevel: progression.maxLevel,
    cost: progression.nextCost,
    attackIncrease: 1,
    attunementCode,
    attunement: { ...RELIC_ATTUNEMENTS[attunementCode] },
  };
}
