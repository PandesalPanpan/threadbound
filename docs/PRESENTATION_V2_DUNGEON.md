# Presentation v2 dungeon endurance

Phase E presents the server-backed dungeon as a compact Adventure Stream
surface. The browser shows the current room, enemy identity and HP, player or
party HP, readiness, and the one action currently legal for the default simple
dungeon. It does not simulate turns, calculate damage, reset HP, or invent
boss decisions.

## Figma reference map

The implementation was translated from the canonical mobile player-flow
section and its nested states:

- Mobile player flow: `42:2`
- Representative mobile frame: `43:5`
- Dungeon entry: `43:1231`
- Party ready/readiness: `43:1316`
- Normal room combat: `43:1402`
- Room clear/inter-room transition: `43:1512`
- Boss encounter: `43:1619`
- Boss decision: `43:1696`
- Victory: `43:1781`
- Failure: `43:1863`
- Desktop responsive reference: `68:2` (sparse reference only)

The desktop Full Command and Live Context rails are intentionally deferred to
Phase G. Phase E reuses the centered Adventure Stream at `1440x960` so mobile
and desktop remain one semantic system.

## Implemented states

`public/simple-loop.js` renders the following read-model states inside the
shared stream command card:

- Entry: dungeon name, recommendation, Attack-only rule, persistent run-HP
  rule, explicit-healing rule, solo/party readiness, and READY/WAITING rows.
- Active room: room number, encounter identity, enemy current/max HP, current
  player HP, party-member HP rows, and a concise “HP carries into the next
  room” note.
- Between rooms: a durable `between_encounter` state with the next encounter
  snapshot, current party HP, explicit Continue / Use Potion / Leave Dungeon
  actions, and visible risk/reward copy. Continue does not heal; Potion is
  bounded and inventory-backed; Leave keeps carried Gold but forfeits the
  completion reward.
- Boss: a distinct boss kicker and treatment with the same authoritative enemy
  and party HP model. No permanent tactical dashboard is restored.
- Failure and success: one result-first Adventure Stream receipt from the
  existing activity projection. Detailed turn history remains behind Battle
  Details for compatible battle receipts.
- Recovery: after a run ends, the existing Heal/recovery card exposes potion
  use as an explicit next action. The dungeon surface never implies free
  between-room healing; defeat applies the normal carried-Gold penalty while
  banked Gold remains safe.

Party readiness uses the existing `/api/party/ready` and `/api/party/leave`
commands. During a run, a committed partner Attack updates the other browser;
an unsent composer draft remains local to that browser. Reload reconstructs the
same run and HP from the dashboard.

All character and enemy art uses semantic frames from
`public/sprite-catalog.js`. No domain object depends on an image URL or crop
geometry.

## Authoritative boundaries

The server and persisted domain state remain authoritative:

- `/api/dashboard` supplies dungeon definitions, readiness, active run phase,
  encounter index, enemy HP, participant HP, viewer identity, party state,
  between-room `nextEncounter`, and the `simpleCombat` capability flag.
- `SimpleDungeonService.startDungeon` and `AdventureRun.#simpleCombat` own
  simple-run creation and Attack resolution. `AdventureRun` owns the durable
  between-room pause and Continue/Potion/Retreat transitions.
- `/api/dungeons/:id/start-simple`, `/api/runs/:id/attack`,
  `/api/runs/:id/continue`, `/api/runs/:id/potion`,
  `/api/runs/:id/retreat`, `/api/party/ready`, and `/api/party/leave` are the
  Dungeon mutation boundaries. `/api/recovery/potion` remains the separate
  out-of-run healing boundary.
- `SQLiteGameRepository` keeps `between_encounter` active across reconnects,
  consumes a Potion and saves the next room in one transaction, and releases a
  party after Retreat or defeat. `DungeonRiskPolicy` projects completion-only
  reward security, carried-Gold death risk, and bank safety.
- Activity Stream entries and realtime messages are projections. The browser
  refreshes the dashboard after a committed action and on reconnect rather
  than treating a stream message as game state.

The between-room read model intentionally carries the next encounter snapshot
so the player can make a real choice without the browser guessing what follows.
There is no automatic room recovery: Continue preserves the current HP,
Potion heals only the active Dungeon participant and consumes one persisted
Potion, and Leave keeps carried Gold but forfeits the completion reward. Death
uses the existing normal carried-Gold penalty and never includes banked Gold.

## Default simple dungeon versus legacy compatibility

The default simple dungeon is an Attack-only stat check. Its presentation does
not expose Guard, Interrupt, Focus, run powers, upgrades, event choices, or
other tactical controls. Those capabilities remain available to persisted
legacy tactical runs through the existing compatibility surface. The legacy
combat dock remains scoped compatibility UI and is not mounted as the default
simple-dungeon surface.

React’s Adventure Stream renders shared read-only Dungeon receipts for entry,
combat, Continue, Potion, Retreat, and defeat. Only the owner’s active command
card has mutation buttons; observers receive the same facts without controls.
The legacy Figma surface uses the same server read model and exposes the same
three explicit decisions beside the composer.

## Verification

Passing checks:

- `npx playwright test test/e2e/presentation-v2-dungeon.local.spec.js --config=playwright.simple.local.config.js` — 4 passed.
- `npx playwright test --config=playwright.react.local.config.js` — 11 passed,
  including the React Dungeon decision journey.
- `npm run test:e2e:simple-local` — passed, including stream, Battle Details,
  rich-card compatibility, foundation, simple-loop, and Dungeon tests.
- `npm run check` — passed.
- `npm test` — 390 passed.

The focused specs cover mobile entry, active rooms, authoritative enemy and
player HP, HP persistence across room transitions, reload, the distinct boss
state, Attack-only controls, 44px controls, no horizontal overflow, failure
and explicit healing, success receipt projection, two-browser party realtime,
draft preservation, offline/reconnect refresh, the desktop `1440x960` surface,
and the React between-room Potion/Continue/Retreat journey. They capture:

- `test-results/presentation-v2/dungeon-390x844.png`
- `test-results/presentation-v2/dungeon-1440x960.png`

Both screenshots were inspected directly. The mobile frame keeps the enemy,
HP bars, room context, composer, and Attack action readable without horizontal
overflow or an obscured composer. Desktop preserves the centered stream and
does not introduce Phase G rails.

`npm run test:e2e:legacy-local` remains red in two older shell tests because
they require legacy character/honey surfaces to be visible, while the
presentation-v2 shell intentionally hides those surfaces. The focused Phase E
legacy tactical completion test passes and verifies the concise clear receipt;
no legacy domain behavior was changed.

## Remaining visual differences

- The Figma preview’s richer entry/terminal artwork is represented by the
  available authoritative read model and semantic sprites, not by static
  screenshots or invented encounter data.
- Desktop rails and expanded desktop command composition remain Phase G work.
- 42dot Sans is imported and applied by both the legacy theme and the React
  bundle; font licensing remains a deployment-policy decision.
