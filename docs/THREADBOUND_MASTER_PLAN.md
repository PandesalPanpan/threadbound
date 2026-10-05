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

### Approved combat foundation — 2026-10-05

The owner selected the overhead Arena Lab as the foundation for future combat simulation. Build on its autonomous movement, formation, targeting, role behavior, Mana skills, and deterministic replay, using existing upright semantic character art on an overhead battlefield. The active-timing lab remains a comparison experiment.

The foundation now has branch-local independent attack and movement speeds, continuous travel, collision reservations, and teammate speed controls so units do not move or strike in lockstep. This explicitly authorized combat work may proceed alongside the open human experience gates. It does not check those gates or replace the Adventure Stream shell. Live integration must retain server-authoritative outcomes, persisted replay projections, concise receipts, and party/reconnect correctness; browser-local simulation remains confined to the lab until that integration is implemented and verified. See [ARENA_COMBAT_PROTOTYPE.md](ARENA_COMBAT_PROTOTYPE.md).

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

- [x] **PV2-A01** Isolated Figma-derived tokens and 42dot Sans typography/fallbacks under `public/ui-v2/`.
- [x] **PV2-A02** Shared responsive top navigation and mobile/desktop shell primitives.
- [x] **PV2-A03** Reusable buttons, chips, cards, stat rows, sprite frames, and empty/loading/error states with accessible focus/disabled semantics.
- [x] **PV2-A04** Load foundations through explicit v2 page classes while preserving legacy behavior.
- [x] **PV2-A05** Automated 390×844 and 1440×960 foundation checks plus inspected screenshots.

### Phase B — Adventure Stream foundation

- [x] **PV2-B01** Player, partner, NPC, and Threadbound/system message primitives.
- [x] **PV2-B02** Responsive Adventure Stream and composer/action dock.
- [x] **PV2-B03** Interactive rich-card and historical collapsed-card primitives.
- [x] **PV2-B04** Newest-card interactivity, bounded history, accessible disclosure, reload continuity, and realtime insertion.

### Phase C — core loop cards

- [x] **PV2-C01** Hunt action and result-first automatic-battle receipt with Battle Details.
- [x] **PV2-C02** Inventory overview/equipment/bounded list/expanded item (`62:8`).
- [x] **PV2-C03** Shop overview and expanded offer (`62:68`).
- [x] **PV2-C04** Equipment actions plus Bank, Heal, and Upgrade using existing APIs.
- [x] **PV2-C05** Empty/loading/error states including `62:119`.

### Phase D — world and social cards

- [x] **PV2-D01** Town, NPC, and Guild Hall.
- [x] **PV2-D02** Profile, Leaderboard, and Duel.
- [x] **PV2-D03** Quest and Area.
- [x] **PV2-D04** Every interaction remains a visible action plus coherent receipt.

### Phase E — dungeon endurance

- [x] **PV2-E01** Entry, readiness, and party state.
- [x] **PV2-E02** Room combat and persistent inter-room HP.
- [x] **PV2-E03** Boss state and sparse decisions.
- [x] **PV2-E04** Success/failure and explicit healing.
- [x] **PV2-E05** Realtime two-player reload/reconnect coverage.

### Phase F — secondary systems and mixed-stream polish

- [x] **PV2-F01** Blackjack and remaining secondary systems via message-first flow.
- [x] **PV2-F02** Long mixed history, disclosure, and receipt-density polish.

### Phase G — desktop player counterpart

- [x] **PV2-G01** 1440×960 command rail, dominant stream, and read-only Live Context from `68:2`.
- [x] **PV2-G02** Prove rails are not private gameplay interfaces.
- [x] **PV2-G03** Complete mobile/desktop parity review for player flows.

### Phase H — Codex v2

- [x] **PV2-H01** Mobile directory `73:5` and article `73:66`.
- [x] **PV2-H02** Desktop library + article `73:108`.
- [x] **PV2-H03** Preserve data/search/navigation and state coverage.

### Phase I — Arc Workshop v2

- [x] **PV2-I01** Mobile editor `74:2` and validation/publish `74:46`.
- [x] **PV2-I02** Desktop editor/impact `74:102` and draft review/publish `74:180`.
- [x] **PV2-I03** Verify errors, valid draft, explicit publish/revalidation, compatibility, preview breadth, and DRAFT/PUBLISHED distinction.

