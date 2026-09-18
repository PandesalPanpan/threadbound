const FIGMA_FILE_KEY = 'xfAbc94dv0LxhxhC9q9BhK';
const SOURCE_COLLECTION = 'figma-character-library-v1';

const BOARD_DEFINITIONS = Object.freeze({
  XIII: { boardCategory: 'humanoid', allowedKinds: ['character', 'mob'] },
  XIV: { boardCategory: 'humanoid', allowedKinds: ['character', 'mob'] },
  XV: { boardCategory: 'humanoid', allowedKinds: ['character', 'mob'] },
  XVI: { boardCategory: 'humanoid', allowedKinds: ['character', 'mob'] },
  XVII: { boardCategory: 'humanoid', allowedKinds: ['character', 'mob'] },
  XVIII: { boardCategory: 'humanoid', allowedKinds: ['character', 'mob'] },
  XIX: { boardCategory: 'humanoid', allowedKinds: ['character', 'mob'] },
  XX: { boardCategory: 'common-mob', allowedKinds: ['mob'] },
  XXI: { boardCategory: 'common-mob', allowedKinds: ['mob'] },
  XXII: { boardCategory: 'common-mob', allowedKinds: ['mob'] },
  XXIII: { boardCategory: 'common-mob', allowedKinds: ['mob'] },
  XXIV: { boardCategory: 'common-mob', allowedKinds: ['mob'] },
  XXV: { boardCategory: 'common-mob', allowedKinds: ['mob'] },
  XXVI: { boardCategory: 'common-mob', allowedKinds: ['mob'] },
  XXVII: { boardCategory: 'common-mob', allowedKinds: ['mob'] },
  XXVIII: { boardCategory: 'elite', allowedKinds: ['mob', 'boss'] },
  XXIX: { boardCategory: 'elite', allowedKinds: ['mob', 'boss'] },
});

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function source([board, sourceNodeId, name, role, family, tags = []]) {
  const definition = BOARD_DEFINITIONS[board];
  if (!definition) throw new Error(`Unknown Figma character-library board: ${board}`);
  return Object.freeze({
    board,
    boardCategory: definition.boardCategory,
    allowedKinds: Object.freeze([...definition.allowedKinds]),
    sourceNodeId,
    sourceName: name,
    sourceFilename: `${slug(name)}.svg`,
    label: name,
    role,
    family,
    tags: Object.freeze([...new Set([definition.boardCategory, family, ...tags])]),
    sourceCollection: SOURCE_COLLECTION,
    sourceFigmaFileKey: FIGMA_FILE_KEY,
  });
}

