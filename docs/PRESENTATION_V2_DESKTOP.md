# Presentation v2 desktop player shell

PV2-G01 adds the desktop counterpart of the Figma player frame without creating a second gameplay surface. At desktop widths, `public/ui-v2/desktop-player.js` wraps the existing Adventure Stream in a three-column presentation shell:

- a 240px Quick Commands rail;
- the existing stream in a 780px center column;
- a 420px read-only Live Context rail.

The command rail submits plain commands to the existing stream composer. Town, Hunt, Dungeon, Inventory, Quest, Guild Hall, and Bank therefore keep their existing command routing, receipts, and server authority. The right rail reads `/api/dashboard`, `/api/areas`, and `/api/quests`; it renders current Area progression, active Quest objective state, party status, and Guild Hall rankings without introducing new persistence or gameplay APIs.

The shell is hidden below the desktop breakpoint and the stream remains in its existing mobile flow. The header adds a small Threadspire/LIVE/player status context only on desktop.

Because the desktop and mobile paths reuse one stream card host, each rich-card renderer clears the previous renderer's identity metadata before taking ownership. This keeps sequential parity flows from allowing an old Inventory/Shop/etc. observer to reinterpret a newer card.

## Figma source

- Desktop frame: `68:2` in `Threadbound — Minimal Chat Gameplay UI` (`xfAbc94dv0LxhxhC9q9BhK`)
- Desktop Town + Guild frame: `68:5`

## Verification

- `test/e2e/presentation-v2-desktop.local.spec.js` checks the 1440px shell geometry, read-only copy, authoritative Area/Quest/Guild projections, and command routing through Town and Guild Hall.
- The same suite proves command buttons remain `type="button"` conveniences routed through the shared composer, that opening Guild Hall performs no mutation, and that Hunt produces its normal stream receipt through the existing server command.
- The parity case runs Town, Inventory, Quest, Bank, and Guild Hall both as mobile typed commands and desktop rail actions, comparing their semantic rich-card kinds after each route.
- `test-results/presentation-v2/desktop-player-1440x960.png` is the representative desktop review capture.
