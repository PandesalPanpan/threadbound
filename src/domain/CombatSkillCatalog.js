export const MAX_FOCUS = 4;

export const COMBAT_SKILLS = Object.freeze({
  'piercing-stitch': Object.freeze({
    id: 'piercing-stitch',
    name: 'Piercing Stitch',
    cost: 2,
    cooldown: 2,
    kind: 'damage',
    damageBonus: 2,
    description: 'Strike harder and expose the foe so an ally can cash in the opening.',
    streamlinedDescription: 'A quick empowered strike. Use it whenever its cooldown is ready.',
  }),
  'severing-knot': Object.freeze({
    id: 'severing-knot',
    name: 'Severing Knot',
    cost: 3,
    cooldown: 3,
    kind: 'damage',
    damageBonus: 4,
    comboBonus: 4,
    interrupts: true,
    description: 'A costly finisher that consumes Exposed for bonus damage and can cut off a telegraphed action.',
    streamlinedDescription: 'A heavy strike that can interrupt an enemy telegraph when timed well.',
  }),
  'mending-chorus': Object.freeze({
    id: 'mending-chorus',
    name: 'Mending Chorus',
    cost: 3,
    cooldown: 3,
    kind: 'party-heal',
    heal: 5,
    description: 'Restore every living Weaver and stabilize the party without choosing one target.',
    streamlinedDescription: 'Restore every living Weaver. Available again after its cooldown.',
  }),
});

export function combatSkill(skillId) {
  const skill = COMBAT_SKILLS[String(skillId || '')];
  if (!skill) throw new Error(`Unknown combat skill: ${skillId}`);
  return skill;
}

export function publicCombatSkills() {
  return Object.values(COMBAT_SKILLS).map((skill) => ({ ...skill }));
}