### Phase J — legacy presentation retirement

- [x] **PV2-J01** Inventory obsolete presentation modules/styles and prove no live dependency.
- [x] **PV2-J02** Remove only verified-obsolete files.
- [x] **PV2-J03** Run full gates, merge, verify green `main`, document next increment.

### Phase K — HUMAN experience gates

Never mark these from automation or agent judgment alone.

- [ ] **PV2-K01 HUMAN** Two humans understand the first hour without developer docs.
- [ ] **PV2-K02 HUMAN** Hunt stays satisfying and receipts remain readable in long sessions.
- [ ] **PV2-K03 HUMAN** Rich cards are easier than separate pages would be.
- [ ] **PV2-K04 HUMAN** Cooperation, dungeon attrition, and bosses feel clear and meaningful.
- [ ] **PV2-K05 HUMAN** Mobile and desktop feel like one coherent chat game.

Use the two-reviewer guide and worksheet in [PLAYER_EXPERIENCE_ACCEPTANCE.md](PLAYER_EXPERIENCE_ACCEPTANCE.md) to review these gates. The boxes remain open until two people have completed the review and their evidence has been assessed.

### Phase L — production lifecycle gates

- [ ] **PV2-L01** Define abandon/expiry semantics for unfinished party/progression activities.
- [ ] **PV2-L02** Define cleanup for inactive simulated-adventurer jobs/state.
- [ ] **PV2-L03** Load/restart/multi-process durability verification for affected authoritative systems.

## 7. Verification and handoff

Work on `presentation-v2` with focused reversible commits. Add Playwright coverage at both canonical viewports. Verify overflow/clipping, touch targets, composer, long history, card lifecycle, reload/reconnect, realtime party updates, Codex navigation, Workshop validation/draft/publish, and empty/loading/error states.

Run `npm run check`, `npm test`, relevant Playwright projects, and full E2E before merge. Passing assertions alone is not visual parity; inspect screenshots directly.

Every increment reports: implementation; Figma frames; both viewport screenshots; tests; remaining visual differences; API/read-model gaps; obsolete safe-to-delete files; next unchecked increment.

### Branch-local RPG progression increment — 2026-09-23

`feat/rpg-progression-loop` extends the existing player loop with semantic multi-slot Equipment, Level-derived Max HP, authored Area/Hunt/Quest/Town progression, automatic Mana skills, replayable Duels, multi-enemy Dungeons, and one party-wide intermission Heal. The server owns those rules and persisted state; React surfaces the resulting receipts and replays. Focused migration, repository, service, domain, stream, and Playwright coverage accompanies the changes.

Branch-local verification completed: `npm run check`, `npm test` (489 passing), and full `npm run test:e2e` (24 threaded, 21 simple-local, 22 React-local, and 7 workshop passing). The 240-art Figma item library, mobile quest board, desktop Duel replay, mobile Armor Status card, and mobile/desktop multi-enemy Dungeon replay were inspected. Legacy item IDs now retain their object family across sprite and React renderers; tests cover stronger Area rewards, an Area 4 Hunt, Area 2–4 challenge unlocks, a 24-seed Area 1 Dungeon balance regression, replay-gated Area unlocks, Quest rotation, open-card Area refresh, active and terminal replay reconnects, Duel skill/Mana playback, Figma art in Shop, Inventory, Codex, and Dungeon rewards, and a real Mara Armor purchase/equip journey. The acceptance follow-up adds a terminal-skill regression and verifies the Dungeon Heal updates both clients live in the dedicated Dungeon test and the continuous two-Weaver progression journey, which now covers Inventory, official Armor art and stats, Area 2 rewards, Quest, and NPC context. No player-facing code changed in this follow-up. The Phase K human acceptance gates and Phase L production lifecycle gates remain unchecked. This branch-local increment has not been merged or verified by `main` CI, so it does not satisfy the checklist's merge-green completion rule.

#### §20 cleanup follow-up — 2026-09-23

