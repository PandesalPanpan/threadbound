# Luna Execution Plan — Presentation v2 Phase E

> Working checklist for the `presentation-v2` branch.
>
> Recommended model: `gpt-5.6-luna` at `xhigh` effort.
>
> These checkboxes track branch-local execution only. Do not update the canonical
> checkboxes in `THREADBOUND_MASTER_PLAN.md` until the work is merged, tested,
> documented, and green on `main`.

## Objective

Complete the branch-local Phase E dungeon-endurance presentation (`PV2-E01`
through `PV2-E05`) while preserving existing gameplay, persistence, APIs,
realtime behavior, and legacy-run compatibility. Stop after Phase E is
implemented, documented, tested, visually inspected, and committed. Do not
continue into Phase F during this assignment.

## Current repository state

- Branch: `presentation-v2`
- Starting HEAD: `e911ed3 PV2-D align world and social cards`
- Branch-local presentation commits:
  - `41a9ac1` — Phase A
  - `3ba170e` — Phase B
  - `0b5d815` — Phase C
  - `e911ed3` — Phase D
- Verified starting baseline:
  - `npm run check` passes.
  - `npm test` passes, 372/372.
- Preserve unrelated untracked directories:
  - `data/`
  - `ux-review/`
- Partial Phase E work already exists:
  - modified `public/adventure-stream.js`
  - modified `public/game.js`
  - modified `public/ui-v2/index.css`
  - untracked `public/ui-v2/dungeon.css`
  - untracked `docs/PRESENTATION_V2_DUNGEON.md`

Treat these changes as unfinished work. Inspect and improve them; do not discard
them wholesale.

## 1. Re-establish constraints

- [ ] Read `AGENTS.md` completely.
- [ ] Read `CONTEXT.md` completely.
- [ ] Read `README.md` completely.
- [ ] Read `docs/THREADBOUND_MASTER_PLAN.md` completely.
- [ ] Read `docs/PLAYER_EXPERIENCE_ACCEPTANCE.md`.
- [ ] Read `docs/RICH_CHAT_CARD_FOUNDATION.md`.
- [ ] Read `docs/PRESENTATION_V2_STREAM.md`.
- [ ] Read `docs/PRESENTATION_V2_CORE_CARDS.md`.
- [ ] Read `docs/PRESENTATION_V2_WORLD_SOCIAL.md`.
- [ ] Read `docs/SIMPLE_GAMEPLAY_LOOP.md`.
- [ ] Read `docs/REALTIME_STREAM_ARCHITECTURE.md`.
- [ ] Confirm that canonical master-plan checkboxes will remain unchanged on this branch.

## 2. Audit the partial Phase E work

- [ ] Run `git status --short`.
- [ ] Run `git diff --check`.
- [ ] Inspect the tracked Phase E diff.
- [ ] Read the untracked dungeon CSS and documentation.
- [ ] Identify which partial changes support the default simple-gameplay journey.
- [ ] Identify styling or controls that affect only the hidden legacy combat dock.
- [ ] Preserve useful partial work while removing or reshaping misleading pieces.

The partial implementation is not complete merely because it styles
`.stream-combat-dock`: the default simple-gameplay presentation deliberately
hides that legacy dock. Phase E must improve the dungeon experience players
actually see.

Do not expose Guard, Interrupt, Focus, run powers, or other tactical controls in
new simple dungeons. Those remain compatibility behavior for persisted legacy
runs.

## 3. Inspect canonical Figma states

Before every Figma `get_design_context` call, load and follow the
`figma:figma-design-to-code` skill. Use `frontend-design:frontend-design` while
translating the reference into semantic HTML and CSS.

- [ ] Inspect mobile player-flow section `42:2`.
- [ ] Inspect representative mobile frame `43:5`.
- [ ] Locate the exact nested dungeon-entry frame.
- [ ] Locate the exact normal-room frame.
- [ ] Locate the exact party-state frame.
- [ ] Locate the exact boss-state frame.
- [ ] Locate the exact failure frame.
- [ ] Locate the exact success frame.
- [ ] Inspect desktop player section `68:2` as a responsive reference only.
- [ ] Record every exact nested node ID in `docs/PRESENTATION_V2_DUNGEON.md`.
- [ ] Fetch fresh screenshots for the implementation references.

