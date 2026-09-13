# Town foundation (M6-01 / M6-02)

M6-01 introduces Town as an Area-owned world hub. M6-02 projects that authoritative hub and its neutral NPC identities as a rich Adventure Stream card using the generated character asset system, without pulling later dialogue, Quest, profession, simulated-adventurer, or Arc-expansion work forward.

## Boundary

- `src/domain/Town.js` is the immutable Domain Model for stable Town identity, owning Area, allowlisted service capabilities, and stable NPC identity references.
- A Town belongs to exactly one Area. It does not own player position; `AreaProgression` remains authoritative for the player's current/highest-unlocked Area.
- `src/content/TownCatalog.js` is the neutral content catalog. The foundation contains only `area-1-town` plus generic service NPC identities; it intentionally does not invent a named Arc, lore, questline, or new currency.
- `src/application/TownService.js` is the Town Service Layer read boundary. It reads the player's persisted current Area and exposes only Towns owned by that Area, including constrained NPC presentation data. Looking up a Town outside the current Area fails closed with `town_unavailable`.
- `AreaService.browse()` composes the same current-Area Town read projection into the existing `/api/areas` response so the chat presentation can render Town availability without moving location/catalog rules into browser code.
- Town services are constrained data (`shop`, `upgrade`, `bank`, `heal`, `quest`, `cook`, `craft`, `guild_hall`). They do not execute economy or gameplay mutations themselves; the existing authoritative services remain responsible for those transactions.

## M6-02 chat presentation

`public/town-rich-card.js` intercepts the plain `town` / `/town` command and opens the Town/NPC card inside the existing Adventure Stream command-card surface. It does not create a Town page or alternate app shell.

The card renders only the server-returned Town for the player's current Area, its service capabilities, and its projected NPC residents. NPC portraits use `weaverSpriteFrame()` and `createSpriteElement()` from `public/sprite-catalog.js`, which resolve through the generated semantic character assets rather than adding direct legacy `/sprites/kenney/*` paths.

The card is intentionally read-only in M6-02. It does not synthesize NPC interaction receipts or mutate Shop/Upgrade/Bank/Heal state; M6-03 owns dialogue/interaction commands. Historical Town cards collapse through the reusable rich-card snapshot boundary just like Area, Inventory, Shop, Bank, and Profile.

## Ordered deferrals

- M6-03 owns NPC dialogue/interaction receipts in the shared stream.
- M6-04 onward owns Quest state and objective behavior.
- Later phases own generated Town stock/professions, simulated guild adventurers, and new Arc content.

No tactical dashboard, new headline currency, or HUMAN playtest gate is introduced here.

## Verification

`test/town-foundation.test.js` proves Town validation/immutability, constrained service/NPC references, stable Area association, neutral catalog lookup, server-owned NPC projection, and that both `TownService` and the Area read composition follow authoritative current-Area persistence rather than browser-provided location state.

`test/e2e/area-rich-card.spec.js` includes the M6-02 mobile journey at 390x844 and proves that `town` opens inside the Adventure Stream, the server-projected Area 1 Town and four neutral service NPCs render, generated character assets back the NPC portraits, legacy primary terminology is absent, the card does not overflow horizontally, and the dismiss target remains at least 44x44 CSS pixels. The test writes `ux-review/town-rich-card-mobile.png` for visual inspection.

Required repository gates remain `npm run check`, `npm test`, and the active Chromium Playwright suites.

## Handoff

After M6-02 is merged and green on `main`, continue M6-03 by adding NPC dialogue/interaction receipts through the same shared Adventure Stream. Keep mutations in existing authoritative services and make each explicit NPC interaction produce one concise coherent receipt rather than turning the Town card into a silent dashboard.
