const power = (definition) => Object.freeze({
  attackBonus: 0,
  heal: 0,
  reactionStyle: null,
  category: 'TECHNIQUE',
  accent: 'special',
  ...definition,
  effectSummary: Object.freeze([...(definition.effectSummary || [])]),
});

/**
 * Constrained temporary-run power vocabulary.
 *
 * Like generated item effects, run powers are data, not executable content. AdventureRun
 * is the aggregate boundary that applies these whitelisted effects. This lets the offer
 * pool grow without allowing generated manifests or browser code to invent mechanics.
 */
export const RUN_UPGRADES = Object.freeze({
  sharpen: power({
    id: 'sharpen',
    name: 'Sharpen the Thread',
    category: 'OFFENSE',
    accent: 'damage',
    attackBonus: 3,
    description: '+3 Attack for the rest of this run.',
    effectSummary: ['+3 Attack'],
  }),
  'needle-rush': power({
    id: 'needle-rush',
    name: 'Needle Rush',
    category: 'OFFENSE',
    accent: 'damage',
    attackBonus: 4,
    description: 'Commit to raw pressure: +4 Attack for the rest of this run.',
    effectSummary: ['+4 Attack'],
  }),
  'tempered-edge': power({
    id: 'tempered-edge',
    name: 'Tempered Edge',
    category: 'OFFENSE',
    accent: 'damage',
    attackBonus: 2,
    heal: 5,
    description: 'Gain +2 Attack and restore 5 HP to every living Weaver.',
    effectSummary: ['+2 Attack', '+5 HP now'],
  }),
  reinforce: power({
    id: 'reinforce',
    name: 'Reinforce the Weave',
    category: 'SUSTAIN',
    accent: 'heal',
    heal: 12,
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
    description: 'Restore 8 HP. Successful Guards prime +3 damage on your next strike.',
    effectSummary: ['+8 HP now', 'Guard → +3 next damage'],
  }),
  riposte: power({
    id: 'riposte',
    name: 'Riposte Weave',
    category: 'TECHNIQUE',
    accent: 'guard',
    heal: 4,
    reactionStyle: 'guard',
    description: 'Restore 4 HP. Successful Guards prime +3 damage on your next strike.',
    effectSummary: ['+4 HP now', 'Guard → +3 next damage'],
  }),
  disrupt: power({
    id: 'disrupt',
    name: 'Disruptor Knot',
    category: 'TECHNIQUE',
    accent: 'special',
    heal: 4,
    reactionStyle: 'interrupt',
    description: 'Restore 4 HP. Successful Interrupts prime +4 damage on your next strike.',
    effectSummary: ['+4 HP now', 'Interrupt → +4 next damage'],
  }),
  'warping-riposte': power({
    id: 'warping-riposte',
    name: 'Warping Riposte',
    category: 'TECHNIQUE',
    accent: 'guard',
    attackBonus: 2,
    heal: 2,
    reactionStyle: 'guard',
    description: 'Gain +2 Attack, restore 2 HP, and turn successful Guards into +3 next damage.',
    effectSummary: ['+2 Attack', '+2 HP now', 'Guard → +3 next damage'],
  }),
  'breaker-knot': power({
    id: 'breaker-knot',
    name: 'Breaker Knot',
    category: 'TECHNIQUE',
    accent: 'special',
    attackBonus: 2,
    heal: 2,
    reactionStyle: 'interrupt',
    description: 'Gain +2 Attack, restore 2 HP, and turn successful Interrupts into +4 next damage.',
    effectSummary: ['+2 Attack', '+2 HP now', 'Interrupt → +4 next damage'],
  }),
});

export function runUpgrade(upgradeId) {
  const upgrade = RUN_UPGRADES[String(upgradeId || '')];
  if (!upgrade) throw new Error(`Unknown run upgrade: ${upgradeId}`);
  return upgrade;
}
