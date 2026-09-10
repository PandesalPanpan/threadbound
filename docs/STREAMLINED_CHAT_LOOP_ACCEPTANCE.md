# Streamlined Chat Loop Acceptance

## Goal

Threadbound's Play surface should feel like a shared RPG chat, not a combat dashboard. The chat history is the primary game surface; current-state controls are a compact private composer attached to the bottom of that thread.

## Scope

New dungeon runs use the streamlined loop:

1. Enter dungeon.
2. Fight normal encounters.
3. Move directly into the boss.
4. Resolve rewards and progression.

Temporary run-power drafts and random run-event choices are not part of new runs. Existing persisted runs that already contain those phases remain readable/resumable for compatibility.

## Acceptance gates

- **SC-01 — Chat-first space:** the Adventure Stream receives the clear majority of Play-page height on desktop and mobile.
- **SC-02 — Compact private controls:** the private player surface contains only current vitals, immediate combat actions, compact skills, and compact navigation.
- **SC-03 — No duplicated forecast cards:** projected damage may appear on action preview/focus, but the same forecast must not be repeated in multiple stacked panels.
- **SC-04 — No current-run-build panel:** temporary build/archetype/power summaries are not shown on the streamlined Play surface.
- **SC-05 — No temporary run powers for new runs:** after the final normal encounter, the aggregate moves directly to the boss without applying Sharpen/Reinforce/Riposte/Disrupt or any generated run power.
- **SC-06 — No random run-event interruption for new runs:** normal encounter progression cannot pause on a run discovery/event choice.
- **SC-07 — Durable chat truth:** combat and transition receipts remain append-only stream events; presentation code does not rewrite domain history.
- **SC-08 — Server authority:** combat legality, encounter transitions, damage, rewards, and persistence remain in the Domain Model/Application Service. Browser modules only compose the presentation.
- **SC-09 — Legacy safety:** persisted pre-streamlined runs may still finish their already-snapshotted upgrade/event phase without corrupting state.
- **SC-10 — Regression gate:** unit/contract tests and the complete Chromium E2E chain must be green before merge.

## Fowler-oriented boundaries

This simplification deliberately removes behavior instead of adding another parallel system.

- `DungeonRun` remains the combat **Domain Model** and continues to own combat invariants.
- `AdventureRun` remains the aggregate facade / application-facing lifecycle boundary. It adapts the mature combat transition so new runs move from the last normal encounter straight to the boss without a temporary power.
- Existing persisted run state is treated as a compatibility boundary rather than migrated destructively.
- `thread-first-ui.js` and the existing UX modules remain **Presentation Model** code. They may flatten/hide redundant views, but they do not calculate combat outcomes.
- Repositories, optimistic concurrency, idempotency, realtime delivery, rewards, and Threaded/Honey ownership are unchanged.

The design follows the Fowler principle of keeping domain rules in the domain and presentation decisions in presentation code while preferring the smallest refactor that removes accidental complexity.