const freezeSkill = (definition) => Object.freeze({
  ...definition,
  effect: Object.freeze({
    ...definition.effect,
    targetEffects: Object.freeze((definition.effect.targetEffects || []).map((effect) => Object.freeze({ ...effect }))),
    selfEffects: Object.freeze((definition.effect.selfEffects || []).map((effect) => Object.freeze({ ...effect }))),
    allyEffects: Object.freeze((definition.effect.allyEffects || []).map((effect) => Object.freeze({ ...effect }))),
  }),
});

export const AUTOMATIC_BATTLE_RULES = Object.freeze({
  maxMana: 100,
  skillManaCost: 100,
  manaPerBasicAttack: 35,
  manaOnDamage: 12,
});

export const AUTOMATIC_BATTLE_SKILLS = Object.freeze({
  threadsong: freezeSkill({
    id: 'threadsong', name: 'Threadsong', label: 'Threadsong', manaCost: 100,
    description: 'Strike the enemy line and restore Mana to nearby allies.',
    effect: { kind: 'arcane-support', damageBonus: 5, splashBonus: 1, splash: 'all', allyMana: 16 },
  }),
  thornwake: freezeSkill({
    id: 'thornwake', name: 'Thornwake', label: 'Thornwake', manaCost: 100,
    description: 'Drive a thorn into the target and poison it for two turns.',
    effect: { kind: 'poison', damageBonus: 5, targetEffects: [{ type: 'poison', potency: 3, remainingTurns: 2 }] },
  }),
  'shield-break': freezeSkill({
    id: 'shield-break', name: 'Shield Break', label: 'Shield Break', manaCost: 100,
    description: 'Crush the front line and lower the target’s Defense.',
    effect: { kind: 'heavy', damageBonus: 11, targetEffects: [{ type: 'defense-down', potency: 3, remainingTurns: 2 }] },
  }),
  'ember-burst': freezeSkill({
    id: 'ember-burst', name: 'Ember Burst', label: 'Ember Burst', manaCost: 100,
    description: 'Splash fire across every enemy.',
    effect: { kind: 'fire-area', damageBonus: 4, splashBonus: 1, splash: 'all', targetEffectsAll: true, targetEffects: [{ type: 'fire', potency: 3, remainingTurns: 2 }] },
  }),
  'mire-song': freezeSkill({
    id: 'mire-song', name: 'Mire Song', label: 'Mire Song', manaCost: 100,
    description: 'Weaken the target with poison and a draining melody.',
    effect: { kind: 'poison-control', damageBonus: 3, targetEffects: [{ type: 'poison', potency: 3, remainingTurns: 2 }, { type: 'attack-down', potency: 2, remainingTurns: 2 }] },
  }),
  'shadow-lunge': freezeSkill({
    id: 'shadow-lunge', name: 'Shadow Lunge', label: 'Shadow Lunge', manaCost: 100,
    description: 'Deliver a heavy strike that hits harder against a weakened target.',
    effect: { kind: 'execute', damageBonus: 8, executeBelowHpRatio: 0.35, executeBonus: 8 },
  }),
  'blood-pact': freezeSkill({
    id: 'blood-pact', name: 'Blood Pact', label: 'Blood Pact', manaCost: 100,
    description: 'Spend a little Health for a stronger strike that restores Health.',
    effect: { kind: 'blood-pact', damageBonus: 10, damageMultiplier: 1.35, selfDamage: 5, lifestealPercent: 0.5 },
  }),
  'mending-chorus': freezeSkill({
    id: 'mending-chorus', name: 'Mending Chorus', label: 'Mending Chorus', manaCost: 100,
    description: 'Restore Health and Mana to the party.',
    effect: { kind: 'party-heal', damageBonus: 0, damageMultiplier: 0, selfHealing: 12, allyHeal: 10, allyMana: 18 },
  }),
  'iron-bloom': freezeSkill({
    id: 'iron-bloom', name: 'Iron Bloom', label: 'Iron Bloom', manaCost: 100,
    description: 'Brace behind a woven guard that strengthens Defense for two turns.',
    effect: { kind: 'guard', damageBonus: 2, selfEffects: [{ type: 'defense-up', potency: 4, remainingTurns: 2 }] },
  }),
  'frost-bind': freezeSkill({
    id: 'frost-bind', name: 'Frost Bind', label: 'Frost Bind', manaCost: 100,
    description: 'Chill and weaken the target, slowing its next actions.',
    effect: { kind: 'frost-control', damageBonus: 4, targetEffects: [{ type: 'ice', potency: 3, remainingTurns: 2 }, { type: 'defense-down', potency: 2, remainingTurns: 2 }] },
  }),
});

