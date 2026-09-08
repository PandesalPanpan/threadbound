function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value || '')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function selectionIndex(seed, candidateCount) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    const roll = Math.max(0, Math.min(0.999999999, seed));
    return Math.floor(roll * candidateCount);
  }
  return stableHash(seed) % candidateCount;
}

export function selectEncounterSequence(dungeonDefinition, seed) {
  const base = Array.isArray(dungeonDefinition?.encounters) ? dungeonDefinition.encounters : [];
  const variants = Array.isArray(dungeonDefinition?.encounterVariants) ? dungeonDefinition.encounterVariants : [];
  const candidates = [base, ...variants].filter((sequence) => Array.isArray(sequence) && sequence.length > 0);
  if (candidates.length === 0) throw new Error('Dungeon definition requires at least one encounter sequence.');
  const variantIndex = selectionIndex(seed, candidates.length);
  return {
    variantIndex,
    encounters: structuredClone(candidates[variantIndex]),
  };
}

export function stableRunHash(value) {
  return stableHash(value);
}
