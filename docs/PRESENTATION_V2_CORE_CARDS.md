# Presentation v2 core-loop cards

Phase C keeps Hunt, Inventory, Shop, Bank, Upgrade, and Heal inside the Adventure Stream while leaving existing gameplay APIs authoritative.

## Implemented contract

- Hunt results lead with outcome and compact HP, Gold, XP, loot, and quest deltas; the existing Battle Details dialog owns turn-by-turn simulation.
- Inventory presents character stats, equipment slots, a bounded scrolling item list, item actions, and an explicit current-versus-upgraded comparison before spending Gold.
- Shop presents vendor context, offer state, owned quantity, affordability, and Buy actions in one active card.
- Bank exposes carried and protected balances, quick amount conveniences, authoritative Deposit/Withdraw calls, and a visible stream receipt.
- Heal continues to use the existing potion and natural-recovery rules. Presentation does not invent a paid healer or a new mutation.
- Loading, empty, and error states use the shared `tb-v2-state` primitive.

The implementation is scoped under `public/ui-v2/core-cards.css`; legacy modules remain active until Phase J proves they are obsolete.

## Verification

Focused Playwright coverage exercises the core cards at 390×844 and 1440×960 and writes representative screenshots under `test-results/presentation-v2/`.
