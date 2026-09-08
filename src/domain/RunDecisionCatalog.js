export const RUN_DECISION_EVENTS = Object.freeze({
  'frayed-shrine': Object.freeze({
    id: 'frayed-shrine',
    name: 'Frayed Shrine',
    description: 'A torn shrine hums between encounters. The party can pull power from the loose weave or spend its momentum repairing the damage.',
    choices: Object.freeze([
      Object.freeze({
        id: 'harvest-fray',
        name: 'Harvest the Fray',
        description: 'Gain +2 Attack for the rest of the run. Each living Weaver suffers 5 strain, but cannot be downed by the choice.',
        effect: Object.freeze({ attackBonus: 2, strain: 5, heal: 0, clearFocus: false }),
      }),
      Object.freeze({
        id: 'seal-tear',
        name: 'Seal the Tear',
        description: 'Restore up to 10 HP to every living Weaver, but release all accumulated Focus.',
        effect: Object.freeze({ attackBonus: 0, strain: 0, heal: 10, clearFocus: true }),
      }),
    ]),
  }),
});

function stableIndex(value, size) {
  let hash = 0;
  for (const character of String(value || '')) hash = ((hash * 31) + character.codePointAt(0)) >>> 0;
  return size > 0 ? hash % size : 0;
}

export function selectRunDecision({ runId, dungeonId, encounterIndex, nextEncounterIndex }) {
  const events = Object.values(RUN_DECISION_EVENTS);
  if (events.length === 0) throw new Error('No run decision events are configured.');
  const selected = events[stableIndex(`${runId}:${dungeonId}:${encounterIndex}`, events.length)];
  return structuredClone({
    ...selected,
    offeredAfterEncounterIndex: encounterIndex,
    nextEncounterIndex,
  });
}

export function decisionChoice(decision, choiceId) {
  const choice = decision?.choices?.find((candidate) => candidate.id === choiceId) || null;
  if (!choice) throw new Error(`Unknown run decision choice: ${choiceId}`);
  return structuredClone(choice);
}
