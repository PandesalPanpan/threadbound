import { generatedEquipmentOptions } from './GeneratedEquipmentCatalog.js';
import { AREA_ITEM_FAMILIES } from './AreaItemFamilyCatalog.js';

const SUPPORTED_AREAS = [
  {
    number: 1,
    id: 'area-1',
    name: 'Bellbloom Meadows',
    arcAreaId: 'bellbloom-meadows',
    arcId: 'brightbell-bloom',
    town: { id: 'area-1-town', name: 'Bellbloom' },
    recommendedLevel: { min: 1, max: 6 },
    loreTags: ['brightbell-bloom', 'guild-road', 'festival'],
    dungeonIds: ['brightbell-trial'],
    simpleRoomEnemyCounts: [2, 1],
    itemFamilies: AREA_ITEM_FAMILIES[1],
    rarityWeights: { common: 0.62, uncommon: 0.30, rare: 0.08, epic: 0, legendary: 0, mythic: 0 },
    huntEncounters: [
      { id: 'bouncebud-slime', name: 'Bouncebud Slime', hp: 13, attack: 3, defense: 0, speed: 10, critChance: 0, gold: 2, experience: 12, dropChance: 0.18, visualAssetId: 'mob.green-slime.v1', skillCode: 'thornwake' },
      { id: 'bellcap-mushroom', name: 'Bellcap Mushroom', hp: 15, attack: 4, defense: 1, speed: 9, critChance: 0.02, gold: 3, experience: 15, dropChance: 0.22, visualAssetId: 'mob.red-mushroom.v1', skillCode: 'mire-song' },
      { id: 'ribbon-boar', name: 'Ribbon Boar', hp: 18, attack: 5, defense: 1, speed: 12, critChance: 0.04, gold: 4, experience: 18, dropChance: 0.26, visualAssetId: 'mob.brown-boar.v1', skillCode: 'shield-break' },
    ],
    adventureEncounters: [
      { id: 'thread-wolf', name: 'Thread Wolf', hp: 24, attack: 7, defense: 1, speed: 11, critChance: 0.05, visualAssetId: 'mob.ridge-wolf.v1', skillCode: 'shadow-lunge' },
      { id: 'ribbon-boar', name: 'Ribbon Boar', hp: 22, attack: 6, defense: 2, speed: 12, critChance: 0.04, visualAssetId: 'mob.brown-boar.v1', skillCode: 'shield-break' },
      { id: 'meadow-breeze', name: 'Meadow Breeze', hp: 20, attack: 6, defense: 1, speed: 14, critChance: 0.03, visualAssetId: 'mob.wind-elemental.v1', skillCode: 'threadsong' },
    ],
    dungeonSkillCodes: {
      'bouncebud-slime': 'thornwake', 'ribbon-boar': 'shield-break', 'meadow-breeze': 'threadsong', 'parade-golem': 'ember-burst',
    },
    adventureRewards: { gold: 6, experience: 30, dropChance: 0.5, storyEventChance: 0.35, storyEvents: [{ id: 'area-trail-signs', text: 'You spot fresh trail signs from another adventurer.' }] },
    progressionChallenge: {
      id: 'meadow-bell-gate', dungeonId: 'brightbell-trial', name: 'Brightbell Parade Trial',
      unlocksAreaNumber: 2, requiredHumanPlayers: 2, recommendedLevel: { min: 5, max: 6 },
      bossAdds: [{ id: 'ribbon-boar', name: 'Ribbon Boar', hp: 16, retaliation: 4, speed: 12, defense: 2, visualAssetId: 'mob.brown-boar.v1', targetingProfile: 'hunter', skillCode: 'shield-break' }],
    },
  },
  {
    number: 2,
    id: 'area-2',
    name: 'Emberglass Orchard',
    arcAreaId: 'emberglass-orchard',
    arcId: 'brightbell-bloom',
    town: { id: 'area-2-town', name: 'Emberglass Waystation' },
    recommendedLevel: { min: 7, max: 12 },
    loreTags: ['brightbell-bloom', 'warmglass', 'orchard'],
    dungeonIds: ['emberglass-procession'],
    simpleRoomEnemyCounts: [2, 1, 1],
    itemFamilies: AREA_ITEM_FAMILIES[2],
    rarityWeights: { common: 0.40, uncommon: 0.36, rare: 0.20, epic: 0.04, legendary: 0, mythic: 0 },
    huntEncounters: [
      { id: 'emberwing-hornet', name: 'Emberwing Hornet', hp: 28, attack: 8, defense: 1, speed: 16, critChance: 0.08, gold: 9, experience: 40, dropChance: 0.28, visualAssetId: 'mob.giant-hornet.v1', skillCode: 'shadow-lunge' },
      { id: 'cinder-harpy', name: 'Cinder Harpy', hp: 32, attack: 9, defense: 2, speed: 13, critChance: 0.08, gold: 10, experience: 45, dropChance: 0.31, visualAssetId: 'mob.crimson-harpy.v1', skillCode: 'ember-burst' },
      { id: 'orchard-lancer', name: 'Orchard Lancer', hp: 37, attack: 9, defense: 3, speed: 11, critChance: 0.04, gold: 12, experience: 50, dropChance: 0.34, visualAssetId: 'mob.spear-lizardfolk.v1', skillCode: 'shield-break' },
    ],
    adventureEncounters: [
      { id: 'lantern-elemental', name: 'Lantern Elemental', hp: 39, attack: 10, defense: 3, speed: 12, critChance: 0.05, visualAssetId: 'mob.fire-elemental.v1', skillCode: 'ember-burst' },
      { id: 'cinder-harpy', name: 'Cinder Harpy', hp: 43, attack: 11, defense: 3, speed: 14, critChance: 0.08, visualAssetId: 'mob.crimson-harpy.v1', skillCode: 'ember-burst' },
      { id: 'orchard-lancer', name: 'Orchard Lancer', hp: 47, attack: 11, defense: 4, speed: 12, critChance: 0.04, visualAssetId: 'mob.spear-lizardfolk.v1', skillCode: 'shield-break' },
    ],
    dungeonSkillCodes: {
      'emberwing-hornet': 'shadow-lunge', 'cinder-harpy': 'ember-burst', 'orchard-lancer': 'shield-break', 'lantern-elemental': 'ember-burst', 'ashplume-matron': 'mire-song',
    },
    adventureRewards: { gold: 18, experience: 62, dropChance: 0.56, storyEventChance: 0.38, storyEvents: [{ id: 'warmglass-shells', text: 'Warmglass shells glimmer along the orchard path.' }] },
    progressionChallenge: {
      id: 'orchard-bell-gate', dungeonId: 'emberglass-procession', name: 'Emberglass Procession',
      unlocksAreaNumber: 3, requiredHumanPlayers: 2, recommendedLevel: { min: 11, max: 12 },
      bossAdds: [{ id: 'cinder-harpy', name: 'Cinder Harpy', hp: 26, retaliation: 5, speed: 14, defense: 3, visualAssetId: 'mob.crimson-harpy.v1', targetingProfile: 'random', skillCode: 'ember-burst' }],
    },
  },
  {
    number: 3,
    id: 'area-3',
    name: 'Kitewind Heights',
    arcAreaId: 'kitewind-heights',
    arcId: 'brightbell-bloom',
    town: { id: 'area-3-town', name: 'Kitewatch' },
    recommendedLevel: { min: 13, max: 18 },
    loreTags: ['brightbell-bloom', 'highland', 'summit-bell'],
    dungeonIds: ['kitewind-summit'],
    simpleRoomEnemyCounts: [2, 1, 1],
    itemFamilies: AREA_ITEM_FAMILIES[3],
    rarityWeights: { common: 0.22, uncommon: 0.33, rare: 0.34, epic: 0.10, legendary: 0.01, mythic: 0 },
    huntEncounters: [
      { id: 'gale-wolf', name: 'Gale Wolf', hp: 45, attack: 12, defense: 3, speed: 17, critChance: 0.1, gold: 22, experience: 78, dropChance: 0.42, visualAssetId: 'mob.dire-wolf.v1', skillCode: 'shadow-lunge' },
      { id: 'cloud-sentinel', name: 'Cloud Sentinel', hp: 55, attack: 13, defense: 5, speed: 9, critChance: 0.03, gold: 25, experience: 90, dropChance: 0.46, visualAssetId: 'mob.stone-sentinel.v1', skillCode: 'shield-break' },
      { id: 'starhorn-spirit', name: 'Starhorn Spirit', hp: 51, attack: 13, defense: 4, speed: 14, critChance: 0.06, gold: 24, experience: 86, dropChance: 0.45, visualAssetId: 'mob.antler-spirit.v1', skillCode: 'threadsong' },
    ],
    adventureEncounters: [
      { id: 'moon-lantern-wraith', name: 'Moon-Lantern Wraith', hp: 61, attack: 15, defense: 4, speed: 15, critChance: 0.08, visualAssetId: 'mob.lantern-wraith.v1', skillCode: 'mire-song' },
      { id: 'cloud-sentinel', name: 'Cloud Sentinel', hp: 66, attack: 15, defense: 6, speed: 10, critChance: 0.03, visualAssetId: 'mob.stone-sentinel.v1', skillCode: 'shield-break' },
      { id: 'starhorn-spirit', name: 'Starhorn Spirit', hp: 63, attack: 16, defense: 5, speed: 15, critChance: 0.08, visualAssetId: 'mob.antler-spirit.v1', skillCode: 'threadsong' },
    ],
    dungeonSkillCodes: {
      'gale-wolf': 'shadow-lunge', 'cloud-sentinel': 'shield-break', 'starhorn-spirit': 'threadsong', 'moon-lantern-wraith': 'mire-song', 'skybell-griffin': 'ember-burst',
    },
    adventureRewards: { gold: 36, experience: 104, dropChance: 0.64, storyEventChance: 0.42, storyEvents: [{ id: 'summit-bell-wind', text: 'A clear note from the summit bell carries over the ridge.' }] },
    progressionChallenge: {
      id: 'summit-bell-gate', dungeonId: 'kitewind-summit', name: 'Kitewind Summit',
      unlocksAreaNumber: 4, requiredHumanPlayers: 2, recommendedLevel: { min: 17, max: 18 },
      bossAdds: [{ id: 'moon-lantern-wraith', name: 'Moon-Lantern Wraith', hp: 34, retaliation: 6, speed: 15, defense: 4, visualAssetId: 'mob.lantern-wraith.v1', targetingProfile: 'hunter', skillCode: 'mire-song' }],
    },
  },
  {
    number: 4,
    id: 'area-4',
    name: 'The Mirrorfen',
    arcAreaId: 'mirrorfen',
    arcId: 'glasswake',
    town: { id: 'area-4-town', name: 'Mirrorfen Waystation' },
    recommendedLevel: { min: 19, max: 24 },
    loreTags: ['glasswake', 'mirrorfen', 'co-op', 'reflection'],
    dungeonIds: ['mirrorfen-descent'],
    itemFamilies: AREA_ITEM_FAMILIES[4],
    rarityWeights: { common: 0.08, uncommon: 0.24, rare: 0.40, epic: 0.23, legendary: 0.045, mythic: 0.005 },
    huntEncounters: [
      { id: 'glass-skulker', name: 'Glass Skulker', hp: 66, attack: 16, defense: 5, speed: 18, critChance: 0.12, gold: 44, experience: 138, dropChance: 0.54, visualAssetId: 'mob.frost-blob.v1', skillCode: 'shadow-lunge' },
      { id: 'stitch-leech', name: 'Stitch Leech', hp: 72, attack: 16, defense: 6, speed: 12, critChance: 0.06, gold: 47, experience: 146, dropChance: 0.58, visualAssetId: 'mob.bloom-leech.v1', skillCode: 'mire-song' },
      { id: 'mirror-warden', name: 'Mirror Warden', hp: 80, attack: 18, defense: 7, speed: 11, critChance: 0.05, gold: 52, experience: 158, dropChance: 0.62, visualAssetId: 'mob.iron-husk.v1', skillCode: 'shield-break' },
      { id: 'shard-choir', name: 'Shard Choir', hp: 74, attack: 17, defense: 6, speed: 15, critChance: 0.08, gold: 50, experience: 153, dropChance: 0.60, visualAssetId: 'mob.watcher-prime.v1', skillCode: 'threadsong' },
    ],
    adventureEncounters: [
      { id: 'mirror-warden', name: 'Mirror Warden', hp: 92, attack: 19, defense: 8, speed: 12, critChance: 0.06, visualAssetId: 'mob.iron-husk.v1', skillCode: 'shield-break' },
      { id: 'shard-choir', name: 'Shard Choir', hp: 86, attack: 19, defense: 7, speed: 16, critChance: 0.09, visualAssetId: 'mob.watcher-prime.v1', skillCode: 'threadsong' },
      { id: 'glass-skulker', name: 'Glass Skulker', hp: 89, attack: 20, defense: 6, speed: 18, critChance: 0.12, visualAssetId: 'mob.frost-blob.v1', skillCode: 'shadow-lunge' },
    ],
    dungeonSkillCodes: {
      'glass-skulker': 'shadow-lunge', 'stitch-leech': 'mire-song', 'mirror-warden': 'shield-break', 'shard-choir': 'threadsong', 'hollow-mirror': 'ember-burst',
    },
    adventureRewards: { gold: 68, experience: 172, dropChance: 0.72, storyEventChance: 0.45, storyEvents: [{ id: 'glasswake-oath', text: 'You find a fresh mark of the Glasswake Oath: the marked are never left alone.' }] },
    progressionChallenge: null,
  },
];

