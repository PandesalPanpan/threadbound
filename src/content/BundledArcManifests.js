export const GLASSWAKE_ARC_MANIFEST = Object.freeze({
  manifestVersion: 1,
  arc: Object.freeze({
    id: 'glasswake',
    title: 'The Glasswake',
    premise: 'A drowned mirror-strand has surfaced beneath the Loom, reflecting wounded Weavers back at their parties and teaching Frayed hunters to single out whoever looks easiest to break.',
    progression: Object.freeze({ metric: 'dungeon_clears', target: 1800 }),
  }),
  lore: Object.freeze([
    Object.freeze({
      id: 'mirrorfen',
      title: 'The Mirrorfen',
      summary: 'A flooded seam where every reflection remembers a different version of the party.',
      body: 'The Mirrorfen formed when a drowned strand of the Loom began preserving reflections instead of histories. Hunters inside the fen follow weakness rather than threat, forcing Weavers to protect one another instead of racing for personal damage.',
      tags: Object.freeze(['location', 'glasswake', 'mirror']),
    }),
    Object.freeze({
      id: 'glasswake-oath',
      title: 'The Glasswake Oath',
      summary: 'A field rule among Weavers: the marked are never left to answer alone.',
      body: 'The first parties that survived the Mirrorfen learned that a mark can be intercepted. The Glasswake Oath turned that discovery into doctrine: when the reflection chooses one Weaver, another steps into the line.',
      tags: Object.freeze(['weavers', 'glasswake', 'co-op']),
    }),
  ]),
  enemies: Object.freeze([
    Object.freeze({ id: 'glass-skulker', name: 'Glass Skulker', baseHp: 11, retaliation: 2, abilities: Object.freeze(['ally_hunter']), intentCadence: 1 }),
    Object.freeze({ id: 'stitch-leech', name: 'Stitch Leech', baseHp: 13, retaliation: 2, abilities: Object.freeze(['self_mend']), intentCadence: 2 }),
    Object.freeze({ id: 'mirror-warden', name: 'Mirror Warden', baseHp: 14, retaliation: 2, abilities: Object.freeze(['ally_hunter', 'heavy_pressure']), intentCadence: 1 }),
    Object.freeze({ id: 'shard-choir', name: 'Shard Choir', baseHp: 12, retaliation: 2, abilities: Object.freeze(['ally_hunter', 'self_mend']), intentCadence: 1 }),
  ]),
  bosses: Object.freeze([
    Object.freeze({ id: 'hollow-mirror', name: 'The Hollow Mirror', baseHp: 30, retaliation: 4, abilities: Object.freeze(['ally_hunter', 'heavy_pressure', 'self_mend']), intentCadence: 1 }),
  ]),
  runEvents: Object.freeze([
    Object.freeze({
      id: 'shattered-crossing',
      name: 'Shattered Crossing',
      prompt: 'A bridge of mirror glass splits beneath the party. There is enough thread to secure everyone or enough momentum to rush the far side, but not both.',
      choices: Object.freeze([
        Object.freeze({ id: 'anchor-the-line', name: 'Anchor the Line', summary: 'Restore 10 HP to every living Weaver, but each loses 1 Focus.', effects: Object.freeze({ healAll: 10, focusAll: -1 }) }),
        Object.freeze({ id: 'rush-the-reflection', name: 'Rush the Reflection', summary: 'Gain +2 Attack for the rest of the run, but every living Weaver takes 6 HP.', effects: Object.freeze({ runAttackBonus: 2, damageAll: 6 }) }),
      ]),
    }),
    Object.freeze({
      id: 'borrowed-reflection',
      name: 'Borrowed Reflection',
      prompt: 'A reflection offers the party strength borrowed from a future victory. Taking it sharpens the next fights but leaves the present body strained.',
      choices: Object.freeze([
        Object.freeze({ id: 'take-the-echo', name: 'Take the Echo', summary: 'Every living Weaver gains 2 Focus and takes 5 HP.', effects: Object.freeze({ focusAll: 2, damageAll: 5 }) }),
        Object.freeze({ id: 'break-the-image', name: 'Break the Image', summary: 'Restore 8 HP to every living Weaver and leave Focus unchanged.', effects: Object.freeze({ healAll: 8 }) }),
      ]),
    }),
  ]),
  dungeons: Object.freeze([
    Object.freeze({
      id: 'mirrorfen-descent',
      name: 'Mirrorfen Descent',
      recommendedPlayers: 2,
      encounters: Object.freeze(['glass-skulker', 'stitch-leech', 'mirror-warden']),
      encounterVariants: Object.freeze([
        Object.freeze(['shard-choir', 'glass-skulker', 'mirror-warden']),
        Object.freeze(['stitch-leech', 'mirror-warden', 'shard-choir']),
      ]),
      runEventSchedule: Object.freeze({ afterEncounterIndex: 1, eventIds: Object.freeze(['shattered-crossing', 'borrowed-reflection']) }),
      bossId: 'hollow-mirror',
      rewardPoolId: 'glasswake-relics',
    }),
  ]),
  itemPools: Object.freeze([
    Object.freeze({
      id: 'glasswake-relics',
      items: Object.freeze([
        Object.freeze({ id: 'mirror-shears-template', namePattern: 'Mirror Shears of {suffix}', rarity: 'rare', attackBonus: 3, effects: Object.freeze(['boss_bane']) }),
        Object.freeze({ id: 'glass-needle-template', namePattern: 'Glass Needle of {arc}', rarity: 'uncommon', attackBonus: 2, effects: Object.freeze(['opening_strike']) }),
      ]),
    }),
  ]),
  achievements: Object.freeze([
    Object.freeze({ id: 'mirrorfen-cleared', title: 'No Weaver Left Reflected', description: 'Complete Mirrorfen Descent once.', event: 'dungeon_completed', targetId: 'mirrorfen-descent', threshold: 1 }),
    Object.freeze({ id: 'hollow-mirror-broken', title: 'Break the Hollow Mirror', description: 'Defeat the Hollow Mirror once.', event: 'boss_defeated', targetId: 'hollow-mirror', threshold: 1 }),
  ]),
  historicalConsequences: Object.freeze([
    Object.freeze({ id: 'glasswake-recorded', trigger: 'arc_started', title: 'The Glasswake is recorded', body: 'Weavers formally marked the Mirrorfen as a hostile strand and adopted interception doctrine for marked allies.' }),
  ]),
});

export const BUNDLED_ARC_MANIFESTS = Object.freeze([GLASSWAKE_ARC_MANIFEST]);
