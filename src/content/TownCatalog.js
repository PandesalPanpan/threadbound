import { Town } from '../domain/Town.js';

export const FOUNDATION_TOWNS = Object.freeze([
  new Town({
    id: 'area-1-town',
    name: 'Area 1 Town',
    areaNumber: 1,
    services: ['shop', 'upgrade', 'bank', 'heal'],
    npcIds: [],
  }),
]);

const TOWNS_BY_ID = new Map(FOUNDATION_TOWNS.map((town) => [town.id, town]));

export function townById(townId) {
  return TOWNS_BY_ID.get(String(townId || '').trim().toLowerCase()) || null;
}

export function townsForArea(areaNumber) {
  const number = Number(areaNumber);
  if (!Number.isInteger(number) || number < 1) return Object.freeze([]);
  return Object.freeze(FOUNDATION_TOWNS.filter((town) => town.areaNumber === number));
}
