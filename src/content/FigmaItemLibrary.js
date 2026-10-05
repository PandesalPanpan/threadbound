const FIGMA_FILE_KEY = 'xfAbc94dv0LxhxhC9q9BhK';
const SOURCE_COLLECTION = 'figma-item-library-v1';
const SECOND_VERSION_NAMES = new Set(["Gold Coin","Quest Scroll"]);

const SOURCE_ROWS = Object.freeze([
  [
    "208:10",
    "Weapon",
    "Ashbite Sword",
    "Blade"
  ],
  [
    "208:21",
    "Weapon",
    "Threadsteel Longsword",
    "Blade"
  ],
  [
    "208:32",
    "Weapon",
    "Ember Edge",
    "Blade"
  ],
  [
    "208:42",
    "Weapon",
    "Moonlit Saber",
    "Blade"
  ],
  [
    "208:53",
    "Weapon",
    "Bramble Falchion",
    "Blade"
  ],
  [
    "208:63",
    "Weapon",
    "Guildwatch Blade",
    "Blade"
  ],
  [
    "208:77",
    "Weapon",
    "Cinder Cleaver",
    "Blade"
  ],
  [
    "208:88",
    "Weapon",
    "Violet Needle",
    "Blade"
  ],
  [
    "208:98",
    "Weapon",
    "Dawn Rapier",
    "Blade"
  ],
  [
    "208:108",
    "Weapon",
    "Ironroot Greatsword",
    "Blade"
  ],
  [
    "208:121",
    "Weapon",
    "Hollow Fang",
    "Blade"
  ],
  [
    "208:131",
    "Weapon",
    "Glasswind Scimitar",
    "Blade"
  ],
  [
    "208:141",
    "Weapon",
    "Bronze Wardblade",
    "Blade"
  ],
  [
    "208:152",
    "Weapon",
    "Nightweave Dirk",
    "Blade"
  ],
  [
    "208:166",
    "Weapon",
    "Sunspoke Sword",
    "Blade"
  ],
  [
    "208:176",
    "Weapon",
    "Stormcurve Blade",
    "Blade"
  ],
  [
    "208:187",
    "Weapon",
    "Warden Shortsword",
    "Blade"
  ],
  [
    "208:197",
    "Weapon",
    "Runebreaker",
    "Blade"
  ],
  [
    "208:208",
    "Weapon",
    "Frostglass Dagger",
    "Blade"
  ],
  [
    "208:219",
    "Weapon",
    "Coilblade",
    "Blade"
  ],
  [
    "208:230",
    "Weapon",
    "Ashen Broadsword",
    "Blade"
  ],
  [
    "208:240",
    "Weapon",
    "Lantern Knife",
    "Blade"
  ],
  [
    "208:255",
    "Weapon",
    "Crownless Sword",
    "Blade"
  ],
  [
    "208:265",
    "Weapon",
    "Mirefang",
    "Blade"
  ],
  [
    "208:275",
    "Weapon",
    "Riftglass Saber",
    "Blade"
  ],
  [
    "208:286",
    "Weapon",
    "Threadpiercer",
    "Blade"
  ],
  [
    "208:297",
    "Weapon",
    "Honeyed Blade",
    "Blade"
  ],
  [
    "208:307",
    "Weapon",
    "Vaultbreaker",
    "Blade"
  ],
  [
    "208:318",
    "Weapon",
    "Duskwire Knife",
    "Blade"
  ],
  [
    "208:328",
    "Weapon",
    "Emberthorn",
    "Blade"
  ],
  [
    "208:343",
    "Weapon",
    "Copperleaf Sword",
    "Blade"
  ],
  [
    "208:354",
    "Weapon",
    "Gloam Razor",
    "Blade"
  ],
  [
    "208:364",
    "Weapon",
    "Skyshard Blade",
    "Blade"
  ],
  [
    "208:374",
    "Weapon",
    "Bonewhite Dagger",
    "Blade"
  ],
  [
    "208:386",
    "Weapon",
    "Starfall Greatblade",
    "Blade"
  ],
  [
    "208:396",
    "Weapon",
    "Gravehook Saber",
    "Blade"
  ],
  [
    "208:406",
    "Weapon",
    "Briar Knife",
    "Blade"
  ],
  [
    "208:417",
    "Weapon",
    "Prism Edge",
    "Blade"
  ],
  [
    "208:431",
    "Weapon",
    "Hearthsteel Sword",
    "Blade"
  ],
  [
    "208:441",
    "Weapon",
    "Wanderer’s Blade",
    "Blade"
  ],
  [
    "209:6",
    "Weapon",
    "Ashwood Axe",
    "Heavy"
  ],
  [
    "209:15",
    "Weapon",
    "Threadsteel Axe",
    "Heavy"
  ],
  [
    "209:23",
    "Weapon",
    "Ember Maul",
    "Heavy"
  ],
  [
    "209:31",
    "Weapon",
    "Violet Warhammer",
    "Heavy"
  ],
  [
    "209:40",
    "Weapon",
    "Guildbreaker Mace",
    "Heavy"
  ],
  [
    "209:48",
    "Weapon",
    "Ironroot Hammer",
    "Heavy"
  ],
  [
    "209:56",
    "Weapon",
    "Cinder Pike",
    "Heavy"
  ],
  [
    "209:65",
    "Weapon",
    "Moonspike Spear",
    "Heavy"
  ],
  [
    "209:73",
    "Weapon",
    "Briar Halberd",
    "Heavy"
  ],
  [
    "209:83",
    "Weapon",
    "Glasswind Glaive",
    "Heavy"
  ],
  [
    "209:93",
    "Weapon",
    "Copperhead Axe",
    "Heavy"
  ],
  [
    "209:101",
    "Weapon",
    "Hearth Maul",
    "Heavy"
  ],
  [
    "209:109",
    "Weapon",
    "Vault Mace",
    "Heavy"
  ],
  [
    "209:118",
    "Weapon",
    "Rainspike Spear",
    "Heavy"
  ],
  [
    "209:126",
    "Weapon",
    "Duskhook Halberd",
    "Heavy"
  ],
  [
    "209:134",
    "Weapon",
    "Starfall Hammer",
    "Heavy"
  ],
  [
    "209:143",
    "Weapon",
    "Honeycomb Mace",
    "Heavy"
  ],
  [
    "209:151",
    "Weapon",
    "Frostbranch Axe",
    "Heavy"
  ],
  [
    "209:159",
    "Weapon",
    "Gravewake Scythe",
    "Heavy"
  ],
  [
    "209:170",
    "Weapon",
    "Rift Pike",
    "Heavy"
  ],
  [
    "209:179",
    "Weapon",
    "Lantern Poleaxe",
    "Heavy"
  ],
  [
    "209:187",
    "Weapon",
    "Bonewheel Mace",
    "Heavy"
  ],
  [
    "209:196",
    "Weapon",
    "Sunforge Hammer",
    "Heavy"
  ],
  [
    "209:204",
    "Weapon",
    "Warden Spear",
    "Heavy"
  ],
  [
    "209:212",
    "Weapon",
    "Mirehook Glaive",
    "Heavy"
  ],
  [
    "209:221",
    "Weapon",
    "Prism Maul",
    "Heavy"
  ],
  [
    "209:229",
    "Weapon",
    "Nightbell Flail",
    "Heavy"
  ],
  [
    "209:237",
    "Weapon",
    "Crownsplitter Axe",
    "Heavy"
  ],
  [
    "209:246",
    "Weapon",
    "Threadhook Scythe",
    "Heavy"
  ],
  [
    "209:256",
    "Weapon",
    "Goldleaf Halberd",
    "Heavy"
  ],
  [
    "209:265",
    "Weapon",
    "Ashcoil Mace",
    "Heavy"
  ],
  [
    "209:274",
    "Weapon",
    "Stormstake Spear",
    "Heavy"
  ],
  [
    "209:282",
    "Weapon",
    "Bronzebloom Hammer",
    "Heavy"
  ],
  [
    "209:290",
    "Weapon",
    "Gloam Pike",
    "Heavy"
  ],
  [
    "209:299",
    "Weapon",
    "Ironvine Axe",
    "Heavy"
  ],
  [
    "209:307",
    "Weapon",
    "Emberbell Flail",
    "Heavy"
  ],
  [
    "209:315",
    "Weapon",
    "Skyroot Poleaxe",
    "Heavy"
  ],
  [
    "209:324",
    "Weapon",
    "Cinderwake Scythe",
    "Heavy"
  ],
  [
    "209:332",
    "Weapon",
    "Guildstone Maul",
    "Heavy"
  ],
  [
    "209:342",
    "Weapon",
    "Wanderer’s Spear",
    "Heavy"
  ],
  [
    "210:6",
    "Weapon",
    "Ashstring Bow",
    "RangedArcane"
  ],
  [
    "210:16",
    "Weapon",
    "Threadwind Bow",
    "RangedArcane"
  ],
  [
    "210:24",
    "Weapon",
    "Ember Crossbow",
    "RangedArcane"
  ],
  [
    "210:31",
    "Weapon",
    "Violet Repeater",
    "RangedArcane"
  ],
  [
    "210:38",
    "Weapon",
    "Guildwatch Longbow",
    "RangedArcane"
  ],
  [
    "210:47",
    "Weapon",
    "Ironroot Shortbow",
    "RangedArcane"
  ],
  [
    "210:54",
    "Weapon",
    "Cinder Javelin",
    "RangedArcane"
  ],
  [
    "210:62",
    "Weapon",
    "Moonshot Dart",
    "RangedArcane"
  ],
  [
    "210:68",
    "Weapon",
    "Briar Throwing Knife",
    "RangedArcane"
  ],
  [
    "210:78",
    "Weapon",
    "Glasswind Chakram",
    "RangedArcane"
  ],
  [
    "210:86",
    "Weapon",
    "Copper Sparkstaff",
    "RangedArcane"
  ],
  [
    "210:94",
    "Weapon",
    "Hearth Wand",
    "RangedArcane"
  ],
  [
    "210:102",
    "Weapon",
    "Vault Grimoire",
    "RangedArcane"
  ],
  [
    "210:111",
    "Weapon",
    "Rain Orb",
    "RangedArcane"
  ],
  [
    "210:118",
    "Weapon",
    "Dusklight Focus",
    "RangedArcane"
  ],
  [
    "210:125",
    "Weapon",
    "Starfall Staff",
    "RangedArcane"
  ],
  [
    "210:132",
    "Weapon",
    "Honey Rune Tome",
    "RangedArcane"
  ],
  [
    "210:142",
    "Weapon",
    "Frostbranch Wand",
    "RangedArcane"
  ],
  [
    "210:148",
    "Weapon",
    "Graveglass Orb",
    "RangedArcane"
  ],
  [
    "210:156",
    "Weapon",
    "Rift Scepter",
    "RangedArcane"
  ],
  [
    "210:164",
    "Weapon",
    "Lantern Arcbow",
    "RangedArcane"
  ],
  [
    "210:174",
    "Weapon",
    "Bonewire Crossbow",
    "RangedArcane"
  ],
  [
    "210:182",
    "Weapon",
    "Sunforge Hand Cannon",
    "RangedArcane"
  ],
  [
    "210:189",
    "Weapon",
    "Warden Longbow",
    "RangedArcane"
  ],
  [
    "210:196",
    "Weapon",
    "Mirethorn Darts",
    "RangedArcane"
  ],
  [
    "210:205",
    "Weapon",
    "Prism Staff",
    "RangedArcane"
  ],
  [
    "210:212",
    "Weapon",
    "Nightcoil Tome",
    "RangedArcane"
  ],
  [
    "210:220",
    "Weapon",
    "Crownless Wand",
    "RangedArcane"
  ],
  [
    "210:226",
    "Weapon",
    "Threadcaster Orb",
    "RangedArcane"
  ],
  [
    "210:236",
    "Weapon",
    "Goldleaf Focus",
    "RangedArcane"
  ],
  [
    "210:244",
    "Weapon",
    "Ashen Sling",
    "RangedArcane"
  ],
  [
    "210:252",
    "Weapon",
    "Stormglass Bow",
    "RangedArcane"
  ],
  [
    "210:260",
    "Weapon",
    "Bronze Repeater",
    "RangedArcane"
  ],
  [
    "210:269",
    "Weapon",
    "Gloam Staff",
    "RangedArcane"
  ],
  [
    "210:276",
    "Weapon",
    "Ironvine Tome",
    "RangedArcane"
  ],
  [
    "210:283",
    "Weapon",
    "Embercoil Wand",
    "RangedArcane"
  ],
  [
    "210:290",
    "Weapon",
    "Skyshard Orb",
    "RangedArcane"
  ],
  [
    "210:300",
    "Weapon",
    "Cinder Quiver",
    "RangedArcane"
  ],
  [
    "210:306",
    "Weapon",
    "Guildspark Cannon",
    "RangedArcane"
  ],
  [
    "210:314",
    "Weapon",
    "Wanderer’s Focus",
    "RangedArcane"
  ],
  [
    "211:6",
    "Gear",
    "Ashguard Shield",
    null
  ],
  [
    "211:12",
    "Gear",
    "Threadsteel Buckler",
    null
  ],
  [
    "211:21",
    "Gear",
    "Ember Helm",
    null
  ],
  [
    "211:27",
    "Gear",
    "Violet Visor",
    null
  ],
  [
    "211:33",
    "Gear",
    "Guildplate Coat",
    null
  ],
  [
    "211:41",
    "Gear",
    "Ironroot Cuirass",
    null
  ],
  [
    "211:47",
    "Gear",
    "Cinder Boots",
    null
  ],
  [
    "211:53",
    "Gear",
    "Moonstep Greaves",
    null
  ],
  [
    "211:61",
    "Gear",
    "Briar Gauntlets",
    null
  ],
  [
    "211:68",
    "Gear",
    "Glasswind Gloves",
    null
  ],
  [
    "211:76",
    "Gear",
    "Copperloop Ring",
    null
  ],
  [
    "211:84",
    "Gear",
    "Hearthstone Band",
    null
  ],
  [
    "211:91",
    "Gear",
    "Vault Amulet",
    null
  ],
  [
    "211:97",
    "Gear",
    "Rainthread Pendant",
    null
  ],
  [
    "211:105",
    "Gear",
    "Dusk Mantle",
    null
  ],
  [
    "211:111",
    "Gear",
    "Starfall Cloak",
    null
  ],
  [
    "211:117",
    "Gear",
    "Honeycomb Belt",
    null
  ],
  [
    "211:125",
    "Gear",
    "Frostweave Sash",
    null
  ],
  [
    "211:131",
    "Gear",
    "Graveward Charm",
    null
  ],
  [
    "211:138",
    "Gear",
    "Rift Brooch",
    null
  ],
  [
    "211:148",
    "Gear",
    "Lantern Shield",
    null
  ],
  [
    "211:154",
    "Gear",
    "Bonecrest Helm",
    null
  ],
  [
    "211:161",
    "Gear",
    "Sunforge Plate",
    null
  ],
  [
    "211:169",
    "Gear",
    "Warden Boots",
    null
  ],
  [
    "211:175",
    "Gear",
    "Mirehide Gloves",
    null
  ],
  [
    "211:181",
    "Gear",
    "Prism Ring",
    null
  ],
  [
    "211:189",
    "Gear",
    "Nightcoil Amulet",
    null
  ],
  [
    "211:195",
    "Gear",
    "Crownless Cloak",
    null
  ],
  [
    "211:201",
    "Gear",
    "Threadbound Belt",
    null
  ],
  [
    "211:210",
    "Gear",
    "Goldleaf Charm",
    null
  ],
  [
    "211:218",
    "Gear",
    "Ashscale Shield",
    null
  ],
  [
    "211:224",
    "Gear",
    "Stormglass Helm",
    null
  ],
  [
    "211:233",
    "Gear",
    "Bronzeweave Coat",
    null
  ],
  [
    "211:239",
    "Gear",
    "Gloam Greaves",
    null
  ],
  [
    "211:245",
    "Gear",
    "Ironvine Gauntlets",
    null
  ],
  [
    "211:253",
    "Gear",
    "Emberstone Ring",
    null
  ],
  [
    "211:259",
    "Gear",
    "Skyshard Pendant",
    null
  ],
  [
    "211:265",
    "Gear",
    "Cinder Mantle",
    null
  ],
  [
    "211:273",
    "Gear",
    "Guildmark Belt",
    null
  ],
  [
    "211:280",
    "Gear",
    "Wanderer’s Brooch",
    null
  ],
  [
    "212:6",
    "Consumable",
    "Minor Healing Flask",
    null
  ],
  [
    "212:16",
    "Consumable",
    "Healing Flask",
    null
  ],
  [
    "212:24",
    "Consumable",
    "Greater Healing Flask",
    null
  ],
  [
    "212:32",
    "Consumable",
    "Major Healing Flask",
    null
  ],
  [
    "212:41",
    "Consumable",
    "Threadheart Elixir",
    null
  ],
  [
    "212:48",
    "Consumable",
    "Ember Tonic",
    null
  ],
  [
    "212:56",
    "Consumable",
    "Moonwater Draught",
    null
  ],
  [
    "212:66",
    "Consumable",
    "Briar Antidote",
    null
  ],
  [
    "212:74",
    "Consumable",
    "Glassskin Potion",
    null
  ],
  [
    "212:81",
    "Consumable",
    "Ironroot Brew",
    null
  ],
  [
    "212:92",
    "Consumable",
    "Mana Vial",
    null
  ],
  [
    "212:100",
    "Consumable",
    "Greater Mana Vial",
    null
  ],
  [
    "212:108",
    "Consumable",
    "Focus Tonic",
    null
  ],
  [
    "212:118",
    "Consumable",
    "Haste Draught",
    null
  ],
  [
    "212:125",
    "Consumable",
    "Stoneguard Brew",
    null
  ],
  [
    "212:132",
    "Consumable",
    "Flameward Elixir",
    null
  ],
  [
    "212:142",
    "Consumable",
    "Frostward Elixir",
    null
  ],
  [
    "212:150",
    "Consumable",
    "Shockward Elixir",
    null
  ],
  [
    "212:158",
    "Consumable",
    "Venom Ward Tonic",
    null
  ],
  [
    "212:167",
    "Consumable",
    "Luck Phial",
    null
  ],
  [
    "212:176",
    "Consumable",
    "Guild Ration",
    null
  ],
  [
    "212:184",
    "Consumable",
    "Honeybread",
    null
  ],
  [
    "212:194",
    "Consumable",
    "Ember Stew",
    null
  ],
  [
    "212:202",
    "Consumable",
    "Mirefruit Bowl",
    null
  ],
  [
    "212:209",
    "Consumable",
    "Starleaf Tea",
    null
  ],
  [
    "212:218",
    "Consumable",
    "Frostberry Tart",
    null
  ],
  [
    "212:226",
    "Consumable",
    "Copper Jerky",
    null
  ],
  [
    "212:234",
    "Consumable",
    "Mooncake Ration",
    null
  ],
  [
    "212:244",
    "Consumable",
    "Briar Soup",
    null
  ],
  [
    "212:251",
    "Consumable",
    "Wanderer’s Meal",
    null
  ],
  [
    "212:260",
    "Consumable",
    "Cinder Bomb",
    null
  ],
  [
    "212:270",
    "Consumable",
    "Flash Flask",
    null
  ],
  [
    "212:278",
    "Consumable",
    "Smoke Jar",
    null
  ],
  [
    "212:286",
    "Consumable",
    "Thread Snare",
    null
  ],
  [
    "212:295",
    "Consumable",
    "Ward Scroll",
    null
  ],
  [
    "212:302",
    "Consumable",
    "Recall Scroll",
    null
  ],
  [
    "212:310",
    "Consumable",
    "Repair Kit",
    null
  ],
  [
    "212:320",
    "Consumable",
    "Mending Salve",
    null
  ],
  [
    "212:328",
    "Consumable",
    "Revival Charm",
    null
  ],
  [
    "212:335",
    "Consumable",
    "Dungeon Camp Kit",
    null
  ],
  [
    "213:6",
    "Utility",
    "Gold Coin",
    null
  ],
  [
    "213:13",
    "Utility",
    "Coin Stack",
    null
  ],
  [
    "213:20",
    "Utility",
    "Honey Point Crystal",
    null
  ],
  [
    "213:26",
    "Utility",
    "Thread Shard",
    null
  ],
  [
    "213:32",
    "Utility",
    "Ember Ore",
    null
  ],
  [
    "213:38",
    "Utility",
    "Moon Ore",
    null
  ],
  [
    "213:44",
    "Utility",
    "Ironroot Ore",
    null
  ],
  [
    "213:50",
    "Utility",
    "Violet Prism",
    null
  ],
  [
    "213:56",
    "Utility",
    "Star Shard",
    null
  ],
  [
    "213:62",
    "Utility",
    "Rift Crystal",
    null
  ],
  [
    "213:69",
    "Utility",
    "Briar Herb",
    null
  ],
  [
    "213:77",
    "Utility",
    "Moonleaf",
    null
  ],
  [
    "213:85",
    "Utility",
    "Cinder Bloom",
    null
  ],
  [
    "213:93",
    "Utility",
    "Frostleaf",
    null
  ],
  [
    "213:101",
    "Utility",
    "Frostcap Mushroom",
    null
  ],
  [
    "213:109",
    "Utility",
    "Warden Cloth",
    null
  ],
  [
    "213:115",
    "Utility",
    "Ash Leather",
    null
  ],
  [
    "213:121",
    "Utility",
    "Bone Fragment",
    null
  ],
  [
    "213:126",
    "Utility",
    "Monster Fang",
    null
  ],
  [
    "213:132",
    "Utility",
    "Boss Core",
    null
  ],
  [
    "213:139",
    "Utility",
    "Copper Key",
    null
  ],
  [
    "213:147",
    "Utility",
    "Silver Key",
    null
  ],
  [
    "213:155",
    "Utility",
    "Vault Key",
    null
  ],
  [
    "213:163",
    "Utility",
    "Dungeon Key",
    null
  ],
  [
    "213:171",
    "Utility",
    "Guild Seal",
    null
  ],
  [
    "213:178",
    "Utility",
    "Quest Scroll",
    null
  ],
  [
    "213:185",
    "Utility",
    "Treasure Map",
    null
  ],
  [
    "213:191",
    "Utility",
    "Rune Tablet",
    null
  ],
  [
    "213:197",
    "Utility",
    "Ancient Relic",
    null
  ],
  [
    "213:203",
    "Utility",
    "Threadbound Emblem",
    null
  ],
  [
    "213:210",
    "Utility",
    "Heart Icon",
    null
  ],
  [
    "213:215",
    "Utility",
    "Mana Drop",
    null
  ],
  [
    "213:221",
    "Utility",
    "Attack Icon",
    null
  ],
  [
    "213:228",
    "Utility",
    "Defense Icon",
    null
  ],
  [
    "213:234",
    "Utility",
    "Speed Icon",
    null
  ],
  [
    "213:240",
    "Utility",
    "Critical Icon",
    null
  ],
  [
    "213:245",
    "Utility",
    "Poison Icon",
    null
  ],
  [
    "213:253",
    "Utility",
    "Burn Icon",
    null
  ],
  [
    "213:259",
    "Utility",
    "Freeze Icon",
    null
  ],
  [
    "213:265",
    "Utility",
    "Party Link Icon",
    null
  ]
]);

