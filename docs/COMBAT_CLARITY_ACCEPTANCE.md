# Combat Clarity & Resolution Acceptance

This milestone exists because combat can be mechanically correct and still feel unclear or clanky. The merge gate is player-visible clarity plus authoritative combat resolution, not only passing tests.

## Architecture boundary

- Combat ordering, critical strikes, and death-trigger exceptions are Domain Model / Domain Policy concerns.
- Application Services may project authoritative combat outcomes but must not recalculate combat rules.
- Hover/focus preview, semantic colors, hit feedback, and transition animation are Presentation Model concerns.
- Activity Stream history remains append-only. Presentation may enrich or condense it, but may not rewrite durable facts.

## Acceptance gates

- [ ] **CC-01 CONTRAST:** Confirmed damage numbers and chips are readable on the dark surface at a glance. Red means confirmed damage; yellow means projected future damage; green healing; cyan defense/prevention; blue Focus; purple skill/status; gold reward/event.
- [ ] **CC-02 ZERO HOVER SHIFT:** Hovering/focusing an action never changes the action row height, button width, or surrounding layout. Preview space is reserved.
- [ ] **CC-03 PROJECTED DAMAGE:** Damage preview uses a clearly yellow projected-loss segment on enemy HP and a stable `before → after` label.
- [ ] **CC-04 PLAYER-FIRST LETHAL:** A normal enemy that is reduced to 0 HP by the player's action cannot resolve its pending attack afterward.
- [ ] **CC-05 DEATH EFFECT EXCEPTION:** An enemy may still resolve an on-death effect only when its explicit ability/policy declares one (for example `death_burst`).
- [ ] **CC-06 NEXT ENCOUNTER VISIBLE:** Choosing a run power or run event immediately renders the next enemy/boss at full authoritative HP before the player takes another action.
- [ ] **CC-07 CHEAP MOTION:** HP changes, hit feedback, encounter arrival, and critical feedback use transform/opacity/width animation only and respect `prefers-reduced-motion`.
- [ ] **CC-08 CRITICAL STRIKE:** Critical strikes are server/domain authoritative, deterministic for the current run version so previews cannot reroll, and visibly distinct from ordinary damage.
- [ ] **CC-09 PREVIEW PARITY:** The read-only combat preview simulates the same aggregate/policies as the committed action; lethal/critical projections match the committed result.
- [ ] **CC-10 REGRESSION:** Unit/contract, threaded browser, local co-op, encounter mechanics, combat skills, relic progression, generated Arc Workshop, and semantic-color suites remain green.

## Definition of done

The milestone is mergeable only when all automated gates are green and a browser run demonstrates: readable damage, zero hover reflow, obvious yellow projected loss, lethal attacks cancelling ordinary enemy response, immediate next-fight visibility after decisions, and smooth reduced-cost feedback.