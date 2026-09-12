export const AUTOMATIC_BATTLE_EFFECT_TYPES = Object.freeze(['fire', 'poison', 'ice', 'psychic']);

export const AUTOMATIC_BATTLE_EFFECT_RULES = Object.freeze({
  maxDurationTurns: 20,
  maxPotency: 100,
  maxPoisonStacks: 5,
});

const EFFECT_SET = new Set(AUTOMATIC_BATTLE_EFFECT_TYPES);

function finiteInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
}

function boundedInteger(value, minimum, maximum, fallback) {
  return Math.max(minimum, Math.min(maximum, finiteInteger(value, fallback)));
}

export function isAutomaticBattleEffectType(value) {
  return EFFECT_SET.has(String(value || '').trim().toLowerCase());
}

export function normalizeAutomaticBattleEffect(effect) {
  if (!effect || typeof effect !== 'object') {
    throw new Error('Automatic battle effect must be an object.');
  }

  const type = String(effect.type || '').trim().toLowerCase();
  if (!EFFECT_SET.has(type)) {
    throw new Error(`Unsupported automatic battle effect type: ${type || '(empty)'}.`);
  }

  const normalized = {
    type,
    potency: boundedInteger(effect.potency, 1, AUTOMATIC_BATTLE_EFFECT_RULES.maxPotency, 1),
    remainingTurns: boundedInteger(effect.remainingTurns, 1, AUTOMATIC_BATTLE_EFFECT_RULES.maxDurationTurns, 1),
  };

  if (type === 'poison') {
    normalized.stacks = boundedInteger(effect.stacks, 1, AUTOMATIC_BATTLE_EFFECT_RULES.maxPoisonStacks, 1);
  }

  return Object.freeze(normalized);
}

export function normalizeAutomaticBattleEffects(effects = []) {
  if (effects == null) return Object.freeze([]);
  if (!Array.isArray(effects)) throw new Error('Automatic battle effects must be an array.');
  return Object.freeze(effects.map(normalizeAutomaticBattleEffect));
}

export function projectCombatantWithAutomaticEffects(combatant = {}) {
  const effects = normalizeAutomaticBattleEffects(combatant.effects || []);
  let attack = Math.max(1, finiteInteger(combatant.attack, 1));
  let defense = Math.max(0, finiteInteger(combatant.defense, 0));
  let speed = Math.max(1, finiteInteger(combatant.speed, 1));

  for (const effect of effects) {
    if (effect.type === 'ice') speed = Math.max(1, speed - effect.potency);
    if (effect.type === 'psychic') {
      attack = Math.max(1, attack - effect.potency);
      defense = Math.max(0, defense - effect.potency);
    }
  }

  return Object.freeze({
    ...combatant,
    attack,
    defense,
    speed,
    effects,
  });
}

export function resolveAutomaticEffectTurnStart(combatant = {}) {
  const effects = normalizeAutomaticBattleEffects(combatant.effects || []);
  let periodicDamage = 0;
  const events = [];
  const remainingEffects = [];

  for (const effect of effects) {
    if (effect.type === 'fire') {
      periodicDamage += effect.potency;
      events.push(Object.freeze({ type: 'fire', damage: effect.potency }));
    } else if (effect.type === 'poison') {
      const damage = effect.potency * effect.stacks;
      periodicDamage += damage;
      events.push(Object.freeze({ type: 'poison', damage, stacks: effect.stacks }));
    }

    if (effect.remainingTurns > 1) {
      remainingEffects.push(Object.freeze({ ...effect, remainingTurns: effect.remainingTurns - 1 }));
    } else {
      events.push(Object.freeze({ type: effect.type, expired: true }));
    }
  }

  return Object.freeze({
    periodicDamage,
    events: Object.freeze(events),
    remainingEffects: Object.freeze(remainingEffects),
  });
}

export function mergeAutomaticBattleEffect(effects = [], incomingEffect) {
  const normalized = [...normalizeAutomaticBattleEffects(effects)];
  const incoming = normalizeAutomaticBattleEffect(incomingEffect);
  const index = normalized.findIndex((effect) => effect.type === incoming.type);

  if (index < 0) return Object.freeze([...normalized, incoming]);

  const current = normalized[index];
  let merged;
  if (incoming.type === 'poison') {
    merged = normalizeAutomaticBattleEffect({
      type: 'poison',
      potency: Math.max(current.potency, incoming.potency),
      remainingTurns: Math.max(current.remainingTurns, incoming.remainingTurns),
      stacks: Math.min(AUTOMATIC_BATTLE_EFFECT_RULES.maxPoisonStacks, current.stacks + incoming.stacks),
    });
  } else {
    merged = normalizeAutomaticBattleEffect({
      type: incoming.type,
      potency: Math.max(current.potency, incoming.potency),
      remainingTurns: Math.max(current.remainingTurns, incoming.remainingTurns),
    });
  }

  normalized[index] = merged;
  return Object.freeze(normalized);
}
