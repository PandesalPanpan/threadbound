import { normalizeEquipmentSlot } from './EquipmentSlotPolicy.js';

// Legacy attunements remain readable for already-persisted tactical items. New default
// equipment upgrades no longer require players to choose these obsolete combat paths.
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
  mythic: 3,
});

const UPGRADE_COSTS = Object.freeze([8, 14, 22]);
const EQUIPMENT_SLOT_UPGRADES = Object.freeze({
  weapon: Object.freeze({ statKey: 'attackBonus', statLabel: 'Attack', statIncrease: 1, displayIncrease: 1, displayUnit: '', budgetIncrease: 1 }),
  helmet: Object.freeze({ statKey: 'defenseBonus', statLabel: 'Defense', statIncrease: 1, displayIncrease: 1, displayUnit: '', budgetIncrease: 1 }),
  armor: Object.freeze({ statKey: 'maxHpBonus', statLabel: 'Max HP', statIncrease: 4, displayIncrease: 4, displayUnit: '', budgetIncrease: 1 }),
  boots: Object.freeze({ statKey: 'speedBonus', statLabel: 'Speed', statIncrease: 1, displayIncrease: 1, displayUnit: '', budgetIncrease: 1 }),
  accessory: Object.freeze({ statKey: 'critChanceBonus', statLabel: 'Crit Chance', statIncrease: 0.01, displayIncrease: 1, displayUnit: '%', budgetIncrease: 1 }),
});

export function equipmentSlotUpgrade(slot) {
  const normalizedSlot = normalizeEquipmentSlot(slot || 'weapon');
  const upgrade = EQUIPMENT_SLOT_UPGRADES[normalizedSlot];
  return Object.freeze({
    slot: normalizedSlot,
    ...upgrade,
    statText: `+${upgrade.displayIncrease}${upgrade.displayUnit} ${upgrade.statLabel}`,
  });
}

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
    // Compatibility metadata may still carry an old tactical attunement, but new
    // equipment no longer requires one before its first Upgrade.
    needsAttunement: false,
    attunementCode: attunement?.code || null,
    attunement: attunement ? { ...attunement } : null,
  };
}

export function planRelicUpgrade(item, requestedAttunementCode = null) {
  if (!item?.id) throw new Error('Equipment item is required for upgrading.');
  const progression = relicProgression(item);
  if (!progression.canUpgrade) {
    const error = new Error('This item is already at its maximum Upgrade level.');
    error.code = 'relic_max_level';
    throw error;
  }

  let attunementCode = progression.attunementCode;
  const requested = requestedAttunementCode ? String(requestedAttunementCode).toLowerCase() : null;
  if (attunementCode && requested && requested !== attunementCode) {
    const error = new Error('Upgraded legacy equipment cannot change its attunement.');
    error.code = 'relic_attunement_locked';
    throw error;
  }
  if (!attunementCode && requested) {
    if (!RELIC_ATTUNEMENTS[requested]) {
      const error = new Error('Choose a valid legacy equipment attunement.');
      error.code = 'invalid_relic_attunement';
      throw error;
    }
    // Old clients may still explicitly send an attunement. Preserve that contract for
    // migration safety, while the new default UI sends no attunement at all.
    attunementCode = requested;
  }

  const statUpgrade = equipmentSlotUpgrade(item.slot);
  return {
    expectedLevel: progression.level,
    nextLevel: progression.level + 1,
    maxLevel: progression.maxLevel,
    cost: progression.nextCost,
    ...statUpgrade,
    // Compatibility field for Weapon-only clients and persisted event consumers.
    attackIncrease: statUpgrade.statKey === 'attackBonus' ? statUpgrade.statIncrease : 0,
    attunementCode,
    attunement: attunementCode ? { ...RELIC_ATTUNEMENTS[attunementCode] } : null,
  };
}
