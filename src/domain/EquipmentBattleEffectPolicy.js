import { normalizeAutomaticBattleEffect } from './AutomaticBattleEffectPolicy.js';
import { resolveAutomaticBasicAttack } from './AutomaticBattleActionPolicy.js';

export const EQUIPMENT_BATTLE_EFFECT_RULES = Object.freeze({
  maxBonusDamage: 20,
  maxEffectsPerItem: 3,
});

const RAW_CATALOG = Object.freeze({
  none: Object.freeze({
    code: 'none',
    name: 'Plain Weave',
    description: 'No special combat effect.',
    mechanics: Object.freeze([]),
  }),
  opening_strike: Object.freeze({
    code: 'opening_strike',
    name: 'Opening Stitch',
    description: '+2 damage on the first attack of every encounter.',
    mechanics: Object.freeze([
      Object.freeze({ kind: 'bonus-damage', trigger: 'first-action', amount: 2 }),
    ]),
  }),
  boss_bane: Object.freeze({
    code: 'boss_bane',
    name: 'Severing',
    description: '+2 damage against bosses.',
    mechanics: Object.freeze([
      Object.freeze({ kind: 'bonus-damage', trigger: 'target-tag', targetTag: 'boss', amount: 2 }),
    ]),
  }),
  quick_hunt: Object.freeze({
    code: 'quick_hunt',
    name: 'Trailrunner',
    description: 'Reduces the Hunt cooldown by 20%, subject to the global activity cooldown cap.',
    mechanics: Object.freeze([]),
  }),
  ember_edge: Object.freeze({
    code: 'ember_edge',
    name: 'Ember Edge',
    description: 'Successful attacks apply a short Fire effect.',
    mechanics: Object.freeze([
      Object.freeze({ kind: 'apply-effect', trigger: 'on-hit', effect: Object.freeze({ type: 'fire', potency: 2, remainingTurns: 2 }) }),
    ]),
  }),
  venom_edge: Object.freeze({
    code: 'venom_edge',
    name: 'Venom Edge',
    description: 'Successful attacks apply stacking Poison pressure.',
    mechanics: Object.freeze([
      Object.freeze({ kind: 'apply-effect', trigger: 'on-hit', effect: Object.freeze({ type: 'poison', potency: 1, remainingTurns: 3, stacks: 1 }) }),
    ]),
  }),
  frost_edge: Object.freeze({
    code: 'frost_edge',
    name: 'Frost Edge',
    description: 'Successful attacks apply Ice and reduce Speed temporarily.',
    mechanics: Object.freeze([
      Object.freeze({ kind: 'apply-effect', trigger: 'on-hit', effect: Object.freeze({ type: 'ice', potency: 2, remainingTurns: 2 }) }),
    ]),
  }),
  mind_edge: Object.freeze({
    code: 'mind_edge',
    name: 'Mind Edge',
    description: 'Successful attacks apply Psychic pressure temporarily.',
    mechanics: Object.freeze([
      Object.freeze({ kind: 'apply-effect', trigger: 'on-hit', effect: Object.freeze({ type: 'psychic', potency: 1, remainingTurns: 2 }) }),
    ]),
  }),
});

const ALLOWED_KINDS = new Set(['bonus-damage', 'apply-effect']);
const ALLOWED_TRIGGERS = new Set(['first-action', 'target-tag', 'on-hit']);

function positiveInteger(value, label, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0 || number > maximum) {
    throw new Error(`${label} must be an integer in [1, ${maximum}].`);
  }
  return number;
}

function normalizeMechanic(mechanic, index) {
  if (!mechanic || typeof mechanic !== 'object' || Array.isArray(mechanic)) {
    throw new Error(`Equipment effect mechanic ${index + 1} must be an object.`);
  }

  const kind = String(mechanic.kind || '').trim().toLowerCase();
  const trigger = String(mechanic.trigger || '').trim().toLowerCase();
  if (!ALLOWED_KINDS.has(kind)) throw new Error(`Unsupported equipment effect mechanic kind: ${kind || '(empty)'}.`);
  if (!ALLOWED_TRIGGERS.has(trigger)) throw new Error(`Unsupported equipment effect trigger: ${trigger || '(empty)'}.`);

  if (kind === 'bonus-damage') {
    if (trigger === 'on-hit') throw new Error('bonus-damage cannot use on-hit; damage is resolved before hit-trigger effects.');
    const normalized = {
      kind,
      trigger,
      amount: positiveInteger(mechanic.amount, 'Equipment bonus damage', EQUIPMENT_BATTLE_EFFECT_RULES.maxBonusDamage),
    };
    if (trigger === 'target-tag') {
      const targetTag = String(mechanic.targetTag || '').trim().toLowerCase();
      if (!targetTag) throw new Error('target-tag equipment effect requires targetTag.');
      normalized.targetTag = targetTag;
    }
    return Object.freeze(normalized);
  }

  if (trigger !== 'on-hit') throw new Error('apply-effect currently requires the on-hit trigger.');
  return Object.freeze({
    kind,
    trigger,
    effect: normalizeAutomaticBattleEffect(mechanic.effect),
  });
}

