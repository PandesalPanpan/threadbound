import { Town } from '../domain/Town.js';
import { resolveVisualAssetId } from './VisualAssetCatalog.js';

export const FOUNDATION_NPCS = Object.freeze([
  Object.freeze({ id: 'area-1-shopkeeper', name: 'Shopkeeper', role: 'Shop', service: 'shop', spriteVariant: 'female', visualAssetId: 'character.market-guard.v1', dialogue: 'Need supplies? I keep the essentials close and the prices clear.' }),
  Object.freeze({ id: 'area-1-blacksmith', name: 'Blacksmith', role: 'Upgrade', service: 'upgrade', spriteVariant: 'male', visualAssetId: 'character.mine-breaker.v1', dialogue: 'Bring me equipment worth keeping, and I will help you make it stronger.' }),
  Object.freeze({ id: 'area-1-banker', name: 'Banker', role: 'Bank', service: 'bank', spriteVariant: 'male', visualAssetId: 'character.noble-retainer.v1', dialogue: 'Gold in the Bank stays safe when an Adventure goes badly.' }),
  Object.freeze({ id: 'area-1-healer', name: 'Healer', role: 'Heal', service: 'heal', spriteVariant: 'female', visualAssetId: 'character.wayfarer-healer.v1', dialogue: 'Take care of your HP before you head back into danger.' }),
]);

export const FOUNDATION_TOWNS = Object.freeze([
  new Town({
    id: 'area-1-town',
    name: 'Area 1 Town',
    areaNumber: 1,
    services: ['shop', 'upgrade', 'bank', 'heal', 'guild_hall'],
    npcIds: FOUNDATION_NPCS.map((npc) => npc.id),
  }),
]);

const TOWNS_BY_ID = new Map(FOUNDATION_TOWNS.map((town) => [town.id, town]));
const NPCS_BY_ID = new Map(FOUNDATION_NPCS.map((npc) => [npc.id, npc]));

export function townById(townId) {
  return TOWNS_BY_ID.get(String(townId || '').trim().toLowerCase()) || null;
}

export function townsForArea(areaNumber) {
  const number = Number(areaNumber);
  if (!Number.isInteger(number) || number < 1) return Object.freeze([]);
  return Object.freeze(FOUNDATION_TOWNS.filter((town) => town.areaNumber === number));
}

export function npcById(npcId) {
  return NPCS_BY_ID.get(String(npcId || '').trim().toLowerCase()) || null;
}

export function projectTown(town) {
  if (!town) return null;
  return Object.freeze({
    ...town.toJSON(),
    npcs: Object.freeze(town.npcIds.map((npcId) => npcById(npcId)).filter(Boolean).map((npc) => ({
      ...npc,
      visualAssetId: resolveVisualAssetId(npc, 'character'),
    }))),
  });
}