const SKILL_DEFINITIONS = Object.freeze({
  threadsong: Object.freeze({ id: 'threadsong', name: 'Threadsong', manaCost: 100, description: 'Strike one foe and steady an ally with Mana.' }),
  thornwake: Object.freeze({ id: 'thornwake', name: 'Thornwake', manaCost: 100, description: 'Strike and poison a foe.' }),
  'shield-break': Object.freeze({ id: 'shield-break', name: 'Shield Break', manaCost: 100, description: 'Crush a foe’s guard with a heavy strike.' }),
  'ember-burst': Object.freeze({ id: 'ember-burst', name: 'Ember Burst', manaCost: 100, description: 'Blast a foe and scorch the enemy line.' }),
  'mire-song': Object.freeze({ id: 'mire-song', name: 'Mire Song', manaCost: 100, description: 'Strike and poison a foe.' }),
  'shadow-lunge': Object.freeze({ id: 'shadow-lunge', name: 'Shadow Lunge', manaCost: 100, description: 'Lunge into a heavy single-target strike.' }),
});

function freezeTree(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeTree(child);
  return Object.freeze(value);
}

for (const area of SUPPORTED_AREAS) {
  if (area.huntEncounters.length < 2 || area.adventureEncounters.length < 2) {
    throw new Error(`Area ${area.number} requires distinct Hunt and Adventure encounter pools.`);
  }
  for (const encounter of [...area.huntEncounters, ...area.adventureEncounters]) {
    if (!SKILL_DEFINITIONS[encounter.skillCode]) throw new Error(`Unknown Area encounter skill code: ${encounter.skillCode}`);
  }
  freezeTree(area);
}

