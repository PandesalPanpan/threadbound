import { Town } from '../domain/Town.js';
import { resolveVisualAssetId } from './VisualAssetCatalog.js';

export const FOUNDATION_NPCS = Object.freeze([
  Object.freeze({
    id: 'mae-bramble', name: 'Mae Bramble', role: 'Courier Guide', kind: 'background', service: 'quest', spriteVariant: 'female', visualAssetId: 'character.wayfarer-healer.v1',
    dialogue: 'The Brightbell Road is busier than the guild ledger says. Walk it with a companion when the bells begin to answer.',
    dialogueByContext: Object.freeze({
      welcome: Object.freeze(['The Brightbell Road is busier than the guild ledger says. Walk it with a companion when the bells begin to answer.', 'Welcome to Bellbloom. I keep the road notes; the guild keeps the spare supplies.']),
      frontier: Object.freeze(['A sharp note is carrying down from the orchard. Bring back what you learn before the next courier leaves.']),
      returning: Object.freeze(['You made it along the road and back. Tell me which flowers rang out of turn.']),
      'quest-active': Object.freeze(['Your road report is still open. Bring it home so the next courier leaves with current news.']),
      'quest-completed': Object.freeze(['The guild has your report. The next courier will know which road signs to trust.']),
    }),
  }),
  Object.freeze({
    id: 'area-1-shopkeeper', name: 'Shopkeeper', role: 'Shop', kind: 'service', service: 'shop', spriteVariant: 'female', visualAssetId: 'character.market-guard.v1',
    dialogue: 'Need supplies? I keep the essentials close and the prices clear.',
    dialogueByContext: Object.freeze({
      welcome: Object.freeze(['Need supplies? I keep the essentials close and the prices clear.', 'Welcome to Bellbloom. Courier kits are ready before you follow the ringing flowers.']),
      frontier: Object.freeze(['The road uphill is restless. Pack what you need before the next bell rings.']),
      returning: Object.freeze(['You made it back from the road. Restock before you set out again.']),
    }),
  }),
  Object.freeze({
    id: 'area-1-blacksmith', name: 'Blacksmith', role: 'Upgrade', kind: 'service', service: 'upgrade', spriteVariant: 'male', visualAssetId: 'character.mine-breaker.v1',
    dialogue: 'Bring me equipment worth keeping, and I will help you make it stronger.',
    dialogueByContext: Object.freeze({
      welcome: Object.freeze(['Bring me equipment worth keeping, and I will help you make it stronger.', 'The old courier blades are simple, but good steel holds its edge on the Brightbell Road.']),
      frontier: Object.freeze(['Warmglass makes a fine lantern shell. It is harmless to carry, but the hornets dislike the light.']),
      returning: Object.freeze(['Good to see you in one piece. I can reinforce the gear that got you home.']),
    }),
  }),
  Object.freeze({
    id: 'area-1-banker', name: 'Banker', role: 'Bank', kind: 'service', service: 'bank', spriteVariant: 'male', visualAssetId: 'character.noble-retainer.v1',
    dialogue: 'Gold in the Bank stays safe when an Adventure goes badly.',
    dialogueByContext: Object.freeze({
      welcome: Object.freeze(['Gold in the Bank stays safe when an Adventure goes badly.', 'Bellbloom couriers keep their spare Gold here before taking the road.']),
      frontier: Object.freeze(['A longer road makes a safer reserve worth keeping.']),
      returning: Object.freeze(['Your carried Gold made it back. Store what you want kept safe.']),
    }),
  }),
  Object.freeze({
    id: 'area-1-healer', name: 'Healer', role: 'Heal', kind: 'service', service: 'heal', spriteVariant: 'female', visualAssetId: 'character.wayfarer-healer.v1',
    dialogue: 'Take care of your HP before you head back into danger.',
    dialogueByContext: Object.freeze({
      welcome: Object.freeze(['Take care of your HP before you head back into danger.', 'The festival road is safer with a companion, but both of you should be ready.']),
      frontier: Object.freeze(['The summit signal has been keeping creatures on edge. Do not ignore a bad wound.']),
      returning: Object.freeze(['You are home again. Let me tend the damage before you head out.']),
    }),
  }),
]);

