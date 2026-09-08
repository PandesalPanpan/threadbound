# Combat V2 architecture

## Goal

Combat must reward reading the shared thread and reacting to enemy intent. A player who repeatedly chooses Attack should perform materially worse than one who Guards heavy attacks, Interrupts enemy recovery, supports allies, and chooses a run build that amplifies those decisions.

## Fowler-style boundaries

Threadbound remains a modular monolith.

- **Domain Model — `DungeonRun`** owns combat invariants: HP, threat, retaliation, reactions, run upgrades, contribution and encounter transitions.
- **Domain policy — `CombatIntentPolicy`** owns the varying enemy-intent catalogue and resolution policy. This is intentionally separated from `DungeonRun` so new encounter patterns do not turn the aggregate into a giant conditional table.
- **Service Layer — `GameService`** continues to coordinate use cases, persistence, rewards and publication of committed results. It does not decide combat outcomes.
- **Repository** continues to persist the full authoritative run and enforce optimistic versioning. Combat V2 adds fields to the persisted run document rather than introducing another transactional authority.
- **Activity Stream / realtime** remain projections and delivery mechanisms. They never become the source of truth and are not Event Sourcing.

## Compatibility

`DungeonRun` normalizes missing Combat V2 fields in its constructor. Runs created before this change can therefore be loaded without a schema flag day; newly saved runs naturally carry the added fields.

Generated Arc Manifest dungeons continue to use the same `DungeonRun` path. The intent policy depends on the normalized runtime enemy shape (`hp`, `maxHp`, `retaliation`, `isBoss`) rather than hard-coded Frayed Hollow IDs.

## Combat rules introduced in this slice

- After every three ordinary attacks the enemy telegraphs an intent.
- Choosing Attack while an intent is pending resolves the unanswered intent first. Telegraphs can no longer be ignored by fast tapping.
- Damage intents reward Guard or Interrupt.
- Recovery intents heal the enemy unless Interrupted.
- Intent patterns are deterministic, making failures learnable instead of arbitrary.
- `Riposte Weave` converts a successful Guard into bonus damage on the next Attack.
- `Disruptor Knot` converts a successful Interrupt into a larger next-Attack bonus.
- Reaction success is persisted per participant for later UX, balance telemetry and achievement projections.

## Scaling rule

Do not add a new service or database for future skills. Add domain policies/value objects while the rules remain within one bounded game context. Split a new module only when it has an independent consistency boundary or lifecycle, not merely because the file becomes large.

## Acceptance gate

Automation must prove:

1. mindless Attack pays the pending telegraph cost;
2. Guard reduces a heavy hit;
3. Interrupt prevents enemy recovery;
4. reaction-focused upgrades create an observable payoff;
5. old reconnect/co-op/Threaded/local/Arc Workshop suites remain green.

Long-term fun, retention and social chemistry remain human-player validation gates; green automation is not treated as proof of fun.
