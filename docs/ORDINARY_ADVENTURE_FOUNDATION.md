# Ordinary Adventure foundation

Status: M5-05's Area 1 ordinary Adventure foundation is complete on `main`. This branch locally extends ordinary Adventure content and rewards through Areas 1–4 and adds the Area 1→2→3→4 progression challenge chain. Those extensions remain unmerged and have no green `main` CI result; do not mark canonical checklist work merged or complete from this branch alone.

## Player contract

`adventure` and `/adventure` start one ordinary automatic battle from the Adventure Stream. The command does not open or revive the legacy tactical dashboard. One explicit Adventure produces one concise `AdventureResolved` stream receipt with Area, opponent, result, HP change, final HP, XP/Gold rewards on victory, an important loot drop when present, optional story-event text, level-up state, and the exact server-owned next-ready timestamp. Normal carried-Gold death loss remains visible on defeat.

Ordinary Adventure uses a 45-second base cooldown. A repeat attempt during that window fails with `adventure_cooldown`, remaining seconds, and the exact next-ready timestamp. The browser does not decide readiness.

## Authority and modular-monolith boundaries

- `AdventureEncounter` is the Domain Model/Policy boundary for ordinary Area encounter selection and automatic battle resolution.
- `AdventureRewardPolicy` owns Area reward values, constrained loot chance/rarity, story-event projection, and the canonical Adventure cooldown duration.
- `ActivityCooldownPolicy` remains the shared bounded modifier policy; Adventure does not invent browser-side cooldown arithmetic.
- `AutomaticBattleSimulator` remains the shared battle lifecycle; Adventure does not fork Attack/Defense/Crit/Speed/equipment-effect rules.
- `AdventureService` is the Service Layer boundary. It reads persisted Area/equipment state, claims the durable cooldown, coordinates combat, commits Gold/XP/loot/HP/death loss, and publishes one authoritative `AdventureResolved` fact.
- `SQLiteAdventureCooldownRepository`, `SQLiteAreaRepository`, `SQLiteEquipmentRepository`, `SQLitePlayerProgressionRepository`, `SQLiteBankRepository`, and the game repository remain persistence/transaction boundaries.
- `ActivityStreamService` is presentation projection only. It formats committed Adventure facts and never calculates rewards, combat, or cooldown legality.

## World/content scope

`AdventureService` reads the player's persisted current Area and selects a fixed
authored encounter from that Area's `adventureEncounters` pool. Encounters do
not scale with player level. `AdventureRewardPolicy` consumes that Area's
reward definition, while loot generation uses its item-family and rarity
profile. The generated rarity and complete slot-stat profile are preserved;
the reward path does not rewrite rarity after item generation.

The current feature-branch world defines three ordinary Adventure opponents
for each supported Area:

| Area | Name | Recommended Level | Victory Gold | Victory XP | Equipment-drop chance |
| --- | --- | ---: | ---: | ---: | ---: |
| 1 | Bellbloom Meadows | 1–6 | 6 | 30 | 50% |
| 2 | Emberglass Orchard | 7–12 | 18 | 62 | 56% |
| 3 | Kitewind Heights | 13–18 | 36 | 104 | 64% |
| 4 | The Mirrorfen | 19–24 | 68 | 172 | 72% |

Each Area has its own encounter pool, story observations, Town context, and
equipment material/rarity profile. The Area 1 pool includes the existing
`Thread Wolf`; Areas 2–4 use their own authored opponents. Unsupported Areas
fail closed rather than generating ad-hoc encounters.

### Separate co-op progression challenge chain

Progression challenges are authored separately from the single-fight ordinary
Adventure command. Each requires exactly two ready human participants and
clearing one unlocks the next Area for both participants:

- Area 1: Brightbell Parade Trial → Area 2
- Area 2: Emberglass Procession → Area 3
- Area 3: Kitewind Summit → Area 4

Area 4 is the final currently supported Area, so it has no onward unlock
challenge. Its ordinary Adventure pool and the regular Mirrorfen Descent
Dungeon remain available. Unlocking is server-owned, persisted, monotonic, and
idempotent; travel still validates against each player's unlocked frontier.

## Verification target and current evidence

`test/area-content-catalog.test.js` checks the four authored Adventure pools,
semantic encounter art, Area reward growth, improving rare-or-better odds, and
the two-human challenge chain. `test/ordinary-adventure.test.js` covers shared
automatic combat, the Area 1 Adventure reward/receipt path, and cooldown and
health rules. `test/progression-adventure.test.js` and
`test/progression-area-unlock.test.js` cover two-human challenge readiness and
participant unlock persistence/idempotency. The continuous mobile
`test/e2e/react-progression.local.spec.js` journey proves Area 1→2 travel,
Area 2 Town/Quest context, and a stronger Area 2 Hunt; it does not traverse the
ordinary Adventure loop across Areas 2–4. The A2/A3 challenge-chain service
test injects synthetic encounters and boosted stats, so it proves unlock
coordination rather than realistic challenge balance. A real-content balanced
run through those later gates remains an integration verification gap.

The presentation change is additive text inside the existing compact stream receipt rather than a new layout/card family; the established 390×844 mobile stream hierarchy remains the visual baseline.

## Delivery status

The Area 2–4 ordinary Adventure expansion and challenge chain are branch-local
work. Review and merge the feature, run the required gates, and confirm green
`main` CI before treating the increment as delivered or updating canonical
checklists.
