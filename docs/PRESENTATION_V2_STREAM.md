# Presentation v2 Adventure Stream

Status: **Phase B merged into local `main`; canonical checklist item PV2-B01–B04 is complete.**

## Figma references

- `44:1013` — mixed player, partner, NPC, Threadbound, active-card, and action-dock session.
- `44:747` — collapsed rich-card history.

## Presentation contract

`public/ui-v2/stream.js` adapts authoritative activity entries into four visual roles: current player, partner, NPC, and Threadbound. It does not infer outcomes or change persisted state. NPC identity comes from the existing `NpcInteracted` projection; all other non-chat activity remains a Threadbound receipt.

The browser keeps at most 100 rendered stream entries while the server repository remains authoritative and retains its own history. Initial and reloaded history continues to come from `/api/stream`; WebSocket insertion with SSE fallback continues through the existing Adventure Stream module.

Only the current command card contains actions. When another card replaces it, the compatibility adapter adds an actionless historical snapshot to one compact `COLLAPSED HISTORY` group modeled on Figma node `44:747`. The group exposes its snapshot count, keeps each row auditable through native `details`/`summary` disclosure, explains that actions belong to the latest card, and is bounded to the newest 12 snapshots. Dismissing a current card clears the remembered snapshot so a later card cannot resurrect dismissed history.

`public/ui-v2/stream.css` implements the shared message column, authoritative player HP strip, role badges, current-card surface, two-column contextual dock, and composer for mobile and desktop. Legacy renderers and API contracts remain installed behind the v2 presentation selectors during the strangler migration.

## Verification

`test/e2e/presentation-v2-stream.local.spec.js` covers both canonical viewports, current-player and realtime partner insertion, NPC semantics, newest-card interactivity, collapsed disclosure, touch targets, overflow, and reload role continuity. `test/e2e/rich-chat-card.local.spec.js` additionally covers the bounded 12-snapshot mixed-history group and dismissed-card behavior. It captures:

- `test-results/presentation-v2/stream-390x844.png`
- `test-results/presentation-v2/stream-1440x960.png`

`test/presentation-v2-stream.test.js` covers role classification and the live-DOM history bound.