Never ship a Figma screenshot as product UI. Full desktop command and Live
Context rails remain Phase G.

## 4. Phase E acceptance contract

### PV2-E01 — Entry, readiness, and party state

- [ ] Dungeon readiness is immediately understandable.
- [ ] Starting a dungeon produces a visible player action and one concise receipt.
- [ ] Solo and party entry states remain based on authoritative read models.
- [ ] Party readiness and waiting states are readable without a separate gameplay screen.

### PV2-E02 — Room combat and persistent HP

- [ ] The active room shows dungeon/encounter identity.
- [ ] Enemy current and maximum HP are visible.
- [ ] The current player's authoritative run HP is visible.
- [ ] Both players' HP are visible when party context requires it.
- [ ] HP visibly persists across room transitions.
- [ ] Reload reconstructs the same HP instead of implying a reset.
- [ ] Attack remains the only action in a new simple dungeon.

### PV2-E03 — Boss state and sparse decisions

- [ ] Boss state is visibly distinct from an ordinary room.
- [ ] Boss HP and party HP remain readable.
- [ ] Only actions or decisions supplied by authoritative state are displayed.
- [ ] Browser code does not invent damage, phases, decisions, or outcomes.
- [ ] No permanent tactical dashboard is restored.

### PV2-E04 — Success, failure, and explicit healing

- [ ] Success produces one result-first completion/reward receipt.
- [ ] Failure produces one coherent result-first receipt.
- [ ] Routine turns do not flood the Adventure Stream.
- [ ] Detailed turn history remains behind Battle Details.
- [ ] Healing is shown only through existing authoritative Heal/recovery behavior.
- [ ] No copy or transition implies free healing between dungeon rooms.
- [ ] Heal/recovery becomes an explicit next action only after the run permits it.

### PV2-E05 — Realtime, reload, and reconnect

- [ ] A partner's committed action updates the other browser through realtime.
- [ ] Realtime refresh does not erase an unsent composer draft.
- [ ] Reload restores the same authoritative run and participant state.
- [ ] Reconnect restores the same authoritative run and participant state.
- [ ] Stream/realtime messages remain projections rather than sources of truth.

## 5. Implement the player-visible dungeon surface

Likely edit points:

- `public/simple-loop.js` — default simple-dungeon contextual presentation and controls.
- `public/adventure-stream.js` — shared stream state and compatibility presentation.
- `public/adventure-meta-commands.js` — only if existing receipt metadata needs a better projection.
- `public/ui-v2/dungeon.css` — Phase E styling under the explicit v2 player scope.
- `public/game.js` — stylesheet registration if still needed.
- `public/ui-v2/index.css` — stylesheet import if still needed.

Implementation checklist:

- [ ] Keep one actionable control source; do not duplicate Attack buttons.
- [ ] Keep the Adventure Stream dominant.
- [ ] Keep the composer visible and usable during every dungeon state.
- [ ] Keep primary controls at least 44px high.
- [ ] Preserve exact plain-word and slash-command compatibility.
- [ ] Preserve unsent composer drafts during realtime updates.
- [ ] Use semantic assets through `sprite-catalog.js`.
- [ ] Introduce no new direct `/sprites/kenney/*` paths.
- [ ] Keep HP, damage, progression, boss phases, healing, readiness, and rewards server-authoritative.
- [ ] Avoid adding an API unless a precise Figma-required read-model field is missing.
- [ ] If a read-model gap exists, document it before adding the smallest projection and focused tests.
- [ ] Leave the unresolved 42dot Sans licensing question outside Phase E.

## 6. Add focused Playwright coverage

Create `test/e2e/presentation-v2-dungeon.local.spec.js` and register it in
`playwright.simple.local.config.js`.

