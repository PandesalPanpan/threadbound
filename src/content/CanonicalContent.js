export const WORLD_ARCS = Object.freeze([
  Object.freeze({
    id: 'arc-1',
    type: 'world-arc',
    title: 'The First Unraveling',
    summary: 'The first recorded rupture in the Loom, when Frayed creatures began crossing into the known world.',
    body: 'The First Unraveling marks the opening era of Threadbound. The disturbance is centered on Frayed Hollow, where broken strands of the Loom have taken hostile form. Every expedition contributes to the world record of this arc, and future arcs will preserve the outcomes of earlier ones rather than replacing them.',
    revision: 1,
    source: 'canonical',
    tags: ['arc-1', 'loom', 'frayed-hollow'],
  }),
]);

export const LORE_ENTRIES = Object.freeze([
  Object.freeze({
    id: 'the-loom',
    type: 'lore',
    title: 'The Loom',
    summary: 'The hidden structure that binds places, memories, creatures, and artifacts together.',
    body: 'Weavers use “the Loom” as shorthand for the structure beneath ordinary reality. A stable strand connects things that belong together; a Frayed strand carries contradiction, decay, or a history that no longer fits. Threadbound equipment can resonate with these strands, which is why relic effects often behave like rules rather than ordinary materials.',
    revision: 1,
    source: 'canonical',
    tags: ['world', 'weavers'],
  }),
  Object.freeze({
    id: 'frayed-hollow',
    type: 'lore',
    title: 'Frayed Hollow',
    summary: 'A wounded region where the First Unraveling is strongest.',
    body: 'Frayed Hollow is the first expedition zone recorded by modern Weavers. Lesser Frayed entities gather around unstable seams, while the Silkbound Guard protects deeper paths toward the First Needle. The Hollow remains accessible alone, but expeditions are more efficient when multiple Weavers coordinate their roles.',
    revision: 1,
    source: 'canonical',
    tags: ['location', 'arc-1'],
  }),
  Object.freeze({
    id: 'first-needle-legend',
    type: 'lore',
    title: 'Legend of the First Needle',
    summary: 'A recurring account of a weapon, a creature, or perhaps a title at the center of the Unraveling.',
    body: 'No surviving account agrees on whether the First Needle was forged, born, or appointed. What is consistent is its role: it anchors the Frayed Hollow and resists attempts to stitch the region back into the Loom. Defeating it does not erase the Hollow; it records a new victory into the world history and weakens the current manifestation.',
    revision: 1,
    source: 'canonical',
    tags: ['boss', 'arc-1'],
  }),
]);

export function allCanonicalNarrativeEntries() {
  return [...WORLD_ARCS, ...LORE_ENTRIES].map((entry) => ({ ...entry }));
}
