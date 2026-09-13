import { Quest } from '../domain/Quest.js';

export const QUEST_CATALOG = Object.freeze([
  new Quest({
    id: 'guild-field-check',
    title: 'Guild Field Check',
    description: 'Complete a Hunt to show the guild you are ready for work beyond Town.',
    areaNumber: 1,
    townId: 'area-1-town',
    objectives: [
      { id: 'complete-hunt', type: 'hunt', count: 1 },
    ],
  }),
]);