export const AREA_CONTENT = Object.freeze(SUPPORTED_AREAS);
export const AREA_CONTENT_BY_NUMBER = Object.freeze(Object.fromEntries(AREA_CONTENT.map((area) => [area.number, area])));
export const PROGRESSION_CHALLENGES = Object.freeze(AREA_CONTENT.map((area) => area.progressionChallenge).filter(Boolean));
export const AREA_SKILL_CODES = Object.freeze(Object.keys(SKILL_DEFINITIONS));

function normalizedAreaNumber(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return null;
  return number;
}

export function areaContentForNumber(value) {
  const number = normalizedAreaNumber(value);
  const area = number ? AREA_CONTENT_BY_NUMBER[number] : null;
  if (!area) {
    const error = new Error(`No world content is configured for Area ${number ?? String(value)}.`);
    error.code = 'area_content_unavailable';
    throw error;
  }
  return area;
}

function clampRoll(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(0.999999, numeric));
}

function pickFrom(pool, roll, areaNumber, activity) {
  if (!Array.isArray(pool) || pool.length === 0) {
    const error = new Error(`No ${activity} encounters are configured for Area ${areaNumber}.`);
    error.code = `${activity}_unavailable_in_area`;
    throw error;
  }
  return pool[Math.floor(clampRoll(roll) * pool.length)] || pool[0];
}

