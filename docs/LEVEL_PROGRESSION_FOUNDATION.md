# Level progression foundation

Status: **M1-03 implementation complete on this branch; merge only after the full CI matrix is green.**

Threadbound now has one canonical cumulative XP model, a derived Level projection, migration-safe persistence, an authoritative Hunt XP source, and player-facing Hunt progression feedback.

## Canonical rule

- Level 1 begins at 0 XP.
- Level 2 begins at 50 XP.
- Each following level costs 50 XP more than the previous level: level 3 begins at 150 cumulative XP, level 4 at 300, and so on.
- `src/domain/LevelProgressionPolicy.js` is the single source for level thresholds and progress projection.
- Level is derived from cumulative XP rather than stored independently, avoiding two authoritative values that can drift apart.

## Persistence

`SQLitePlayerProgressionRepository` owns the additive `player_progression` table:

- one row per player;
- cumulative non-negative `experience` only;
- no independently persisted Level column;
- existing players with no progression row safely read as 0 XP / Level 1;
- XP increments use one SQLite UPSERT mutation.

This leaves the existing `players` table and older persisted users untouched while the new model proves itself.

## Authoritative Hunt rewards

Hunt is the first XP-producing activity for the new model. XP is part of the server-owned Hunt enemy definition and is granted only when the authoritative Hunt result is a victory:

- Frayed Mite: 10 XP;
- Hollow Crow: 15 XP;
- Thread Wolf: 20 XP.

`HuntService` persists the XP before projecting the final Level. A failed Hunt grants neither Gold nor XP. `HuntResolved` publishes both the per-Hunt XP gain and the resulting cumulative Level/XP progress so the stream does not need to reproduce progression math.

## Read models and presentation

`GameService.dashboard()` exposes on `character`:

- `experience` — canonical cumulative XP;
- `xp` — player-facing alias for the same cumulative value;
- `level` — derived from the domain policy;
- `levelProgression` — current-level start, next threshold, progress within the level, and XP remaining.

The Hunt receipt shows `+XP` next to Gold and HP. When the Hunt crosses a threshold, the same receipt adds a `LEVEL N!` chip. The browser only renders committed event metadata; it does not calculate Level.

A full app-like Profile rich card remains **M2-04**. M1-03 provides the authoritative dashboard/profile read model that card will consume instead of implementing the Phase 2 UI early.

## Verification contract

Automated coverage proves:

- an existing player without a progression row migrates to 0 XP safely;
- successful Hunts persist XP and can cross a Level threshold;
- failed Hunts do not grant XP;
- `HuntResolved` carries the authoritative XP/Level result;
- the dashboard projects the same persisted cumulative XP and derived Level;
- the mobile Playwright Hunt journey visibly renders XP while retaining the simple two-action chat surface.

## Compatibility

M1-03 does not change Gold storage aliases, equipment compatibility, Honey ownership, dungeon persistence, or legacy tactical-run support. It introduces no new headline currency and does not store Level independently.

## Handoff

After M1-03 is merged and post-merge `main` is green, the next canonical master-plan milestone is **M1-04: familiar equipment slots — Weapon, Helmet, Armor, Boots, Accessory**.