const WEAPON_SIGNATURE_SKILLS = Object.freeze({
  sword: 'shield-break',
  dagger: 'shadow-lunge',
  spear: 'ember-burst',
  axe: 'blood-pact',
  bow: 'thornwake',
  crossbow: 'frost-bind',
  staff: 'threadsong',
});

function normalizeCode(value) {
  return String(value || '').trim().toLowerCase();
}

export function automaticBattleSkill(skillCode) {
  const id = normalizeCode(skillCode);
  const skill = AUTOMATIC_BATTLE_SKILLS[id];
  if (!skill) {
    const error = new Error(`Unknown automatic battle skill: ${id || '(empty)'}.`);
    error.code = 'unknown_automatic_battle_skill';
    throw error;
  }
  return skill;
}

export function automaticBattleSkillForWeaponFamily(weaponFamily, fallback = 'threadsong') {
  const family = normalizeCode(weaponFamily);
  return automaticBattleSkill(WEAPON_SIGNATURE_SKILLS[family] || fallback);
}

export function automaticBattleSkillForCombatant(combatant = {}, { defaultSkill = null } = {}) {
  const existing = Array.isArray(combatant.skills) ? combatant.skills[0] : null;
  const explicit = combatant.skillCode || combatant.signatureSkillId
    || (typeof existing === 'string' ? existing : existing?.id || existing?.skillId);
  const family = combatant.weaponFamily
    || combatant.equipment?.weapon?.weaponFamily
    || combatant.equipment?.weapon?.family
    || combatant.equippedItem?.weaponFamily
    || combatant.equippedItem?.family;
  if (explicit) return automaticBattleSkill(explicit);
  if (family) return automaticBattleSkillForWeaponFamily(family, defaultSkill || 'threadsong');
  return defaultSkill ? automaticBattleSkill(defaultSkill) : null;
}

export function prepareAutomaticBattleCombatant(combatant, {
  skillCode = null,
  weaponFamily = null,
  defaultSkill = null,
  startingMana = 0,
  manaGain = AUTOMATIC_BATTLE_RULES.manaPerBasicAttack,
  manaGainOnDamage = AUTOMATIC_BATTLE_RULES.manaOnDamage,
} = {}) {
  if (!combatant || typeof combatant !== 'object') throw new Error('Automatic battle combatant is required.');
  const selected = automaticBattleSkillForCombatant({
    ...combatant,
    skillCode: skillCode || combatant.skillCode,
    weaponFamily: weaponFamily || combatant.weaponFamily,
  }, { defaultSkill });
  const maxMana = Math.max(0, Math.floor(Number(combatant.maxMana ?? AUTOMATIC_BATTLE_RULES.maxMana)));
  const mana = Math.max(0, Math.min(maxMana, Math.floor(Number(combatant.mana ?? startingMana))));
  return {
    ...combatant,
    mana,
    maxMana,
    manaGain: Math.max(0, Math.floor(Number(combatant.manaGain ?? manaGain))),
    manaGainOnDamage: Math.max(0, Math.floor(Number(combatant.manaGainOnDamage ?? manaGainOnDamage))),
    skills: selected ? [selected] : [],
    skillCode: selected?.id || null,
  };
}
