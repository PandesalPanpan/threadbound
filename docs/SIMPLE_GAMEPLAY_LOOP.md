# Threadbound RPG progression loop

## Product loop

Threadbound's default loop stays inside the shared Adventure Stream:

```text
Hunt / Adventure / Quest / Town
  -> gain XP and Gold, find Area-appropriate Equipment
  -> level up and improve the five-slot loadout
  -> challenge the next shared progression Dungeon
  -> replay the committed battle, choose whether to Heal, then Continue
```

Progression rules remain server-owned. The React surface renders the committed
read models and battle replay; the Activity Stream and realtime messages remain
projections, not game state.

## Areas, Hunts, and Adventures

`AreaContentCatalog` is the authored Area source for Areas 1–4. Each Area has a
distinct Hunt and ordinary Adventure roster, enemy stats and skills, reward
values, item families, rarity weights, Town context, and (for Areas 1–3) the
challenge that unlocks the next Area. Hunt and Adventure select from the
player's persisted current Area; enemy strength does not scale from player
Level. Encounters retain their selected Area snapshot through resolution.

Progression order is Bellbloom Meadows → Emberglass Orchard → Kitewind Heights
→ The Mirrorfen. Three two-human progression challenges connect the first
three Areas. The party must be ready in the challenge's source Area, and the
server advances `highestUnlockedArea` monotonically after a clear. Area cards
show the player's current and unlocked frontier and the challenge required to
advance.

Hunts award the Area-authored Gold and XP and use its loot chance and rarity
profile. A victory may produce permanent Equipment with a slot-specific stat
profile and official semantic item art. A defeat does not grant victory
rewards. Hunt damage and the existing explicit recovery economy remain
authoritative.

## Equipment and Level growth

Equipment supports Weapon, Helmet, Armor, Boots, and Accessory. Generated
families and rarity are selected from the current Area profile; equipment
stats use Attack, Defense, Max HP, Speed, and Crit Chance in slot-appropriate
combinations. Inventory, Shop, loot receipts, Profile, Codex, Duel, and the
Dungeon replay resolve the persisted `visualAssetId` through the canonical
semantic visual-asset catalog, with compatibility mapping for older item
records.

Level remains derived from cumulative XP. `CharacterGrowthPolicy` grants +3
base Max HP per level. When XP crosses one or more levels, current HP rises by
that same increase, preserving damage taken instead of fully healing. Existing
XP is backfilled once through a persisted growth-level marker without
retroactive healing. Equipment Max HP remains additive to base Max HP.

Hunt, ordinary Adventure, and Quest claims are XP sources. Result receipts
show the XP and Gold deltas and, on a level-up, the Level transition and Max
HP gain from authoritative event data.

## Quests and Towns

Each Area has four constrained, authored Quest templates, with three useful
opportunities offered at a time. Templates refer to real local enemies, NPCs,
and progression challenges. Active Quest definitions are snapshotted in
SQLite, so offer rotation does not reset progress. Claimed work can rotate out
and become available again under a stable instance id rather than immediately
repeating the same name/objective. Quest progress advances only from
authoritative gameplay events. Claim is an atomic Gold + XP reward and creates
one concise receipt.

Bellbloom, Emberglass Waystation, Kitewatch, and Mirrorfen Waystation expose
service and background NPCs from the same Town card. NPC dialogue is selected
on the server from stable authored pools and safe current context such as
Area, frontier, or Quest history. NPC interaction publishes one shared
receipt; service NPC dialogue does not itself mutate Heal, Bank, Shop, Upgrade,
or Quest state.

## Automatic combat and Duels

Hunt, Adventure, Dungeon, and Duel use the same authoritative automatic
battle rules. Combatants have HP and Mana, and persisted skill codes are
interpreted by an allowlisted domain policy. Basic attacks build Mana; a
ready signature skill can apply its authored damage, healing, status, or
support effect. The server commits the replay, including Mana changes, skill
activation, and status effects. React shows those facts and animates the
replay; it does not calculate combat.

Duel uses the actual simulated battle replay, including both participants'
character art, equipment, HP, Mana, skills, and status effects. The final
record/result appears after playback completes, using the same shared battle
surface as other modes.

## Progression Dungeons and intermission decisions

Canonical progression challenges use Area-authored multi-enemy rooms. Enemies
within a room share the encounter window and take turns in the committed
server simulation. Ordinary authored rooms can contain multiple enemies;
boss encounters preserve their Area-specific boss identity and skill.

Dungeon commands remain one room resolution, one committed shared replay,
and one concise public result. While that replay is playing, the stream keeps
the battle surface visible and does not expose Dungeon Entry, Continue, Heal,
or later room outcomes. After playback reaches the result/intermission state,
the acting player can Continue, Heal, or Leave. Continuing does not restore
HP or Mana.

At each intermission, one party member may claim one bounded shared potion
Heal. A versioned server-side run transition records the claiming player and
intermission window; whichever valid request commits first owns that window.
Both participants see the same consumed state after realtime refresh or
reconnect, and the allowance resets on Continue. The Heal action is separate
from Continue and does not start the next encounter.

The old tactical `DungeonRun` and legacy route remain for persisted compatible
runs. Canonical progression dungeons use `SimpleDungeonService` and the
shared replay model rather than browser-owned rules.

## Verification notes

The focused domain and repository suites cover Area content and unlocks,
growth and old-save reconciliation, item mapping, constrained Quest
generation/rewards, NPC context, combat/Mana/skills, shared Dungeon
intermission ownership, replay persistence, and canonical route guards.
React Playwright covers the player journeys, realtime/reconnect state, and the
mobile and desktop stream surfaces. See the individual foundation documents
for the exact suites and current delivery status.
