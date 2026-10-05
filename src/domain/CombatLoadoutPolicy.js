import { automaticBattleSkillForCombatant, AUTOMATIC_BATTLE_SKILLS } from './AutomaticBattleSkillCatalog.js';
import { EQUIPMENT_SLOTS } from './EquipmentSlotPolicy.js';

export const COMBAT_LOADOUT_PROFILES = Object.freeze({
  frontline: Object.freeze({ role: 'frontline', roleLabel: 'Frontline', basicActionCode: 'melee-strike', basicActionLabel: 'Attack', basicAttackDamageMultiplier: 1, attackRangeTiles: 1.45, signatureSkillId: null }),
  ranged: Object.freeze({ role: 'ranged', roleLabel: 'Ranged', basicActionCode: 'ranged-strike', basicActionLabel: 'Ranged attack · 80% Attack damage', basicAttackDamageMultiplier: 0.8, attackRangeTiles: 3.2, signatureSkillId: null }),
  healer: Object.freeze({ role: 'support', roleLabel: 'Healer', basicActionCode: 'heal-or-strike', basicActionLabel: 'Heal an injured ally or self; otherwise strike for 70% Attack damage', basicAttackDamageMultiplier: 0.7, attackRangeTiles: 3.2, signatureSkillId: 'mending-chorus' }),
  'mana-support': Object.freeze({ role: 'support', roleLabel: 'Mana support', basicActionCode: 'weapon-strike', basicActionLabel: 'Attack for 90% damage and build Mana for party support', basicAttackDamageMultiplier: 0.9, attackRangeTiles: 3.2, signatureSkillId: 'threadsong' }),
});

const RANGED_WEAPONS = new Set(['bow', 'crossbow', 'focus']);

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizedCode(value) {
  return String(value || '').trim().toLowerCase();
}

function itemProfile(item) {
  const source = object(item);
  const template = object(object(source.effect).equipmentTemplate);
  return normalizedCode(source.combatProfileCode || template.combatProfileCode);
}

function weaponFamily(item, combatant) {
  const source = object(item);
  const unit = object(combatant);
  return normalizedCode(source.weaponFamily || source.family || unit.weaponFamily
    || unit.equipment?.weapon?.weaponFamily || unit.equipment?.weapon?.family
    || unit.equippedItem?.weaponFamily || unit.equippedItem?.family);
}

function skillFor(combatant, weapon) {
  return automaticBattleSkillForCombatant({
    ...object(combatant),
    weaponFamily: weaponFamily(weapon, combatant),
  }, { defaultSkill: null });
}

function supportKind(skill) {
  const effect = skill?.effect || {};
  const heals = Number(effect.allyHeal || 0) > 0 || Number(effect.selfHealing || 0) > 0;
  if (heals) return 'healer';
  const supports = Number(effect.allyMana || 0) > 0
    || (Array.isArray(effect.allyEffects) && effect.allyEffects.length > 0);
  return supports ? 'mana-support' : null;
}

function inferredLegacyProfile(combatant, weapon, skill) {
  const explicitRole = normalizedCode(combatant?.combatRole || combatant?.role);
  if (explicitRole === 'front' || explicitRole === 'frontline') return 'frontline';
  if (explicitRole === 'ranged') return 'ranged';
  if (explicitRole === 'healer') return 'healer';
  if (explicitRole === 'mana-support' || explicitRole === 'support') {
    return supportKind(skill) || (explicitRole === 'mana-support' ? 'mana-support' : 'mana-support');
  }

  // Signature skills stay usable without a Weapon, but they do not turn an
  // unarmed player into a ranged or support loadout. Owned weapon data defines
  // the player's role; an unarmed player keeps the readable melee baseline.
  if (normalizedCode(combatant?.team) === 'players' && !weaponFamily(weapon, combatant)) return 'frontline';

  const supportProfile = supportKind(skill);
  if (supportProfile) return supportProfile;
  if (RANGED_WEAPONS.has(weaponFamily(weapon, combatant))) return 'ranged';
  if (['fire-area', 'poison', 'poison-control', 'frost-control'].includes(skill?.effect?.kind)) return 'ranged';
  // Persisted pre-profile staffs used Threadsong. Preserve that role/skill
  // mapping; newly generated items carry an explicit profile in their JSON.
  if (weaponFamily(weapon, combatant) === 'staff') return 'mana-support';
  return 'frontline';
}

function sumBonus(equipment, field) {
  return EQUIPMENT_SLOTS.reduce((sum, slot) => {
    const item = equipment[slot];
    return sum + (item ? finiteBonus(item[field] ?? item.stats?.[field]) : 0);
  }, 0);
}

function finiteBonus(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

/**
 * Project owned gear and abilities into the stable combat contract. The
 * profile is item/domain data, separate from semantic image identity. Missing
 * profile fields use the legacy family/skill mapping so old owned items and
 * saved encounter snapshots continue to hydrate unchanged.
 */
export function projectCombatLoadout({ equipment = {}, equippedItem = null, combatant = {} } = {}) {
  const items = Object.fromEntries(EQUIPMENT_SLOTS.map((slot) => [slot, object(equipment)[slot] || null]));
  const weapon = items.weapon || equippedItem || null;
  const weaponType = weaponFamily(weapon, combatant);
  const legacySkill = skillFor(combatant, weapon);
  const profileCode = normalizedCode(combatant?.combatProfileCode)
    || itemProfile(weapon)
    || inferredLegacyProfile(combatant, weapon, legacySkill);
  const profile = COMBAT_LOADOUT_PROFILES[profileCode];
  if (!profile) throw new Error(`Unsupported combat loadout profile: ${profileCode || '(empty)'}.`);

  const signatureSkillId = profile.signatureSkillId
    || normalizedCode(weapon?.signatureSkillId || combatant?.skillCode || legacySkill?.id)
    || null;
  const signatureSkill = signatureSkillId ? AUTOMATIC_BATTLE_SKILLS[signatureSkillId] || null : null;
  const attackRangeTiles = profileCode === 'frontline'
    ? (weaponType === 'spear' ? 1.8 : profile.attackRangeTiles)
    : profile.attackRangeTiles;
  const basicActionCode = profileCode === 'mana-support' && RANGED_WEAPONS.has(weaponType)
    ? 'ranged-strike'
    : profile.basicActionCode;
  const basicActionLabel = profileCode === 'mana-support' && RANGED_WEAPONS.has(weaponType)
    ? 'Ranged attack and build Mana for party support'
    : profile.basicActionLabel;

  return Object.freeze({
    profileCode,
    role: profile.role,
    roleLabel: profile.roleLabel,
    basicActionCode,
    basicActionLabel,
    basicActionDamageMultiplier: profile.basicActionDamageMultiplier,
    attackRangeTiles,
    supportRangeTiles: 2.6,
    signatureSkillId,
    signatureSkill,
    weaponFamily: weaponType || null,
    equipment: Object.freeze(items),
    bonuses: Object.freeze({
      healingPower: sumBonus(items, 'healingPowerBonus'),
      attackSpeed: Math.min(0.5, sumBonus(items, 'attackSpeedBonus')),
      movementSpeed: Math.min(2, sumBonus(items, 'movementSpeedBonus')),
    }),
  });
}

export function combatProfileCodeForItem(item = {}) {
  const code = itemProfile(item);
  if (!code) return null;
  if (!COMBAT_LOADOUT_PROFILES[code]) throw new Error(`Unsupported combat loadout profile: ${code}.`);
  return code;
}