const NPC_RECORDS = Object.freeze([
  ...FOUNDATION_NPCS,
  Object.freeze({
    id: 'area-2-shopkeeper', name: 'Tavi Emberglass', role: 'Shop', kind: 'service', service: 'shop', spriteVariant: 'female', visualAssetId: 'character.market-guard.v1',
    dialogue: 'The lantern shells are cool enough to carry. The fruit peels are for tea.',
    dialogueByContext: Object.freeze({
      frontier: Object.freeze(['The lantern shells are cool enough to carry. The fruit peels are for tea.', 'The workers need the orchard road open before the evening carts arrive.']),
      returning: Object.freeze(['Back from the orchard? Check your lantern before the next walk.']),
    }),
  }),
  Object.freeze({
    id: 'area-2-blacksmith', name: 'Milla Warmglass', role: 'Upgrade', kind: 'service', service: 'upgrade', spriteVariant: 'female', visualAssetId: 'character.mine-breaker.v1',
    dialogue: 'Warmglass makes a bright fitting. I can keep the rest of your gear road-ready.',
  }),
  Object.freeze({
    id: 'area-2-guide', name: 'Orin Copperspoon', role: 'Quest Guide', kind: 'background', service: 'quest', spriteVariant: 'male', visualAssetId: 'character.road-sellsword.v1',
    dialogue: 'A festival road is still a road. We need someone to walk it and bring back a report.',
    dialogueByContext: Object.freeze({
      frontier: Object.freeze(['A festival road is still a road. We need someone to walk it and bring back a report.', 'The same sharp signal follows the orchard path, even when the sky is clear.']),
      returning: Object.freeze(['You found the source of the noise? The workers will want the short version first.']),
    }),
  }),
  Object.freeze({
    id: 'area-2-healer', name: 'Fen Willow', role: 'Heal', kind: 'service', service: 'heal', spriteVariant: 'female', visualAssetId: 'character.wayfarer-healer.v1',
    dialogue: 'Take a moment before the procession. The orchard does not need another injured escort.',
  }),
  Object.freeze({
    id: 'sera-kite', name: 'Sera Kite', role: 'Quest Guide', kind: 'background', service: 'quest', spriteVariant: 'female', visualAssetId: 'character.wayfarer-healer.v1',
    dialogue: 'Kitewatch keeps one signal flying for every traveler still on the road.',
    dialogueByContext: Object.freeze({
      frontier: Object.freeze(['Kitewatch keeps one signal flying for every traveler still on the road.', 'The old summit bell should answer from the second plate. Now it only repeats the storm.']),
      returning: Object.freeze(['The last kite stayed up until you returned. Tell me what the summit bell answered.']),
    }),
  }),
  Object.freeze({
    id: 'rook-gale', name: 'Rook Gale', role: 'Signal Keeper', kind: 'background', service: null, spriteVariant: 'male', visualAssetId: 'character.road-sellsword.v1',
    dialogue: 'The oldest ledger says the summit bell was built as a duet.',
    dialogueByContext: Object.freeze({
      frontier: Object.freeze(['The oldest ledger says the summit bell was built as a duet.', 'Two tuned plates, one call and one answer. The second has been silent for years.']),
      returning: Object.freeze(['A clean two-note signal means every traveler can hear the road home.']),
    }),
  }),
  Object.freeze({
    id: 'area-3-shopkeeper', name: 'Venn Cloudstep', role: 'Shop', kind: 'service', service: 'shop', spriteVariant: 'male', visualAssetId: 'character.market-guard.v1',
    dialogue: 'Kitecloth, cord, and warm tea for the climb. The signalers keep their shop open late.',
  }),
  Object.freeze({
    id: 'area-3-blacksmith', name: 'Tess Brightsmith', role: 'Upgrade', kind: 'service', service: 'upgrade', spriteVariant: 'female', visualAssetId: 'character.mine-breaker.v1',
    dialogue: 'Summit gear needs a good fastening. Bring yours back after the climb.',
  }),
  Object.freeze({
    id: 'area-3-healer', name: 'Mara Cloudrest', role: 'Heal', kind: 'service', service: 'heal', spriteVariant: 'female', visualAssetId: 'character.wayfarer-healer.v1',
    dialogue: 'Rest here before the summit. The next stretch is easier with another Weaver beside you.',
  }),
  Object.freeze({
    id: 'mirrorfen-guide', name: 'Edda Glassline', role: 'Mirrorfen Scout', kind: 'background', service: 'quest', spriteVariant: 'female', visualAssetId: 'character.wayfarer-healer.v1',
    dialogue: 'The marked are never left to answer alone. Keep your companion within reach.',
    dialogueByContext: Object.freeze({
      frontier: Object.freeze(['The marked are never left to answer alone. Keep your companion within reach.', 'Some reflections follow the wounded. Watch whom the next strike chooses.']),
      returning: Object.freeze(['You found a way through the reflections. Tell me which crossing stayed solid.']),
    }),
  }),
  Object.freeze({
    id: 'area-4-shopkeeper', name: 'Orren Shard', role: 'Shop', kind: 'service', service: 'shop', spriteVariant: 'male', visualAssetId: 'character.market-guard.v1',
    dialogue: 'I keep dry wraps and lantern oil ready for the Mirrorfen crossing.',
  }),
  Object.freeze({
    id: 'area-4-blacksmith', name: 'Sable Stitch', role: 'Upgrade', kind: 'service', service: 'upgrade', spriteVariant: 'female', visualAssetId: 'character.mine-breaker.v1',
    dialogue: 'Glass cuts thread as easily as cloth. I can secure the seams in your gear.',
  }),
  Object.freeze({
    id: 'area-4-healer', name: 'Lio Reed', role: 'Heal', kind: 'service', service: 'heal', spriteVariant: 'male', visualAssetId: 'character.wayfarer-healer.v1',
    dialogue: 'The fen makes a copy of every limp and bruise. Let me tend the real one first.',
  }),
]);