- [ ] Cover mobile entry/readiness and the dungeon-start receipt.
- [ ] Cover an active room at 390x844.
- [ ] Assert enemy identity and authoritative HP.
- [ ] Assert current-player HP.
- [ ] Assert both party members' HP where applicable.
- [ ] Assert Attack is the only simple-combat action.
- [ ] Assert visible primary controls are at least 44px high.
- [ ] Assert no horizontal overflow.
- [ ] Assert the composer remains usable.
- [ ] Prove HP persists across a room transition.
- [ ] Prove reload preserves the same HP.
- [ ] Cover a visually distinct boss state.
- [ ] Assert no invented tactical controls appear.
- [ ] Cover one coherent failure receipt and explicit post-run healing.
- [ ] Cover one coherent success/reward receipt.
- [ ] Cover two-browser realtime party updates.
- [ ] Prove an unsent partner message survives a realtime refresh.
- [ ] Prove reload/reconnect restores the same party run.
- [ ] Cover the same semantic system at 1440x960.
- [ ] Confirm Phase G desktop rails were not introduced.

Capture:

- [ ] `test-results/presentation-v2/dungeon-390x844.png`
- [ ] `test-results/presentation-v2/dungeon-1440x960.png`

Inspect both screenshots directly:

- [ ] No clipping or horizontal overflow.
- [ ] No obscured composer.
- [ ] No excessive empty document tail.
- [ ] No duplicate outcome copy.
- [ ] Player, partner, enemy, and boss hierarchy is scannable.
- [ ] Mobile and desktop look like one semantic system.

## 7. Verification

Run the new test first:

```powershell
npx playwright test test/e2e/presentation-v2-dungeon.local.spec.js --config=playwright.simple.local.config.js
```

- [ ] New Phase E spec passes.

Run the full simple-local suite:

```powershell
npm run test:e2e:simple-local
```

- [ ] Full simple-local suite passes.

Protect relevant existing coverage under its owning configuration:

- [ ] `presentation-v2-stream.local.spec.js` passes.
- [ ] `battle-details.local.spec.js` passes.
- [ ] `simple-loop.local.spec.js` passes.
- [ ] Two-browser party/reload coverage passes.
- [ ] Boss and failure coverage passes.
- [ ] Legacy tactical hydration/compatibility coverage passes.

Run repository gates:

```powershell
npm run check
npm test
```

- [ ] `npm run check` passes.
- [ ] `npm test` passes with no regressions.
- [ ] No tests or assertions were weakened or deleted merely to obtain green results.

## 8. Documentation and commit

Update `docs/PRESENTATION_V2_DUNGEON.md`:

- [ ] Record exact Figma node IDs.
- [ ] Describe implemented Phase E states.
- [ ] Document authoritative-state boundaries.
- [ ] Distinguish default simple-dungeon behavior from legacy tactical compatibility.
- [ ] Record test commands and results.
- [ ] Record both screenshot paths.
- [ ] Record remaining visual differences.
- [ ] Record any API/read-model gaps.

Before committing:

```powershell
git diff --check
git status --short
```

- [ ] `git diff --check` passes.
- [ ] Review the final diff for unrelated changes.
- [ ] Confirm `data/` and `ux-review/` remain untouched and uncommitted.
- [ ] Confirm generated databases and Playwright reports are not staged.
- [ ] Confirm canonical master-plan checkboxes remain unchanged.
- [ ] Commit only Phase E files with a focused message such as:

```text
PV2-E rebuild dungeon endurance presentation
```

- [ ] Do not merge or push during this assignment.
- [ ] Do not start Phase F.

## Completion report

Fill this section before handing off.

- Final commit: `______________________________`
- Files changed: `______________________________`
- Figma nodes used: `______________________________`
- Mobile screenshot: `test-results/presentation-v2/dungeon-390x844.png`
- Desktop screenshot: `test-results/presentation-v2/dungeon-1440x960.png`
- `npm run check`: `______________________________`
- `npm test`: `______________________________`
- Phase E Playwright: `______________________________`
- Other relevant Playwright suites: `______________________________`
- Remaining visual differences: `______________________________`
- API/read-model gaps: `______________________________`
- Legacy compatibility notes: `______________________________`
- Final `git status --short`: `______________________________`
- Next task, not started: `PV2-F01`
