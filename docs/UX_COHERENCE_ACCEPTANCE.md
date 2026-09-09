# UX Coherence Acceptance

This milestone makes the Adventure Stream truthful and understandable at the moment a player must decide. It intentionally does not move combat rules into the browser.

## Fowler-oriented boundaries

- **Domain Model / Aggregate:** `AdventureRun` and `DungeonRun` remain authoritative for run phase, HP, Focus, enemy state, legal commands, lethal ordering, critical hits, and run transitions.
- **Application Service / Read Model:** `/api/dashboard?previews=1` remains the authoritative projection for current player/run state and action previews. The browser does not reimplement combat formulas.
- **Presentation Model:** `public/ux-coherence.js` groups controls by mode, mirrors meta navigation away from the primary decision row, renders the current decision snapshot, and reuses the authoritative preview for persistent yellow forecast UI and current transition receipts.
- **Append-only activity stream:** durable stream events are not rewritten. Transition receipt additions are client-side presentation derived from the current authoritative read model.

## Acceptance gates

- [ ] **UXC-01 COMPLETE DECISION STATE:** During combat/boss, the primary surface shows the viewer's current HP and Focus, enemy HP, party vitals when applicable, and current intent when applicable.
- [ ] **UXC-02 POST-CHOICE STATE:** After a run upgrade or run discovery advances into the next encounter, the newest transition receipt shows the viewer's current HP and Focus before another action is taken.
- [ ] **UXC-03 PERSISTENT FORECAST:** Combat/boss has a stable, non-hover-only Attack preview showing projected damage and enemy HP before → after from `/api/dashboard?previews=1`.
- [ ] **UXC-04 FORECAST SEMANTICS:** Yellow is used for projected/future damage only; confirmed damage remains red. Forecast containers use a dark surface, bright yellow outline/text, and tabular numeric emphasis.
- [ ] **UXC-05 MODE SEPARATION:** Combat actions, Run Upgrade, and Run Discovery are presented as distinct primary modes. Combat actions are paused/absent during run decisions.
- [ ] **UXC-06 META SEPARATION:** Dungeons, Status, Gear, Party, Codex, World, and Honey are visually placed in a separate Navigation container rather than competing with Attack/Guard or run-choice cards.
- [ ] **UXC-07 NO RULE DUPLICATION:** No browser code contains an attack, crit, retaliation, HP, or Focus formula. It only renders server projections.
- [ ] **UXC-08 MOBILE READABILITY:** The decision snapshot collapses to one column and upgrade choices remain readable on a 390×844 viewport without horizontal overflow.
- [ ] **UXC-09 REGRESSION:** Existing Threaded, local realtime/co-op, boss encounter, skills, run-event, reconnect, Codex, Arc Workshop, relic, and gameplay-feel browser suites remain green.

## Human review gate

Automation can prove structure and state truthfulness, but a human play pass should still verify that the page answers these questions without hunting through history:

1. How much HP and Focus do I have right now?
2. How healthy is the enemy?
3. What happens if I Attack now?
4. Am I in combat, choosing a run path/power, or navigating meta screens?
5. Which controls actually advance the run?
