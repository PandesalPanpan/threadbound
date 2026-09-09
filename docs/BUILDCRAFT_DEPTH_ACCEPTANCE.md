# Buildcraft & Combat Depth Acceptance

## Goal
A run should create meaningfully different combat decisions based on the powers the party selected and the enemy pattern in front of them. Repeated Attack must not be the universally best response.

## Architecture boundaries (Fowler-aligned)
- `DungeonRun` remains the combat **Domain Model** and aggregate-internal combat state machine.
- `AdventureRun` remains the run-lifecycle aggregate facade and owns selected run powers/draft consistency.
- `RunBuildPolicy` is a **Domain Service / Policy** that derives whitelisted build modifiers from constrained run-power data. The browser never evaluates power mechanics.
- `CombatIntentPolicy` remains the enemy-intent policy. Enemy tactical identities are expressed as constrained abilities/intent patterns rather than arbitrary executable content.
- `CombatPreviewService` remains an **Application Service** that simulates the same aggregate commands used by committed play, so previews cannot drift from mechanics.
- UI build summaries and synergy hints are a **Presentation Model** projection only. Durable stream events stay append-only.

## Mechanical acceptance gates

### BD-01 Three viable build paths
At minimum the constrained catalog supports three mechanically distinct paths:
1. **Guard / Riposte** — successful Guard creates materially stronger counter-pressure and rewards answering guardable intents.
2. **Interrupt / Control** — successful Interrupt generates additional resource/tempo and rewards answering interruptible intents.
3. **Expose / Crit / Focus** — Exposed targets materially improve crit/skill payoff and Focus-oriented powers accelerate skill usage.

Each path must change at least one combat rule or resource conversion, not only add flat Attack/HP.

### BD-02 Powers compose
Selecting two powers from the same path must produce a stronger interaction than either alone where applicable. `selectedUpgrades` remains the durable source of run build identity.

### BD-03 Enemy patterns create different best responses
At least four tactical enemy patterns exist across canonical content:
- guardable heavy pressure,
- interruptible setup/heal,
- punishment for blindly ignoring a telegraph,
- boss/phase pattern requiring reactions rather than fixed attack counts.

### BD-04 Attack spam is not universally optimal
Automated domain/browser coverage must demonstrate at least one guard-focused scenario and one interrupt-focused scenario where answering the intent produces strictly better health/resource/tempo outcome than blindly attacking through it.

### BD-05 Authoritative preview parity
Action previews use the same aggregate + policies as committed commands. Build modifiers, crit chance, reaction bonuses, and enemy-intent outcomes must not be duplicated in browser formulas.

### BD-06 Build readability
During a run the player can inspect a compact current-build summary showing selected powers, archetype tags, and active synergy effects. It must be descriptive only; server state remains authoritative.

### BD-07 Persistence/co-op
Refresh/reconnect preserves selected powers and derived mechanics. Party members observe the same shared build state and enemy intent.

### BD-08 Generated-content safety
Generated Arc content can choose only whitelisted enemy abilities and run-power IDs. It cannot inject executable combat logic.

## Verification
- Unit tests cover pure build-policy derivation and aggregate combat outcomes.
- Playwright covers at least one Guard/Riposte journey, one Interrupt/Control journey, and build-summary persistence.
- Existing first-run, co-op, generated-content, reconnect, idempotency, workshop, relic, and UX-coherence suites stay green.
- Merge only after `unit-and-contract` and complete `browser-e2e` are green.
