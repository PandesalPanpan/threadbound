# React battle prototype migration map

Status: React shell and secondary-surface increment on the dedicated
`react-battle-prototype` branch. The canonical `/game` cutover remains gated by
parity review.

## Why this boundary exists

The current `/game` presentation is an Express-rendered, plain JavaScript
strangler surface and remains the canonical Adventure Stream shell. The Figma
battle brief introduces a different concrete constraint: one reusable arena
must hold five visual keyframes (`preBattle`, `live`, `impact`, `skillCast`, and
`result`) while preserving the shared chat shell and animating a committed
combat outcome. Keeping those transitions in the current DOM-owned module graph
would require another layer of imperative coordination and would make the
arena difficult to reuse for arbitrary attacker/target pairs.

That is the documented limitation required before introducing a framework under
the presentation plan. React is therefore scoped to `/game-react` as a
parallel, authenticated prototype boundary. It does not replace `/game`, move
business rules into the browser, or change the server/domain contracts.

## Responsibility map

| Concern | Authoritative owner | React prototype boundary |
| --- | --- | --- |
| Character, enemy, HP, Focus, phase | `GameService` + `AdventureRun` + SQLite | `battleViewModel` reads the dashboard/run projection |
| Damage, criticals, cooldowns, rewards | domain policies and `GameService` | renders `CombatActionResolved`/command response fields |
| Start, attack, skill, upgrade | existing Express API routes | `api/client.js` sends commands with idempotency keys |
| Stream receipts | `ActivityStreamService` + WebSocket hub | `ChatFeed` displays `/api/stream` and realtime entries |
| Semantic character/mob art | visual asset catalog | `/api/visual-assets` + stable `visualAssetId` resolution |
| Motion | browser presentation | CSS transforms/opacity/scale keyed by backend-driven phase |

The browser never calculates combat values or decides whether a command is
legal. It only chooses an available server-provided command, then animates the
response.

## Figma evidence and current gap

The supplied Figma file (`xfAbc94dv0LxhxhC9q9BhK`) was inspected through its
page metadata and the existing v2 shell nodes. It contains the chat-first
mobile/desktop flows used by the current presentation plan, but no nodes named
`TB / Prototype`, `Pre-Battle`, `Attack Impact`, `Skill Cast`, `Rune Bard`, or
`Rot Toad`. The five-state battle brief is therefore the visual specification
for this slice; it is not possible to cite missing node IDs or export those
missing artworks. The prototype uses the verified v2 palette and the committed
semantic runtime asset catalog until those Figma nodes are supplied.

## First slice and chat-shell increment

- `frontend/` contains the Vite/React source and plain CSS token layer.
- Express serves the built app at authenticated `/game-react`.
- The arena starts the existing tactical `Frayed Hollow` route so the skill
  state is exercised without restoring it to the canonical `/game` loop.
- `BattleArena` is reusable by data: attacker/target IDs, names, HP, Focus,
  art, damage, and critical state come from the read model/command response.
- WebSocket `state_changed` and `stream_entry` projections refresh the adapter;
  HTTP remains authoritative.
- `public/react-battle/` is a deterministic production build output served by
  the existing Express static middleware.
- `/game-react` now defaults to the React Adventure Stream shell. The tactical
  arena remains available at `/game-react?view=battle` while route parity is
  verified.
- `GameShellApp` loads the authoritative dashboard, semantic asset catalog,
  stream, Area, Quest, Shop, and Gambling projections. `AdventureStream`, `CommandComposer`,
  the desktop quick rail, and the read-only Live Context rail all share one
  command dispatcher.
- Inventory, Shop/Bank, Party, Hunt, Adventure, Dungeon, Quest, Area/Town,
  Profile, Leaderboard/Duel, Gambling, World/Achievements, Honey, Help, and
  Codex cards are embedded in the stream. Mutations first record the typed
  command and then call the existing server route; the follow-up receipt comes
  from the activity stream projection. Read-only profile/leaderboard inspection
  also records the typed action before refreshing the authoritative projection.
- The shell uses stable semantic `visualAssetId` values at the presentation
  boundary and does not introduce browser-side combat, reward, readiness, or
  economy rules.

## Verification and next increment

The focused Playwright suite (`npm run test:e2e:react-local`, isolated by
`playwright.react.local.config.js`) captures all five battle states, the core
chat-shell command-card journey, Guild Hall profile/Duel, and Gold games at
390×844, then verifies the shell at 1440×960. `npm run check`, the 379-test
unit suite, and the full E2E matrix are green for this increment. The next
increment is to compare the shell and battle screenshots against supplied Figma
nodes, add real exported Figma artwork when available, and continue parity
coverage before switching the canonical `/game` route.