function makeTown({ id, name, areaNumber, services, npcIds }) {
  return new Town({ id, name, areaNumber, services, npcIds });
}

export const FOUNDATION_TOWNS = Object.freeze([
  makeTown({
    id: 'area-1-town', name: 'Bellbloom', areaNumber: 1,
    services: ['shop', 'upgrade', 'bank', 'heal', 'guild_hall'],
    npcIds: FOUNDATION_NPCS.map((npc) => npc.id),
  }),
]);

export const AREA_TOWNS = Object.freeze([
  makeTown({
    id: 'area-2-town', name: 'Emberglass Waystation', areaNumber: 2,
    services: ['shop', 'upgrade', 'heal', 'quest'],
    npcIds: ['area-2-shopkeeper', 'area-2-blacksmith', 'area-2-guide', 'area-2-healer'],
  }),
  makeTown({
    id: 'area-3-town', name: 'Kitewatch', areaNumber: 3,
    services: ['shop', 'upgrade', 'heal', 'quest'],
    npcIds: ['sera-kite', 'rook-gale', 'area-3-shopkeeper', 'area-3-blacksmith', 'area-3-healer'],
  }),
  makeTown({
    id: 'area-4-town', name: 'Mirrorfen Waystation', areaNumber: 4,
    services: ['shop', 'upgrade', 'heal', 'quest'],
    npcIds: ['mirrorfen-guide', 'area-4-shopkeeper', 'area-4-blacksmith', 'area-4-healer'],
  }),
]);

export const TOWN_CATALOG = Object.freeze([...FOUNDATION_TOWNS, ...AREA_TOWNS]);
export const WORLD_NPCS = NPC_RECORDS;

const TOWNS_BY_ID = new Map(TOWN_CATALOG.map((town) => [town.id, town]));
const NPCS_BY_ID = new Map(NPC_RECORDS.map((npc) => [npc.id, npc]));

export function townById(townId) {
  return TOWNS_BY_ID.get(String(townId || '').trim().toLowerCase()) || null;
}

export function townsForArea(areaNumber) {
  const number = Number(areaNumber);
  if (!Number.isInteger(number) || number < 1) return Object.freeze([]);
  return Object.freeze(TOWN_CATALOG.filter((town) => town.areaNumber === number));
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
