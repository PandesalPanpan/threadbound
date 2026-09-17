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
- Boss: a distinct boss kicker and treatment with the same authoritative enemy
  and party HP model. No permanent tactical dashboard is restored.
- Failure and success: one result-first Adventure Stream receipt from the
  existing activity projection. Detailed turn history remains behind Battle
  Details for compatible battle receipts.
- Recovery: after a run ends, the existing Heal/recovery card exposes potion
  use as an explicit next action. The dungeon surface never implies free
  between-room healing.

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
  encounter index, enemy HP, participant HP, viewer identity, party state, and
  the `simpleCombat` capability flag.
- `SimpleDungeonService.startDungeon` and `AdventureRun.#simpleCombat` own
  simple-run creation and Attack resolution.
- `/api/dungeons/:id/start-simple`, `/api/runs/:id/attack`,
  `/api/party/ready`, `/api/party/leave`, and `/api/recovery/potion` remain the
  existing mutation boundaries.
- Activity Stream entries and realtime messages are projections. The browser
  refreshes the dashboard after a committed action and on reconnect rather
  than treating a stream message as game state.

No new API or read-model field was needed. The Figma entry preview contains
more encounter detail than the current dashboard exposes, so the entry card
deliberately stays at the available dungeon-definition and readiness level
instead of inventing a preview enemy. Terminal victory/failure stays a
concise stream receipt because the current active-run read model is absent
after the run ends.

## Default simple dungeon versus legacy compatibility

The default simple dungeon is an Attack-only stat check. Its presentation does
not expose Guard, Interrupt, Focus, run powers, upgrades, event choices, or
other tactical controls. Those capabilities remain available to persisted
legacy tactical runs through the existing compatibility surface. The legacy
combat dock remains scoped compatibility UI and is not mounted as the default
simple-dungeon surface.

The shared rich-card observer explicitly ignores the marked dungeon surface so
an entry/combat card cannot become a historical `/status`/shop card snapshot.
External rich cards clear the dungeon marker before rendering, preserving the
existing rich-card contract and command history behavior.

## Verification

Passing checks:

- `npx playwright test test/e2e/presentation-v2-dungeon.local.spec.js --config=playwright.simple.local.config.js` — 4 passed.
- `npm run test:e2e:simple-local` — 21 passed, including stream, Battle Details,
  rich-card compatibility, foundation, simple-loop, and Phase E dungeon tests.
- `npm run check` — passed.
- `npm test` — 375 passed.

The new focused spec covers mobile entry, active rooms, authoritative enemy
and player HP, HP persistence across room transitions, reload, the distinct
boss state, Attack-only controls, 44px controls, no horizontal overflow,
failure and explicit healing, success receipt projection, two-browser party
realtime, draft preservation, offline/reconnect refresh, and the desktop
`1440x960` surface. It also captures:

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
- The 42dot Sans licensing question remains outside Phase E.
