# Presentation v2 world and social cards

Phase D translates the Figma Town, Guild Hall, Profile, Leaderboard, Duel, Quest, and Area hierarchy onto the existing authoritative card implementations.

## Contract

- Town remains the hub: services and residents are scannable rows, and NPC actions stay inside the Adventure Stream.
- Guild Hall uses the persisted roster and marks the intentionally strong rival without changing simulation data.
- Human and simulated profiles show progression, canonical stats, equipment, activity, and Duel record; no bot economy controls are introduced.
- Quest cards keep active objectives first, with available quests and explicit Accept/Claim actions below.
- Area cards expose only authoritative unlocked destinations and keep the current Area obvious.
- Existing domain-event projections remain the source of one coherent receipt for Talk, Quest, Area, and Duel actions.

The visual layer is isolated in `public/ui-v2/world-social.css`. The legacy card modules remain in place until Phase J dependency removal.

## Verification

The focused threaded Playwright suite covers all listed cards at the canonical mobile viewport, including authoritative mutations, rejected invalid actions, touch targets, overflow, and public receipts. Desktop parity is completed in Phase G.