function slug(value) {
  return String(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function equipmentSlot(category, label) {
  if (category === 'Weapon') return 'weapon';
  if (category !== 'Gear') return null;
  const name = label.toLowerCase();
  if (/\b(helm|visor)\b/.test(name)) return 'helmet';
  if (/\b(boots|greaves)\b/.test(name)) return 'boots';
  if (/\b(coat|cuirass|plate|cloak|mantle)\b/.test(name)) return 'armor';
  if (/\b(shield|buckler)\b/.test(name)) return null;
  return 'accessory';
}

function weaponFamily(label) {
  const name = label.toLowerCase();
  if (/\b(dagger|dirk|knife|needle)\b/.test(name)) return 'dagger';
  if (/\b(axe)\b/.test(name)) return 'axe';
  if (/\b(spear|pike|halberd|glaive|javelin|poleaxe|scythe)\b/.test(name)) return 'spear';
  if (/\b(maul|mace|hammer|flail|cleaver)\b/.test(name)) return 'axe';
  if (/\b(crossbow|repeater|cannon)\b/.test(name)) return 'crossbow';
  if (/\b(bow|sling|dart|chakram|quiver)\b/.test(name)) return 'bow';
  if (/\b(staff|wand|orb|focus|tome|grimoire|scepter)\b/.test(name)) return 'staff';
  return 'sword';
}

function weaponCombatProfile(label, family) {
  if (label === 'Copper Sparkstaff') return 'healer';
  if (family === 'bow' || family === 'crossbow') return 'ranged';
  if (family === 'staff') return 'mana-support';
  return 'frontline';
}

function itemFamily(category, label, slot, section) {
  const name = label.toLowerCase();
  if (category === 'Weapon') return weaponFamily(label);
  if (slot) return slot === 'accessory'
    ? name.match(/(ring|band|amulet|pendant|charm|brooch|belt|sash|gauntlet|glove)/)?.[0] || 'accessory'
    : slot;
  if (category === 'Consumable') {
    if (/health|healing|mending|revival|ration|meal|bread|stew|bowl|tea|tart|soup|jerky|salve/i.test(name)) return 'healing';
    if (/mana|focus/i.test(name)) return 'mana';
    if (/scroll|kit|bomb|flask|snare|smoke|repair|ward|antidote|tonic|elixir|draught|brew|phial/i.test(name)) return 'utility';
    return 'consumable';
  }
  if (category === 'Utility') {
    if (/icon|drop|party|heart|attack|defense|speed|critical|poison|burn|freeze/i.test(name)) return 'icon';
    if (/key/i.test(name)) return 'key';
    if (/ore|crystal|herb|leaf|mushroom|cloth|leather|fragment|fang|core/i.test(name)) return 'material';
    if (/coin|crystal$/i.test(name)) return 'currency';
    if (/scroll|map|tablet|relic|emblem|seal/i.test(name)) return 'quest';
  }
  return section ? slug(section) : slug(category);
}

function tagsFor(category, section, family, slot) {
  return Object.freeze([...new Set([
    'figma-item',
    slug(category),
    ...(section ? [slug(section)] : []),
    ...(family ? [family] : []),
    ...(slot ? [slot] : []),
  ])]);
}

export const FIGMA_ITEM_LIBRARY = Object.freeze(SOURCE_ROWS.map(([sourceNodeId, category, sourceName, section]) => {
  const nameSlug = slug(sourceName);
  const slot = equipmentSlot(category, sourceName);
  const family = itemFamily(category, sourceName, slot, section);
  return Object.freeze({
    sourceNodeId,
    sourceName,
    sourceFilename: `${nameSlug}.svg`,
    sourceCollection: SOURCE_COLLECTION,
    sourceFigmaFileKey: FIGMA_FILE_KEY,
    visualAssetId: `item.${nameSlug}.${SECOND_VERSION_NAMES.has(sourceName) ? 'v2' : 'v1'}`,
    label: sourceName,
    category,
    section,
    slot,
    family,
    ...(slot === 'weapon' ? { combatProfileCode: weaponCombatProfile(sourceName, family) } : {}),
    tags: tagsFor(category, section, family, slot),
  });
}));

export const FIGMA_EQUIPMENT_LIBRARY = Object.freeze(FIGMA_ITEM_LIBRARY.filter((item) => item.slot));