// These are the 100 non-reserved character source frames from boards XIII–XXIX
// in the approved Threadbound Figma library. The board role is deliberately kept
// beside the stable node ID so the generator can produce a reviewable catalog
// without teaching the domain or browser code anything about Figma geometry.
export const FIGMA_CHARACTER_LIBRARY = Object.freeze([
  source(['XIII', '166:7', 'Road Sellsword', 'Wandering Blade', 'sellsword', ['melee', 'traveler']]),
  source(['XIII', '166:21', 'Farm Defender', 'Pitchfork Guard', 'guard', ['melee', 'town']]),
  source(['XIII', '166:35', 'Town Watcher', 'Lantern Patrol', 'guard', ['patrol', 'town']]),
  source(['XIII', '166:48', 'Dock Bruiser', 'Harbor Enforcer', 'bruiser', ['melee', 'harbor']]),
  source(['XIII', '166:63', 'Stable Runner', 'Agile Youth', 'runner', ['agile', 'town']]),
  source(['XIII', '166:77', 'Market Guard', 'Shield Escort', 'guard', ['shield', 'town']]),

  source(['XIV', '166:172', 'Cutpurse Scout', 'Street Rogue', 'rogue', ['stealth', 'street']]),
  source(['XIV', '166:186', 'Ragged Thief', 'Quick Snatcher', 'rogue', ['stealth', 'street']]),
  source(['XIV', '166:200', 'Brush Raider', 'Ambush Fighter', 'raider', ['ambush', 'wilds']]),
  source(['XIV', '166:213', 'Hood Stalker', 'Knife Skirmisher', 'rogue', ['stealth', 'melee']]),
  source(['XIV', '166:228', 'Fence Runner', 'Smuggler Lookout', 'scout', ['stealth', 'smuggler']]),
  source(['XIV', '166:242', 'Night Mugger', 'Alley Predator', 'rogue', ['stealth', 'street']]),

  source(['XV', '166:321', 'Pike Recruit', 'Basic Spearman', 'spearman', ['melee', 'militia']]),
  source(['XV', '166:335', 'Wall Archer', 'Local Bowman', 'archer', ['ranged', 'militia']]),
  source(['XV', '166:349', 'Tower Guard', 'Defensive Sentinel', 'guard', ['defense', 'militia']]),
  source(['XV', '166:362', 'Barracks Trainee', 'New Frontliner', 'recruit', ['melee', 'militia']]),
  source(['XV', '166:377', 'Banner Guard', 'Rally Soldier', 'guard', ['rally', 'militia']]),
  source(['XV', '166:391', 'Crossroad Warden', 'Route Protector', 'warden', ['defense', 'road']]),

  source(['XVI', '166:469', 'Worn Pilgrim', 'Staff Traveler', 'pilgrim', ['traveler', 'staff']]),
  source(['XVI', '166:483', 'Trail Hunter', 'Forest Tracker', 'hunter', ['ranged', 'forest']]),
  source(['XVI', '166:497', 'Courier Lancer', 'Swift Messenger', 'courier', ['agile', 'road']]),
  source(['XVI', '166:510', 'Ruin Delver', 'Dungeon Explorer', 'delver', ['explorer', 'ruin']]),
  source(['XVI', '166:525', 'Camp Ranger', 'Outdoor Marksman', 'ranger', ['ranged', 'wilds']]),
  source(['XVI', '166:539', 'Wayfarer Healer', 'Travel Medic', 'healer', ['support', 'traveler']]),

  source(['XVII', '166:622', 'Apprentice Alchemist', 'Potion Caster', 'alchemist', ['arcane', 'support']]),
  source(['XVII', '166:636', 'Temple Acolyte', 'Light Disciple', 'acolyte', ['holy', 'support']]),
  source(['XVII', '166:650', 'Ash Reader', 'Fire Scholar', 'scholar', ['fire', 'arcane']]),
  source(['XVII', '166:663', 'Herb Mystic', 'Nature Support', 'mystic', ['nature', 'support']]),
  source(['XVII', '166:678', 'Rune Novice', 'Arcane Trainee', 'rune', ['arcane', 'ranged']]),
  source(['XVII', '166:692', 'Bell Seer', 'Omen Reader', 'seer', ['omen', 'arcane']]),

  source(['XVIII', '166:777', 'Chain Brawler', 'Brutal Pit Fighter', 'brawler', ['melee', 'arena']]),
  source(['XVIII', '166:791', 'Mine Breaker', 'Hammer Worker', 'breaker', ['melee', 'mine']]),
  source(['XVIII', '166:805', 'Dust Marauder', 'Desert Raider', 'marauder', ['raider', 'desert']]),
  source(['XVIII', '166:818', 'Bog Hunter', 'Marsh Pursuer', 'hunter', ['ranged', 'marsh']]),
  source(['XVIII', '166:833', 'Mask Cultist', 'Dark Follower', 'cultist', ['shadow', 'arcane']]),
  source(['XVIII', '166:847', 'Torch Zealot', 'Fire Fanatic', 'zealot', ['fire', 'melee']]),

  source(['XIX', '166:930', 'Noble Retainer', 'Court Blade', 'retainer', ['melee', 'court']]),
  source(['XIX', '166:944', 'Guild Recruit', 'Rookie Adventurer', 'adventurer', ['melee', 'guild']]),
  source(['XIX', '166:958', 'Tinker Courier', 'Gadget Carrier', 'tinker', ['utility', 'guild']]),
  source(['XIX', '166:971', 'Caravan Archer', 'Wagon Escort', 'archer', ['ranged', 'caravan']]),
  source(['XIX', '166:986', 'Ridge Spearman', 'Highland Fighter', 'spearman', ['melee', 'highland']]),
  source(['XIX', '166:1000', 'Shrine Keeper', 'Sacred Attendant', 'keeper', ['holy', 'support']]),

  source(['XX', '166:1082', 'Field Mouse', 'Tiny Pest', 'rodent', ['small', 'field']]),
  source(['XX', '166:1096', 'Cave Ratling', 'Burrow Vermin', 'rodent', ['small', 'cave']]),
  source(['XX', '166:1110', 'Scrap Roach', 'Junk Scuttler', 'insect', ['small', 'scrap']]),
  source(['XX', '166:1123', 'Marsh Hopper', 'Swamp Pest', 'amphibian', ['small', 'marsh']]),
  source(['XX', '166:1138', 'Briar Hare', 'Fast Wildling', 'beast', ['small', 'wilds']]),
  source(['XX', '166:1152', 'Mold Mite', 'Spore Pest', 'insect', ['small', 'fungus']]),

  source(['XXI', '166:1234', 'Ridge Wolf', 'Pack Hunter', 'canine', ['pack', 'highland']]),
  source(['XXI', '166:1248', 'Mud Hound', 'Bog Tracker', 'canine', ['pack', 'marsh']]),
  source(['XXI', '166:1262', 'Cinder Jackal', 'Heat Chaser', 'canine', ['pack', 'fire']]),
  source(['XXI', '166:1275', 'Gloom Coyote', 'Shadow Hunter', 'canine', ['pack', 'shadow']]),
  source(['XXI', '166:1290', 'Bramble Fox', 'Thorn Skirmisher', 'canine', ['agile', 'forest']]),
  source(['XXI', '166:1304', 'Feral Pup', 'Wild Biter', 'canine', ['small', 'wilds']]),

  source(['XXII', '166:1379', 'Marsh Blob', 'Mud Slime', 'slime', ['marsh', 'mud']]),
  source(['XXII', '166:1393', 'Sap Ooze', 'Sticky Slime', 'slime', ['forest', 'sticky']]),
  source(['XXII', '166:1407', 'Glow Jelly', 'Luminous Ooze', 'slime', ['glow', 'cave']]),
  source(['XXII', '166:1420', 'Tar Slug', 'Heavy Slime', 'slime', ['dark', 'sticky']]),
  source(['XXII', '166:1435', 'Frost Blob', 'Chilling Goo', 'slime', ['ice', 'chill']]),
  source(['XXII', '166:1449', 'Rot Pudding', 'Decay Ooze', 'slime', ['poison', 'decay']]),

  source(['XXIII', '166:1522', 'Pebble Beetle', 'Minor Armor Bug', 'beetle', ['small', 'armor']]),
  source(['XXIII', '166:1536', 'Needle Gnat', 'Swarm Pest', 'insect', ['small', 'swarm']]),
  source(['XXIII', '166:1550', 'Mud Tick', 'Clinging Parasite', 'parasite', ['small', 'marsh']]),
  source(['XXIII', '166:1563', 'Red Scarab', 'Fast Shellbug', 'beetle', ['agile', 'desert']]),
  source(['XXIII', '166:1578', 'Root Ant', 'Colony Forager', 'insect', ['small', 'forest']]),
  source(['XXIII', '166:1592', 'Glow Firefly', 'Distracting Flier', 'insect', ['glow', 'swarm']]),

  source(['XXIV', '166:1663', 'Grim Sparrow', 'Dark Bird', 'bird', ['small', 'shadow']]),
  source(['XXIV', '166:1677', 'Bog Gull', 'Marsh Flier', 'bird', ['marsh', 'flier']]),
  source(['XXIV', '166:1691', 'Ash Raven', 'Soot Wing', 'bird', ['fire', 'shadow']]),
  source(['XXIV', '166:1704', 'Needle Bat', 'Cave Flyer', 'bat', ['cave', 'flier']]),
  source(['XXIV', '166:1719', 'Dust Owl', 'Silent Hunter', 'bird', ['desert', 'stealth']]),
  source(['XXIV', '166:1733', 'Plague Finch', 'Sickly Bird', 'bird', ['poison', 'flier']]),

  source(['XXV', '166:1812', 'Fen Toad', 'Toxic Hopper', 'amphibian', ['poison', 'marsh']]),
  source(['XXV', '166:1826', 'Mud Newt', 'Swamp Crawler', 'amphibian', ['marsh', 'small']]),
  source(['XXV', '166:1840', 'Scale Lizard', 'Scrappy Reptile', 'reptile', ['melee', 'wilds']]),
  source(['XXV', '166:1853', 'Reed Snake', 'Marsh Serpent', 'reptile', ['poison', 'marsh']]),
  source(['XXV', '166:1868', 'Cave Skink', 'Fast Tunnel Lizard', 'reptile', ['agile', 'cave']]),
  source(['XXV', '166:1882', 'Pond Snapper', 'Small Biter', 'reptile', ['small', 'marsh']]),

  source(['XXVI', '166:1958', 'Spore Bud', 'Fungal Nuisance', 'fungus', ['small', 'poison']]),
  source(['XXVI', '166:1972', 'Thorn Sprout', 'Plant Skirmisher', 'plant', ['forest', 'melee']]),
  source(['XXVI', '166:1986', 'Moss Maw', 'Hungry Growth', 'plant', ['forest', 'bruiser']]),
  source(['XXVI', '166:1999', 'Root Creeper', 'Vine Hunter', 'plant', ['forest', 'control']]),
  source(['XXVI', '166:2014', 'Bloom Leech', 'Flower Parasite', 'plant', ['forest', 'parasite']]),
  source(['XXVI', '166:2028', 'Cap Shambler', 'Mushroom Walker', 'fungus', ['forest', 'slow']]),

  source(['XXVII', '166:2104', 'Loose Bones', 'Wandering Skeleton', 'undead', ['undead', 'melee']]),
  source(['XXVII', '166:2118', 'Grave Wisp', 'Wandering Spirit', 'spirit', ['undead', 'arcane']]),
  source(['XXVII', '166:2132', 'Dust Ghoul', 'Tomb Crawler', 'undead', ['undead', 'melee']]),
  source(['XXVII', '166:2145', 'Coffin Crow', 'Omen Flier', 'undead', ['undead', 'flier']]),
  source(['XXVII', '166:2160', 'Hex Skull', 'Floating Curse', 'undead', ['undead', 'arcane']]),
  source(['XXVII', '166:2174', 'Shade Drifter', 'Dim Haunter', 'spirit', ['shadow', 'undead']]),

  source(['XXVIII', '166:2251', 'Black Banner Captain', 'Veteran Commander', 'commander', ['elite', 'humanoid', 'melee']]),
  source(['XXVIII', '166:2265', 'Pit Champion', 'Arena Crusher', 'champion', ['elite', 'humanoid', 'melee']]),
  source(['XXVIII', '166:2279', 'Veil Executioner', 'Masked Slayer', 'executioner', ['elite', 'humanoid', 'stealth']]),
  source(['XXVIII', '166:2292', 'Ruin Magister', 'Arcane Elite', 'magister', ['elite', 'humanoid', 'arcane']]),
  source(['XXVIII', '166:2307', 'Thornback Alpha', 'Pack Leader Beast', 'beast', ['elite', 'beast', 'forest']]),
  source(['XXVIII', '166:2321', 'Grave Maw', 'Undead Devourer', 'undead', ['elite', 'undead', 'melee']]),

  source(['XXIX', '166:2406', 'Ashhorn Brute', 'Infernal Charger', 'beast', ['elite', 'beast', 'fire']]),
  source(['XXIX', '166:2420', 'Watcher Prime', 'Greater Eye Horror', 'horror', ['elite', 'aberration', 'arcane']]),
  source(['XXIX', '166:2434', 'Bog Titanling', 'Heavy Marsh Beast', 'beast', ['elite', 'beast', 'marsh']]),
  source(['XXIX', '166:2447', 'Iron Husk', 'Ancient Construct', 'construct', ['elite', 'construct', 'melee']]),
]);

export const FIGMA_CHARACTER_LIBRARY_SOURCE_COUNT = FIGMA_CHARACTER_LIBRARY.length;
export const FIGMA_CHARACTER_LIBRARY_SOURCE_COLLECTION = SOURCE_COLLECTION;
export const FIGMA_CHARACTER_LIBRARY_FILE_KEY = FIGMA_FILE_KEY;
