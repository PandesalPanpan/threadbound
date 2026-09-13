export const FIGHT_BUFF_RULES = Object.freeze({
  maxAttackIncreasePercent: 50,
  maxFightCount: 99,
});

const FIGHT_BUFF_CATALOG = Object.freeze({
  attack_boost_minor: Object.freeze({
    code: 'attack_boost_minor',
    name: 'Attack Up',
    description: '+10% Attack while the buff has fights remaining.',
    attackIncreasePercent: 10,
    cooldown: null,
  }),
  hunt_haste_minor: Object.freeze({
    code: 'hunt_haste_minor',
    name: 'Hunt Haste',
    description: '10% shorter Hunt cooldown while the buff has fights remaining.',
    attackIncreasePercent: 0,
    cooldown: Object.freeze({ activity: 'hunt', reductionPercent: 10 }),
  }),
  hunt_haste_major: Object.freeze({
    code: 'hunt_haste_major',
    name: 'Greater Hunt Haste',
    description: '25% shorter Hunt cooldown while the buff has fights remaining.',
    attackIncreasePercent: 0,
    cooldown: Object.freeze({ activity: 'hunt', reductionPercent: 25 }),
  }),
});

function normalizedCode(value) {
  return String(value || '').trim().toLowerCase();
}

export function fightBuffDefinition(value) {
  const code = normalizedCode(value);
  const definition = FIGHT_BUFF_CATALOG[code];
  if (!definition) throw new Error(`Unsupported fight buff code: ${code || '(empty)'}.`);
  return definition;
}

export function normalizeFightCount(value) {
  if (!Number.isInteger(value) || value < 1 || value > FIGHT_BUFF_RULES.maxFightCount) {
    throw new Error(`Fight-count buff duration must be an integer between 1 and ${FIGHT_BUFF_RULES.maxFightCount} fights.`);
  }
  return value;
}

export function fightBuffCooldownModifier(value, activity) {
  const definition = fightBuffDefinition(value);
  const normalizedActivity = String(activity || '').trim().toLowerCase();
  if (!definition.cooldown || definition.cooldown.activity !== normalizedActivity) return null;
  return Object.freeze({
    source: 'buff',
    code: definition.code,
    reductionPercent: definition.cooldown.reductionPercent,
  });
}

export function applyFightBuffs(stats, buffCodes = []) {
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) throw new Error('Fight buffs require character stats.');
  if (!Array.isArray(buffCodes)) throw new Error('Fight buff codes must be an array.');

  const definitions = [];
  const seen = new Set();
  for (const value of buffCodes) {
    const definition = fightBuffDefinition(value);
    if (seen.has(definition.code)) continue;
    seen.add(definition.code);
    definitions.push(definition);
  }

  const requestedAttackIncreasePercent = definitions.reduce((sum, definition) => sum + definition.attackIncreasePercent, 0);
  const appliedAttackIncreasePercent = Math.min(FIGHT_BUFF_RULES.maxAttackIncreasePercent, requestedAttackIncreasePercent);
  const baseAttack = Math.max(1, Math.floor(Number(stats.attack) || 1));
  const attack = Math.max(1, Math.ceil(baseAttack * (1 + appliedAttackIncreasePercent / 100)));

  return Object.freeze({
    stats: Object.freeze({ ...stats, attack }),
    modifiers: Object.freeze(definitions.map((definition) => Object.freeze({
      code: definition.code,
      name: definition.name,
      attackIncreasePercent: definition.attackIncreasePercent,
    }))),
    requestedAttackIncreasePercent,
    appliedAttackIncreasePercent,
    capped: requestedAttackIncreasePercent > appliedAttackIncreasePercent,
  });
}

export const FIGHT_BUFF_CODES = Object.freeze(Object.keys(FIGHT_BUFF_CATALOG));
export const ACTIVITY_COOLDOWN_FIGHT_BUFF_CODES = Object.freeze(
  FIGHT_BUFF_CODES.filter((code) => Boolean(FIGHT_BUFF_CATALOG[code].cooldown)),
);
