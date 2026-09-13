import { SimulatedAdventurer } from '../domain/SimulatedAdventurer.js';
import { experienceForLevel } from '../domain/LevelProgressionPolicy.js';
import { materializeValidatedSimulatedAdventurerEquipment } from '../domain/SimulatedAdventurerSafetyPolicy.js';

function emptyLoadout() {
  return { weapon: null, helmet: null, armor: null, boots: null, accessory: null };
}

function rivalLoadout() {
  const weapon = materializeValidatedSimulatedAdventurerEquipment({
    template: {
      id: 'foundation-veteran-blade',
      namePattern: 'Veteran Blade',
      slot: 'weapon',
      rarity: 'mythic',
      attackBonus: 7,
      stats: { attackBonus: 7, defenseBonus: 0, maxHpBonus: 0, speedBonus: 0, critChanceBonus: 0 },
      effects: ['none'],
      requiredLevel: 15,
      areaNumber: 5,
      visualAssetId: 'equipment.weapon.basic-sword',
    },
    itemId: 'guild-rook-veteran-blade',
    name: 'Veteran Blade',
  });
  const armor = materializeValidatedSimulatedAdventurerEquipment({
    template: {
      id: 'foundation-veteran-armor',
      namePattern: 'Veteran Armor',
      slot: 'armor',
      rarity: 'epic',
      attackBonus: 0,
      stats: { attackBonus: 0, defenseBonus: 5, maxHpBonus: 8, speedBonus: 0, critChanceBonus: 0 },
      effects: ['none'],
      requiredLevel: 12,
      areaNumber: 4,
      visualAssetId: null,
    },
    itemId: 'guild-rook-veteran-armor',
    name: 'Veteran Armor',
  });
  return { ...emptyLoadout(), weapon, armor };
}

function entry({ adventurer, strongRival = false, spriteVariant = 'male', note }) {
  return Object.freeze({
    adventurer: Object.freeze(adventurer),
    strongRival: Boolean(strongRival),
    spriteVariant: spriteVariant === 'female' ? 'female' : 'male',
    note: String(note || '').trim(),
  });
}

export const FOUNDATION_GUILD_HALL_ROSTERS = Object.freeze({
  'area-1-town': Object.freeze([
    entry({
      adventurer: new SimulatedAdventurer({
        id: 'guild-lio',
        name: 'Lio',
        experience: experienceForLevel(2),
        currentAreaNumber: 1,
        highestUnlockedAreaNumber: 1,
        huntCount: 9,
        adventureCount: 1,
        equipment: emptyLoadout(),
        personality: 'Friendly newcomer who still celebrates every useful drop.',
        activityProfile: 'casual',
      }),
      spriteVariant: 'male',
      note: 'New guild adventurer',
    }),
    entry({
      adventurer: new SimulatedAdventurer({
        id: 'guild-mira',
        name: 'Mira',
        experience: experienceForLevel(5),
        currentAreaNumber: 1,
        highestUnlockedAreaNumber: 2,
        huntCount: 42,
        adventureCount: 9,
        equipment: emptyLoadout(),
        achievements: ['first-hunt'],
        personality: 'Steady explorer who revisits older Areas to finish what she started.',
        activityProfile: 'steady',
      }),
      spriteVariant: 'female',
      note: 'Experienced guild regular',
    }),
    entry({
      adventurer: new SimulatedAdventurer({
        id: 'guild-rook',
        name: 'Rook',
        experience: experienceForLevel(15),
        currentAreaNumber: 1,
        highestUnlockedAreaNumber: 5,
        huntCount: 260,
        adventureCount: 72,
        equipment: rivalLoadout(),
        achievements: ['first-hunt', 'veteran-rival'],
        personality: 'A veteran rival who returns to the first Guild Hall between harder expeditions.',
        activityProfile: 'dedicated',
      }),
      strongRival: true,
      spriteVariant: 'male',
      note: 'Veteran rival',
    }),
  ]),
});

export function guildHallPopulationForTown(townId) {
  return FOUNDATION_GUILD_HALL_ROSTERS[String(townId || '').trim().toLowerCase()] || Object.freeze([]);
}