export function normalizeEquipmentBattleEffectDefinition(definition) {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    throw new Error('Equipment battle effect definition must be an object.');
  }

  const code = String(definition.code || '').trim().toLowerCase();
  if (!code) throw new Error('Equipment battle effect definition requires a code.');
  const name = String(definition.name || '').trim();
  const description = String(definition.description || '').trim();
  if (!name) throw new Error(`${code} equipment effect requires a name.`);
  if (!description) throw new Error(`${code} equipment effect requires a description.`);
  if (!Array.isArray(definition.mechanics)) throw new Error(`${code} equipment effect mechanics must be an array.`);
  if (definition.mechanics.length > EQUIPMENT_BATTLE_EFFECT_RULES.maxEffectsPerItem) {
    throw new Error(`${code} exceeds the equipment mechanic limit.`);
  }

  return Object.freeze({
    code,
    name,
    description,
    mechanics: Object.freeze(definition.mechanics.map(normalizeMechanic)),
  });
}

export const EQUIPMENT_EFFECT_CATALOG = Object.freeze(Object.fromEntries(
  Object.entries(RAW_CATALOG).map(([code, definition]) => [code, normalizeEquipmentBattleEffectDefinition(definition)]),
));

export function equipmentBattleEffectDefinition(effectCode = 'none') {
  const code = String(effectCode || 'none').trim().toLowerCase();
  const definition = EQUIPMENT_EFFECT_CATALOG[code];
  if (!definition) throw new Error(`Unsupported equipment effect code: ${code || '(empty)'}.`);
  return definition;
}

export function equipmentEffectCodesFromCombatant(combatant = {}) {
  const codes = [];
  const seenItems = new Set();
  const addItem = (item) => {
    if (!item || typeof item !== 'object') return;
    const identity = item.id || item;
    if (seenItems.has(identity)) return;
    seenItems.add(identity);
    codes.push(String(item.effectCode || 'none').trim().toLowerCase());
  };

  if (combatant.equipment && typeof combatant.equipment === 'object') {
    for (const item of Object.values(combatant.equipment)) addItem(item);
  }
  addItem(combatant.equippedItem);
  if (Array.isArray(combatant.equipmentEffectCodes)) {
    for (const code of combatant.equipmentEffectCodes) codes.push(String(code || 'none').trim().toLowerCase());
  }

  return Object.freeze(codes.filter((code) => code && code !== 'none'));
}

function targetHasTag(target, tag) {
  if (tag === 'boss' && target?.isBoss === true) return true;
  return Array.isArray(target?.tags) && target.tags.some((entry) => String(entry || '').trim().toLowerCase() === tag);
}

function triggerMatches({ mechanic, actor, target, turns, baseAction }) {
  if (mechanic.trigger === 'first-action') {
    return !turns.some((turn) => turn.actorId === actor.id && turn.targetId !== null);
  }
  if (mechanic.trigger === 'target-tag') return targetHasTag(target, mechanic.targetTag);
  if (mechanic.trigger === 'on-hit') return Number(baseAction.targetDamage || 0) > 0;
  return false;
}

export function applyEquipmentBattleEffects({ actor, target, turns = [], baseAction, effectCodes = null } = {}) {
  if (!actor || typeof actor !== 'object') throw new Error('Equipment effects require an actor.');
  if (!target || typeof target !== 'object') throw new Error('Equipment effects require a target.');
  if (!baseAction || typeof baseAction !== 'object') throw new Error('Equipment effects require a base action.');
  if (!Array.isArray(turns)) throw new Error('Equipment effect turns must be an array.');

  const codes = effectCodes == null ? equipmentEffectCodesFromCombatant(actor) : effectCodes;
  if (!Array.isArray(codes)) throw new Error('Equipment effect codes must be an array.');

  let bonusDamage = 0;
  const targetEffects = [...(Array.isArray(baseAction.targetEffects) ? baseAction.targetEffects : [])];
  const triggered = [];

  for (const effectCode of codes) {
    const definition = equipmentBattleEffectDefinition(effectCode);
    for (const mechanic of definition.mechanics) {
      if (!triggerMatches({ mechanic, actor, target, turns, baseAction })) continue;
      if (mechanic.kind === 'bonus-damage') bonusDamage += mechanic.amount;
      if (mechanic.kind === 'apply-effect') targetEffects.push(mechanic.effect);
      triggered.push(Object.freeze({
        effectCode: definition.code,
        kind: mechanic.kind,
        trigger: mechanic.trigger,
        amount: mechanic.kind === 'bonus-damage' ? mechanic.amount : undefined,
        appliedEffect: mechanic.kind === 'apply-effect' ? mechanic.effect.type : undefined,
      }));
    }
  }

  return {
    ...baseAction,
    targetDamage: Math.max(0, Number(baseAction.targetDamage || 0) + bonusDamage),
    targetEffects,
    metadata: Object.freeze({
      ...(baseAction.metadata || {}),
      equipmentBonusDamage: bonusDamage,
      equipmentEffects: Object.freeze(triggered),
    }),
  };
}

export function createEquipmentAwareAutomaticBasicAttackResolver({ random = Math.random, critMultiplier } = {}) {
  return ({ actor, target, turns = [] }) => {
    const baseAction = resolveAutomaticBasicAttack({ actor, target, random, critMultiplier });
    return applyEquipmentBattleEffects({ actor, target, turns, baseAction });
  };
}