export function huntEncountersForArea(areaNumber) {
  return areaContentForNumber(areaNumber).huntEncounters;
}

export function adventureEncountersForArea(areaNumber) {
  return areaContentForNumber(areaNumber).adventureEncounters;
}

export function pickAreaHuntEncounter(areaNumber, roll = 0) {
  return pickFrom(huntEncountersForArea(areaNumber), roll, Number(areaNumber), 'hunt');
}

export function pickAreaAdventureEncounter(areaNumber, roll = 0) {
  return pickFrom(adventureEncountersForArea(areaNumber), roll, Number(areaNumber), 'adventure');
}

export function adventureRewardForArea(areaNumber) {
  return areaContentForNumber(areaNumber).adventureRewards;
}

export function itemRewardProfileForArea(areaNumber) {
  const area = areaContentForNumber(areaNumber);
  return Object.freeze({
    areaNumber: area.number,
    itemFamilies: area.itemFamilies,
    rarityWeights: area.rarityWeights,
    equipmentOptions: generatedEquipmentOptions({ itemFamilies: area.itemFamilies }),
  });
}

export function progressionChallengeForArea(areaNumber) {
  return areaContentForNumber(areaNumber).progressionChallenge;
}

export function progressionChallengeForDungeon(dungeonId) {
  const normalized = String(dungeonId || '').trim().toLowerCase();
  return PROGRESSION_CHALLENGES.find((challenge) => challenge.dungeonId === normalized) || null;
}

export function skillDefinitionForCode(skillCode) {
  return SKILL_DEFINITIONS[String(skillCode || '').trim().toLowerCase()] || null;
}

export function skillForEncounter(encounter) {
  return skillDefinitionForCode(encounter?.skillCode);
}

export function skillCodeForDungeonEnemy(areaNumber, enemyId) {
  const area = areaContentForNumber(areaNumber);
  return area.dungeonSkillCodes[String(enemyId || '').trim().toLowerCase()] || null;
}

export function areaContentForDungeon(dungeonId) {
  const normalized = String(dungeonId || '').trim().toLowerCase();
  return AREA_CONTENT.find((area) => area.dungeonIds.includes(normalized)) || null;
}
