# Rich chat card foundation

Status: **M2-01 implemented; merge only after green CI and mobile screenshot review.**

## Purpose

The Adventure Stream is Threadbound's application shell. Rich command surfaces must therefore behave like app-like panels inside chat rather than becoming separate product pages or reviving the legacy tactical dashboard.

`public/rich-chat-card.js` is the canonical presentation primitive for these panels. It owns only browser presentation semantics; it does not decide gameplay outcomes, prices, equipment rules, progression, or persistence.

## Contract

The primitive provides:

- `createRichChatCard(...)` for new rich-card families;
- `createRichChatCardAction(...)` for consistent accessible card actions;
- `decorateRichChatCard(...)` for applying the canonical semantics to an existing card;
- `installRichChatCardCompatibility(...)` as a strangler adapter over the existing Status, Inventory, Shop, Recovery, Party, and Codex command-card renderers while those families migrate incrementally.

Canonical rich cards receive:

- one `rich-chat-card` shell inside the Adventure Stream;
- an explicit `data-rich-card-kind` identity;
- accessible region labeling;
- one reusable header/dismiss contract;
- consistent action semantics with a 44px minimum mobile target;
- no authoritative state of their own.

The compatibility adapter intentionally preserves the current command-card content and behavior. It standardizes the shell first so M2-02 onward can migrate individual card families without inventing another panel system.

## Product boundaries

- Adventure Stream remains the primary shell.
- Opening a card is a presentation/read-model concern; mutations still go through existing HTTP Service Layer commands and their public receipts.
- This milestone does not add Inventory/Shop/Profile/Bank feature scope from M2-02 onward.
- It does not reintroduce Guard/Interrupt/skills/run powers as the default game experience.
- Gold and Honey remain the only headline currencies.

## Verification

`test/e2e/rich-chat-card.local.spec.js` exercises the primitive through real mobile Status, Shop, and Inventory command panels, verifies shared semantics and 44px actions, ensures the layout stays within a 390px viewport, captures `ux-review/rich-chat-card-mobile.png`, and verifies the shared dismiss behavior.

The spec is included in the active `playwright.simple.local.config.js` suite rather than existing only as dormant coverage.

## Handoff

After M2-01 is merged and post-merge `main` CI is green, the next earliest milestone is **M2-02 — Inventory rich card**. Build it on this primitive and the existing authoritative five-slot equipment/read-model foundations rather than creating a parallel Inventory screen.
