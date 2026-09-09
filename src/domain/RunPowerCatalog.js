const power = (definition) => Object.freeze({
  attackBonus: 0,
  heal: 0,
  reactionStyle: null,
  category: 'TECHNIQUE',
  accent: 'special',
  ...definition,
  archetypes: Object.freeze([...(definition.archetypes || [])]),
  mechanics: Object.freeze({ ...(definition.mechanics || {}) }),
  effectSummary: Object.freeze([...(definition.effectSummary || [])]),
});

/**
 * Constrained temporary-run power vocabulary.
 *
 * Like generated item effects, run powers are data, not executable content. AdventureRun
 * stores only selected power IDs; RunBuildPolicy derives the whitelisted mechanics and
 * DungeonRun applies them inside the Domain Model. Generated manifests and browser code
 * can therefore reference vocabulary, but cannot inject executable combat behavior.
 */
export const RUN_UPGRADES = Object.freeze({
  sharpen: power({
    id: 'sharpen',
    name: 'Sharpen the Thread',
    category: 'OFFENSE',
    accent: 'damage',
    attackBonus: 3,
    archetypes: ['pressure', 'expose'],
    mechanics: { exposedDamageBonus: 2 },
    description: '+3 Attack. Hits against Exposed targets gain +2 additional damage.',
    effectSummary: ['+3 Attack', 'Exposed → +2 damage'],
  }),
  'needle-rush': power({
    id: 'needle-rush',
    name: 'Needle Rush',
    category: 'OFFENSE',
    accent: 'damage',
    attackBonus: 4,
    archetypes: ['pressure', 'expose'],
    mechanics: { exposedCritChanceBonus: 0.2 },
    description: '+4 Attack. Exposed targets grant +20% additional critical-strike chance.',
    effectSummary: ['+4 Attack', 'Exposed → +20% crit'],
  }),
  'tempered-edge': power({
    id: 'tempered-edge',
    name: 'Tempered Edge',
    category: 'OFFENSE',
    accent: 'damage',
    attackBonus: 2,
    heal: 5,
    archetypes: ['focus', 'pressure'],
    mechanics: { skillFocusRefund: 1 },
    description: 'Gain +2 Attack, restore 5 HP, and refund 1 Focus after a damage skill connects.',
    effectSummary: ['+2 Attack', '+5 HP now', 'Damage skill → refund 1 Focus'],
  }),
  reinforce: power({
    id: 'reinforce',
    name: 'Reinforce the Weave',
    category: 'SUSTAIN',
    accent: 'heal',
    heal: 12,
    archetypes: ['sustain'],
    description: 'Restore 12 HP to every living Weaver.',
    effectSummary: ['+12 HP now'],
  }),
  'deep-bind': power({
    id: 'deep-bind',
    name: 'Deep Bind',
    category: 'SUSTAIN',
    accent: 'heal',
    attackBonus: 1,
    heal: 9,
    archetypes: ['sustain', 'pressure'],
    description: 'Restore 9 HP to every living Weaver and gain +1 Attack.',
    effectSummary: ['+9 HP now', '+1 Attack'],
  }),
  'silk-ward': power({
    id: 'silk-ward',
    name: 'Silk Ward',
    category: 'SUSTAIN',
    accent: 'heal',
    heal: 8,
    reactionStyle: 'guard',
    archetypes: ['guard', 'sustain'],
    mechanics: { guardFocusBonus: 1 },
    description: 'Restore 8 HP. Successful Guards prime a counter and generate +1 extra Focus.',
    effectSummary: ['+8 HP now', 'Guard → counter', 'Guard → +1 extra Focus'],
  }),
  riposte: power({
    id: 'riposte',
    name: 'Riposte Weave',
    category: 'TECHNIQUE',
    accent: 'guard',
    heal: 4,
    reactionStyle: 'guard',
    archetypes: ['guard'],
    mechanics: { guardCounterBonus: 2 },
    description: 'Restore 4 HP. Successful Guards add +2 extra damage on top of the primed riposte.',
    effectSummary: ['+4 HP now', 'Guard → +2 extra counter damage'],
  }),
  disrupt: power({
    id: 'disrupt',
    name: 'Disruptor Knot',
    category: 'TECHNIQUE',
    accent: 'special',
    heal: 4,
    reactionStyle: 'interrupt',
    archetypes: ['control', 'focus'],
    mechanics: { interruptFocusBonus: 1 },
    description: 'Restore 4 HP. Successful Interrupts prime a counter and generate +1 extra Focus.',
    effectSummary: ['+4 HP now', 'Interrupt → counter', 'Interrupt → +1 extra Focus'],
  }),
  'warping-riposte': power({
    id: 'warping-riposte',
    name: 'Warping Riposte',
    category: 'TECHNIQUE',
    accent: 'guard',
    attackBonus: 2,
    heal: 2,
    reactionStyle: 'guard',
    archetypes: ['guard', 'pressure'],
    mechanics: { guardCounterBonus: 3, guardFocusBonus: 1 },
    description: 'Gain +2 Attack and 2 HP. Successful Guards add +3 extra counter damage and +1 extra Focus.',
    effectSummary: ['+2 Attack', '+2 HP now', 'Guard → +3 extra counter', 'Guard → +1 extra Focus'],
  }),
  'breaker-knot': power({
    id: 'breaker-knot',
    name: 'Breaker Knot',
    category: 'TECHNIQUE',
    accent: 'special',
    attackBonus: 2,
    heal: 2,
    reactionStyle: 'interrupt',
    archetypes: ['control', 'pressure'],
    mechanics: { interruptCounterBonus: 3, interruptFocusBonus: 1 },
    description: 'Gain +2 Attack and 2 HP. Successful Interrupts add +3 extra counter damage and +1 extra Focus.',
    effectSummary: ['+2 Attack', '+2 HP now', 'Interrupt → +3 extra counter', 'Interrupt → +1 extra Focus'],
  }),
});

export function runUpgrade(upgradeId) {
  const upgrade = RUN_UPGRADES[String(upgradeId || '')];
  if (!upgrade) throw new Error(`Unknown run upgrade: ${upgradeId}`);
  return upgrade;
}
