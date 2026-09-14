# Threadbound Presentation v2 Master Plan

> Status: canonical product direction and ordered execution checklist as of 2026-09-14.
>
> Goal: rebuild the presentation layer from the canonical Figma v2 design, then connect it to the existing Threadbound application/domain/API behavior. This plan supersedes the incremental legacy presentation checklist.
>
> Visual source: [Threadbound — Minimal Chat Gameplay UI](https://www.figma.com/design/xfAbc94dv0LxhxhC9q9BhK/Threadbound-%E2%80%94-Minimal-Chat-Gameplay-UI?node-id=0-1&p=f), file key `xfAbc94dv0LxhxhC9q9BhK`.

## 1. Product direction

Threadbound is a persistent cooperative chat-first RPG for two human players. The Adventure Stream is the player application shell. This work replaces presentation, not game architecture or rules.

The fantasy remains simple: Hunt, gain XP and Gold, improve Equipment, take Quests, explore Areas and Towns, challenge Adventures and Dungeons together, and build a shared history.

Use obvious player language: Gold, Inventory, Equipment, Upgrade, Heal, Bank, Area, Town, Quest, Adventure, Duel, Profile, Leaderboard, Blackjack, Slots, and Coinflip. Preserve legacy persistence/API names only where migration safety requires them.

## 2. Canonical Figma scope

Use Figma MCP design context and fresh node screenshots for implementation and review. Screenshots are comparison references, never shipped UI.

- Mobile player flows, 390×844: `42:2`.
- Mobile Inventory expanded: `62:8`; Shop expanded: `62:68`; empty state: `62:119`.
- Desktop player counterpart, 1440×960: `68:2`.
- Codex: mobile directory `73:5`, mobile article `73:66`, desktop library + article `73:108`.
- Arc Workshop: mobile editor `74:2`, mobile validation + publish `74:46`, desktop editor + impact `74:102`, desktop draft review + publish `74:180`.

For every major screen: inspect its node; export only genuine reusable assets when necessary; implement semantic HTML/CSS/JS; capture the running page at the canonical viewport; compare it with a fresh Figma screenshot; refine it. Never rasterize a Figma screen into the product.

## 3. Non-negotiable boundaries

### Presentation rewrite only

- Keep the modular monolith.
- Domain Model/Policy owns rules; Service Layer coordinates use cases; repositories own persistence/transactions; browser code is a Presentation Model.
- Server/persisted state is authoritative. Activity stream and realtime messages are projections.
- Do not duplicate prices, rewards, combat, progression, validation, or publication rules in browser code.
- Do not rewrite APIs because a legacy renderer consumed them awkwardly.
- If Figma needs unavailable information, document the read-model gap first, then add the smallest server projection.

### Strangler migration

- Build v2 under `public/ui-v2/` with explicit page scoping.
- Connect it to existing API/realtime contracts through presentation adapters/view models.
- Keep working legacy behavior until its replacement is covered and green.
- Remove obsolete scripts/styles only in Phase J.
- Stay with Express-rendered plain HTML/CSS/JavaScript unless a concrete limitation is documented before adding a framework.

### Chat shell

- Adventure Stream stays dominant on mobile and desktop.
- Inventory, Shop, Bank, Profile, Leaderboard, Quest, Town, NPC, gambling, and similar systems are rich stream events/cards, not private gameplay pages.
- Every meaningful button produces a visible player-action entry followed by one concise public result receipt.
- Normal Peter/Mika conversation remains intermixed with game activity.
- Only the newest relevant rich card is interactive; older cards collapse into concise history.
- Put results first with compact deltas such as `−4 HP`, `+20 Gold`, `+35 XP`, and `32/40 HP`; put detail behind disclosure.
- Routine automatic battles produce one receipt; turns belong in Battle Details.
- Outside active contexts, show at most two composer shortcuts: normally Hunt plus one contextual action.

### Responsive and dungeon truth

- One semantic system serves 390×844 and 1440×960.
- Desktop may add the designed command rail and read-only Live Context rail, never alternate gameplay interfaces.
- No horizontal overflow, clipped text, unusable composer, or empty document tail.
- Mobile primary controls target at least 42–44px.
- Dungeon HP persists between encounters. Never imply free healing. Healing/restoration is explicit and visible.
- Show both players' HP when party context requires it.
- Most combat auto-resolves; only major/boss encounters may pause for sparse meaningful decisions.
- Do not restore the permanent tactical dashboard.

## 4. Shared v2 design system

Centralize Figma-derived tokens. The verified initial palette is:

- canvas `#1E1F22`; header/inset `#0F1117`;
- surfaces `#25262A` and `#2B2D31`; border `#3A3C42`;
- text `#F0F0F5`; muted `#9498A2`; secondary muted `#8F94A8`;
- purple `#9E78FF`; blue `#61ADFF`; green `#59D18C`; red `#FF5C66`; gold `#F5B047`;
- primary typeface 42dot Sans with resilient system fallbacks.

Shared primitives cover shells, stream messages, receipts, cards, collapsed history, composer/action dock, item rows/details, combat states, HP bars, stat rows, buttons, chips, semantic sprite frames, states, Codex entries/articles, and Workshop editor/validation/drafts.

Semantic game art comes through `public/visual-asset-catalog.js` and `public/sprite-catalog.js`. Do not add direct legacy `/sprites/kenney/*` paths where semantic assets exist. Domain objects never know image URLs/crop geometry.

## 5. Dedicated surfaces

### Codex v2

`/codex` remains a read-only projection. Preserve search; All, Items, Enemies, Bosses, Lore, Achievements, and History categories; counts; directory; article; breadcrumbs; metadata/infobox; overview; mechanics; related pages; history; and supported generated links/tags. Mobile moves naturally between directory/article; desktop uses the designed rail + directory + article workspace.

### Arc Workshop v2

`/arc-workshop` remains a local-development authoring surface outside the Stream. Preserve this authoritative flow:

1. Download world context and JSON Schema.
2. Author elsewhere.
3. Upload or paste JSON, maximum 512 KB.
4. Parse/preview, then validate authoritatively.
5. Display errors and warnings.
6. Save only a valid manifest as DRAFT.
7. Preview package impact.
8. Explicitly Publish; revalidate on Publish.
9. Project validated published content into live state and Codex.

Keep v1 compatibility while prioritizing `v2 · world package`. Preview all supported v2 content families. Preview is informational. Upload never implies publish. DRAFT and PUBLISHED must be unmistakable. Preserve server-enforced local-development restrictions.

## 6. Ordered implementation checklist

Check an item only after implementation, tests, documentation, merge, and green `main` CI. Branch-local completion is reported in handoff but remains unchecked here.

### Phase A — tokens and shared foundation

- [ ] **PV2-A01** Isolated Figma-derived tokens and 42dot Sans typography/fallbacks under `public/ui-v2/`.
- [ ] **PV2-A02** Shared responsive top navigation and mobile/desktop shell primitives.
- [ ] **PV2-A03** Reusable buttons, chips, cards, stat rows, sprite frames, and empty/loading/error states with accessible focus/disabled semantics.
- [ ] **PV2-A04** Load foundations through explicit v2 page classes while preserving legacy behavior.
- [ ] **PV2-A05** Automated 390×844 and 1440×960 foundation checks plus inspected screenshots.

### Phase B — Adventure Stream foundation

- [ ] **PV2-B01** Player, partner, NPC, and Threadbound/system message primitives.
- [ ] **PV2-B02** Responsive Adventure Stream and composer/action dock.
- [ ] **PV2-B03** Interactive rich-card and historical collapsed-card primitives.
- [ ] **PV2-B04** Newest-card interactivity, bounded history, accessible disclosure, reload continuity, and realtime insertion.

### Phase C — core loop cards

- [ ] **PV2-C01** Hunt action and result-first automatic-battle receipt with Battle Details.
- [ ] **PV2-C02** Inventory overview/equipment/bounded list/expanded item (`62:8`).
- [ ] **PV2-C03** Shop overview and expanded offer (`62:68`).
- [ ] **PV2-C04** Equipment actions plus Bank, Heal, and Upgrade using existing APIs.
- [ ] **PV2-C05** Empty/loading/error states including `62:119`.

### Phase D — world and social cards

- [ ] **PV2-D01** Town, NPC, and Guild Hall.
- [ ] **PV2-D02** Profile, Leaderboard, and Duel.
- [ ] **PV2-D03** Quest and Area.
- [ ] **PV2-D04** Every interaction remains a visible action plus coherent receipt.

### Phase E — dungeon endurance

- [ ] **PV2-E01** Entry, readiness, and party state.
- [ ] **PV2-E02** Room combat and persistent inter-room HP.
- [ ] **PV2-E03** Boss state and sparse decisions.
- [ ] **PV2-E04** Success/failure and explicit healing.
- [ ] **PV2-E05** Realtime two-player reload/reconnect coverage.

### Phase F — secondary systems and mixed-stream polish

- [ ] **PV2-F01** Blackjack and remaining secondary systems via message-first flow.
- [ ] **PV2-F02** Long mixed history, disclosure, and receipt-density polish.

### Phase G — desktop player counterpart

- [ ] **PV2-G01** 1440×960 command rail, dominant stream, and read-only Live Context from `68:2`.
- [ ] **PV2-G02** Prove rails are not private gameplay interfaces.
- [ ] **PV2-G03** Complete mobile/desktop parity review for player flows.

### Phase H — Codex v2

- [ ] **PV2-H01** Mobile directory `73:5` and article `73:66`.
- [ ] **PV2-H02** Desktop library + article `73:108`.
- [ ] **PV2-H03** Preserve data/search/navigation and state coverage.

### Phase I — Arc Workshop v2

- [ ] **PV2-I01** Mobile editor `74:2` and validation/publish `74:46`.
- [ ] **PV2-I02** Desktop editor/impact `74:102` and draft review/publish `74:180`.
- [ ] **PV2-I03** Verify errors, valid draft, explicit publish/revalidation, compatibility, preview breadth, and DRAFT/PUBLISHED distinction.

### Phase J — legacy presentation retirement

- [ ] **PV2-J01** Inventory obsolete presentation modules/styles and prove no live dependency.
- [ ] **PV2-J02** Remove only verified-obsolete files.
- [ ] **PV2-J03** Run full gates, merge, verify green `main`, document next increment.

### Phase K — HUMAN experience gates

Never mark these from automation or agent judgment alone.

- [ ] **PV2-K01 HUMAN** Two humans understand the first hour without developer docs.
- [ ] **PV2-K02 HUMAN** Hunt stays satisfying and receipts remain readable in long sessions.
- [ ] **PV2-K03 HUMAN** Rich cards are easier than separate pages would be.
- [ ] **PV2-K04 HUMAN** Cooperation, dungeon attrition, and bosses feel clear and meaningful.
- [ ] **PV2-K05 HUMAN** Mobile and desktop feel like one coherent chat game.

### Phase L — production lifecycle gates

- [ ] **PV2-L01** Define abandon/expiry semantics for unfinished party/progression activities.
- [ ] **PV2-L02** Define cleanup for inactive simulated-adventurer jobs/state.
- [ ] **PV2-L03** Load/restart/multi-process durability verification for affected authoritative systems.

## 7. Verification and handoff

Work on `presentation-v2` with focused reversible commits. Add Playwright coverage at both canonical viewports. Verify overflow/clipping, touch targets, composer, long history, card lifecycle, reload/reconnect, realtime party updates, Codex navigation, Workshop validation/draft/publish, and empty/loading/error states.

Run `npm run check`, `npm test`, relevant Playwright projects, and full E2E before merge. Passing assertions alone is not visual parity; inspect screenshots directly.

Every increment reports: implementation; Figma frames; both viewport screenshots; tests; remaining visual differences; API/read-model gaps; obsolete safe-to-delete files; next unchecked increment.

## 8. Agent protocol and explicit non-goals

Start from current `main`, inspect this plan, then continue the earliest unchecked task whose dependencies are satisfied. Finish partial work before moving on. Read `CONTEXT.md`, `README.md`, this plan, and focused docs before boundary changes. Inspect exact Figma nodes before implementation. Preserve unrelated/untracked user files. Never check milestones before merged green `main`.

No gameplay/domain rewrite, novelty framework migration, microservices, event sourcing, duplicate browser authority, traditional MMO dashboard, silent mutations, message explosion, permanent tactical dashboard, implied free healing, screenshot-as-UI, new Arc generation before foundations, or premature legacy deletion.
