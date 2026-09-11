# Threadbound simple gameplay loop

## Product decision

Threadbound's default player loop is intentionally small and chat-first:

```text
/hunt -> earn Thread Dust / find permanent gear -> equip or Temper gear
     -> /dungeon when your stats are ready -> /attack until clear or defeated
```

The goal is to keep the command vocabulary closer to a lightweight chat RPG. Depth comes from progression, loot, party composition, dungeon difficulty, and the evolving world rather than from showing a tactical action dashboard every turn.

## Hunt

`hunt` (or `/hunt`) resolves one random solo encounter in one command. It uses the player's permanent Attack and persistent out-of-combat Health. Stronger Attack needs fewer exchanges and therefore takes less damage.

Hunts award a small amount of Thread Dust and can drop permanent weapons. Hunt drops are capped at Rare so dungeon rewards and other progression sources can remain aspirational.

Hunt damage persists between encounters. Outside a dungeon, one HP regenerates per minute. New characters begin with one health potion, Hunts may find more, and `heal`/`potion` restores up to 12 HP. This health economy—not an arbitrary action cooldown—paces repeated Hunts.

Hunts do not create a persistent `DungeonRun`; `HuntService` is a separate application use case over the small `HuntEncounter` domain policy.

## Dungeons

New player-facing dungeons are created through `SimpleDungeonService` and `AdventureRun.startSimple`.

Simple dungeon rules currently:

- recommended Attack: 9+
- enemy HP: 2x the source dungeon definition
- enemy retaliation: 1.5x the source definition
- 20% max-HP recovery between cleared rooms
- Attack is the only combat command
- no Focus
- no Guard or Interrupt
- no combat skills
- no temporary run powers
- no random run-event buff choices

At the initial 6 Attack / 40 Health baseline, a solo Weaver can clear early Frayed Hollow rooms but cannot survive The First Needle. At 9 Attack, the same character can clear the current canonical dungeon. This creates a readable progression check: if the dungeon is too difficult, Hunt for gear, equip a stronger weapon, and return.

## Compatibility boundary

The old tactical `DungeonRun` mechanics and legacy start route remain temporarily available for persisted old runs and migration/regression work. They are no longer loaded as the default player-facing UI.

This follows a strangler-style migration rather than deleting the old aggregate in the same change that replaces the product loop. New runs opt into `simpleCombat`; old state hydrates without being silently rewritten.

## Stream presentation

Hunt and simple-dungeon results are projected into the same Adventure Stream as player chat. The stream remains a projection, not the source of truth.

A Hunt result intentionally reads like a compact ledger receipt:

```text
THREADBOUND
HUNT CLEARED  Thread Wolf
−8 HP   32/40 HP   +3 Dust
Bound Needle · +3 ATK
```

Dungeon combat uses similarly compact receipts and does not render Focus, tactical intent, run-power, or skill metadata for `simpleCombat` runs.

## Codex

The Codex documents both Hunt enemies and the hardened values actually used by new dungeons. This keeps the wiki from drifting back toward tactical-era numbers or mechanics that players can no longer use in the default loop.
