export const RUN_EVENTS = Object.freeze({
  'frayed-cache': Object.freeze({
    id: 'frayed-cache',
    name: 'Frayed Cache',
    prompt: 'A sealed cache hums between encounters. The party can spend safety now or pull harder for the rest of the run.',
    choices: Object.freeze([
      Object.freeze({
        id: 'bind-wounds',
        name: 'Bind the Wounds',
        summary: 'Restore 14 HP to every living Weaver, but each loses 1 Focus.',
        effects: Object.freeze({ healAll: 14, focusAll: -1 }),
      }),
      Object.freeze({
        id: 'draw-taut',
        name: 'Draw the Thread Taut',
        summary: 'Gain +2 Attack for the rest of the run, but every living Weaver takes 8 HP.',
        effects: Object.freeze({ runAttackBonus: 2, damageAll: 8 }),
      }),
    ]),
  }),
  'echoing-loom': Object.freeze({
    id: 'echoing-loom',
    name: 'Echoing Loom',
    prompt: 'A broken loom repeats the party’s last motions. You can pull power from the echo or quiet it and recover.',
    choices: Object.freeze([
      Object.freeze({
        id: 'draw-the-echo',
        name: 'Draw the Echo',
        summary: 'Every living Weaver gains 2 Focus, but takes 6 HP from the strain.',
        effects: Object.freeze({ focusAll: 2, damageAll: 6 }),
      }),
      Object.freeze({
        id: 'quiet-the-loom',
        name: 'Quiet the Loom',
        summary: 'Restore 10 HP to every living Weaver, but each loses 1 Focus.',
        effects: Object.freeze({ healAll: 10, focusAll: -1 }),
      }),
    ]),
  }),
});

const SCHEDULES = Object.freeze({
  'frayed-hollow': Object.freeze({
    afterEncounterIndex: 1,
    eventIds: Object.freeze(['frayed-cache', 'echoing-loom']),
  }),
});

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value || '')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

export function snapshotRunEventSchedule(dungeonId, authoredSchedule = null) {
  if (authoredSchedule?.events?.length) {
    return {
      afterEncounterIndex: authoredSchedule.afterEncounterIndex,
      events: authoredSchedule.events.map((event) => structuredClone(event)),
    };
  }
  const schedule = SCHEDULES[dungeonId];
  if (!schedule) return null;
  return {
    afterEncounterIndex: schedule.afterEncounterIndex,
    events: schedule.eventIds.map((eventId) => structuredClone(RUN_EVENTS[eventId])).filter(Boolean),
  };
}

export function selectRunEvent(schedule, seed) {
  if (!schedule?.events?.length) return null;
  const index = stableHash(seed) % schedule.events.length;
  return structuredClone(schedule.events[index]);
}

export function runEventChoice(event, choiceId) {
  const choice = event?.choices?.find((candidate) => candidate.id === choiceId);
  if (!choice) throw new Error(`Unknown run event choice: ${choiceId}`);
  return structuredClone(choice);
}