The audit removed the unreachable atlas-frame renderer and equipment-atlas fallback after confirming that current and legacy item paths resolve semantic catalog assets. Persisted legacy item identity mappings remain in place for compatibility. The atlas reference doc and Playwright sprite assertions now describe the semantic catalog path. `npm run check`, `npm test` (489 passing), four targeted threaded Playwright tests, and the focused mobile chat regression passed. Two-player human acceptance is not available yet; Phase K and the dependent Phase L gates remain open. This branch is still unmerged and has no `main` CI result.

#### Open-view receipt follow-up — 2026-09-23

Successful state-changing actions from a temporary `YOUR VIEW` card now dismiss that card and return the Adventure Stream to its newest receipt. Read-only Guild Hall profile inspection keeps the view open. The two-reviewer guide now asks reviewers to observe Area Travel and Town Talk receipt visibility, and `ux-review/react-area-interaction-receipt-mobile.png` records the mobile Town Talk result. `npm run check`, `npm test` (489 passing), and the full React-local Playwright suite (22 passing) are green. This does not replace Phase K human review: both reviewers are still unavailable, so Phase K and the dependent Phase L gates remain open. This branch is unmerged and has no `main` CI result.

#### Acceptance-evidence follow-up — 2026-09-24

The React progression journey now verifies Area 2's Town services/residents, live Quest offer references, contextual NPC interaction receipt, and the `YOUR VIEW` dismissal/latest-receipt behavior. A deterministic Area 2 Hunt service test wins with a sufficiently strong fixture and verifies an Uncommon official item is generated from the Area 2 rarity/material profile, persisted, and included in the public receipt; the live progression E2E may correctly lose when entering below the displayed recommended level. The two-reviewer guide now includes host setup, a Playwright-versus-human review boundary, and the exact Area/Town observation. Current branch verification: `npm run check` passed (Vite reports the existing 500 KB chunk advisory), `npm test` passed (490), threaded E2E passed (24 on port 3011 because a separate local app occupied 3001), simple-local E2E passed (21), React-local E2E passed (22), and Workshop E2E passed (7). Mobile Area receipt and Dungeon replay plus desktop Duel replay screenshots were inspected. Phase K still requires the two human reviewers and remains open; Phase L remains later in the ordered gate. `origin/main` is still `f0a37d802199935e9d15adb6fb19f8681e82989b`; the branch remains unmerged and has no `main` CI result.

#### Replay presentation and equipment-family follow-up — 2026-09-24

Dungeon enemy replay projections now carry initial/final/max Mana, allowlisted signature skills, and final effects, so the shared battle surface renders enemy Mana and skill identity. Presentation playback gates the new Dungeon chooser and shows each participant's committed starting HP in the shell and active-run readout until that replay completes. The progression E2E checks an enemy's Mana spend during its cast, checks the top bar and Live Context during playback, and confirms a partner receives each later Continue replay live with the same roster. Hunt and Adventure service tests use the authored Area 1 encounters to verify a real signature-skill cast spends 100 Mana. Equipment visual families now map by authored item label with completeness and uniqueness checks instead of library order; tests pin Ember/Cinder identities and cover every Area × slot × rarity pool. The Quest and Adventure foundation docs now describe live Arc Quest composition, Areas 1–4, and their remaining integration coverage gap. Verification: `npm run check` passed, `npm test` passed (492), focused Hunt/Adventure service tests passed (14), focused React-local E2E passed (22), and full `npm run test:e2e` passed (24 threaded, 21 simple-local, 22 React-local, 7 Workshop). Updated mobile and desktop multi-enemy Dungeon screenshots were inspected. No canonical checklist boxes changed: Phase K still needs two human reviewers, Phase L remains later, and the branch is unmerged without a `main` CI result; `origin/main` remains `f0a37d802199935e9d15adb6fb19f8681e82989b`.

## 8. Agent protocol and explicit non-goals

Start from current `main`, inspect this plan, then continue the earliest unchecked task whose dependencies are satisfied. Finish partial work before moving on. Read `CONTEXT.md`, `README.md`, this plan, and focused docs before boundary changes. Inspect exact Figma nodes before implementation. Preserve unrelated/untracked user files. Never check milestones before merged green `main`.

No gameplay/domain rewrite, novelty framework migration, microservices, event sourcing, duplicate browser authority, traditional MMO dashboard, silent mutations, message explosion, permanent tactical dashboard, implied free healing, screenshot-as-UI, new Arc generation before foundations, or premature legacy deletion.
