# Town foundation (M6-01 / M6-02 / M6-03)

M6-01 introduces Town as an Area-owned world hub. M6-02 projects that authoritative hub and its neutral NPC identities as a rich Adventure Stream card using the generated character asset system. M6-03 adds server-authoritative NPC dialogue interactions that publish one concise shared stream receipt, without pulling Quest, profession, simulated-adventurer, service-mutation, or Arc-expansion work forward.

## Boundary

- `src/domain/Town.js` is the immutable Domain Model for stable Town identity, owning Area, allowlisted service capabilities, and stable NPC identity references.
- A Town belongs to exactly one Area. It does not own player position; `AreaProgression` remains authoritative for the player's current/highest-unlocked Area.
- `src/content/TownCatalog.js` is the neutral content catalog. The foundation contains only `area-1-town` plus generic service NPC identities and constrained neutral dialogue lines; it intentionally does not invent a named Arc, lore questline, or new currency.
- `src/application/TownService.js` is the Town Service Layer boundary. Reads expose only Towns owned by the player's persisted current Area. `interact()` revalidates current-Area Town availability and NPC residency before publishing one `NpcInteracted` domain event. Looking up an unavailable Town fails closed with `town_unavailable`; interacting with an unknown/non-resident NPC fails with `npc_unavailable`.
- `AreaService.browse()` composes the same current-Area Town read projection into the existing `/api/areas` response so the chat presentation can render Town availability without moving location/catalog rules into browser code.
- Town services are constrained data (`shop`, `upgrade`, `bank`, `heal`, `quest`, `cook`, `craft`, `guild_hall`). NPC dialogue does not silently execute those services. Existing authoritative Shop/Inventory/Bank/Heal boundaries remain responsible for their own mutations.
- `ActivityStreamService` is presentation projection only: a committed `NpcInteracted` fact becomes one concise shared Adventure Stream receipt. The stream is not a source of Town legality or dialogue identity.

## Chat presentation

`public/town-rich-card.js` intercepts the plain `town` / `/town` command and opens the Town/NPC card inside the existing Adventure Stream command-card surface. It does not create a Town page or alternate app shell.

The card renders only the server-returned Town for the player's current Area, its service capabilities, and its projected NPC residents. NPC portraits use `weaverSpriteFrame()` and `createSpriteElement()` from `public/sprite-catalog.js`, which resolve through generated semantic character assets rather than adding direct legacy `/sprites/kenney/*` paths.

M6-03 adds a 44px-minimum `Talk` action for each projected resident. A Talk action posts the stable Town/NPC identities back to Threadbound; the server revalidates them and the resulting domain event is broadcast as the shared receipt. Typed `talk <NPC>` and `speak <NPC>` (with optional leading slash) are convenience aliases that resolve only against the authoritative current Town projection before invoking the same endpoint. They are not separate gameplay implementations.

Historical Town cards continue to collapse through the reusable rich-card snapshot boundary just like Area, Inventory, Shop, Bank, and Profile.

## Ordered deferrals

- M6-04 onward owns Quest state and objective behavior.
- NPC service mutations remain with the relevant authoritative service/card flows rather than being duplicated inside Town dialogue.
- Later phases own generated Town stock/professions, simulated guild adventurers, and new Arc content.

No tactical dashboard, new headline currency, or HUMAN playtest gate is introduced here.

## Verification

`test/town-foundation.test.js` proves Town validation/immutability, constrained service/NPC references, stable Area association, neutral catalog lookup, server-owned NPC projection, authoritative interaction validation, exactly one `NpcInteracted` publication, and failure when either the Town or NPC is unavailable in the persisted current Area.

`test/activity-stream.test.js` proves one `NpcInteracted` fact becomes one concise persisted system receipt with NPC attribution and the authoritative dialogue metadata.

`test/e2e/area-rich-card.spec.js` includes the Town journey at 390x844 and proves that `town` opens inside the Adventure Stream, generated character assets back the four NPC portraits, Talk controls remain mobile-sized, a Talk click creates exactly one shared stream entry with server dialogue, invalid NPC IDs are rejected, and typed `talk Banker` reaches the same receipt path. The test writes `ux-review/town-rich-card-mobile.png` for visual inspection.

Required repository gates remain `npm run check`, `npm test`, and the active Chromium Playwright suites.

## Handoff

After M6-03 is merged and green on `main`, continue M6-04 by introducing the Quest domain/service/repository model. Keep Quest rules server-authoritative and do not turn NPC dialogue or the Town card into an alternate source of Quest state.
