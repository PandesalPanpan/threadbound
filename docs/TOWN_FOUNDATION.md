# Town foundation (M6-01)

M6-01 introduces Town as an Area-owned world hub without pulling later NPC presentation, dialogue, Quest, profession, simulated-adventurer, or Arc-expansion work forward.

## Boundary

- `src/domain/Town.js` is the immutable Domain Model for stable Town identity, owning Area, allowlisted service capabilities, and stable NPC identity references.
- A Town belongs to exactly one Area. It does not own player position; `AreaProgression` remains authoritative for the player's current/highest-unlocked Area.
- `src/content/TownCatalog.js` is the neutral content catalog. The foundation contains only `area-1-town`; it intentionally does not invent a named Arc, lore, questline, or new currency.
- `src/application/TownService.js` is the Service Layer read boundary. It reads the player's persisted current Area and exposes only Towns owned by that Area. Looking up a Town outside the current Area fails closed with `town_unavailable`.
- Town services are constrained data (`shop`, `upgrade`, `bank`, `heal`, `quest`, `cook`, `craft`, `guild_hall`). They do not execute economy or gameplay mutations themselves; the existing authoritative services remain responsible for those transactions.

## Ordered deferrals

- M6-02 owns the Town/NPC rich card and generated sprite presentation inside the Adventure Stream.
- M6-03 owns NPC dialogue/interaction receipts.
- M6-04 onward owns Quest state and objective behavior.
- Later phases own generated Town stock/professions, simulated guild adventurers, and new Arc content.

No Town page, tactical dashboard, or alternate application shell is introduced here.

## Verification

`test/town-foundation.test.js` proves Town validation/immutability, constrained service/NPC references, stable Area association, neutral catalog lookup, and that `TownService` follows authoritative current-Area persistence rather than browser-provided location state.

Required repository gates remain `npm run check`, `npm test`, and the active Chromium Playwright suites. Because M6-01 has no presentation change, it does not require a new mobile screenshot baseline.

## Handoff

After this foundation is merged and green, continue M6-02 by projecting the authoritative Town/NPC read model as a rich Adventure Stream card. Keep all Town interactions chat-first and leave NPC mutation/dialogue semantics to M6-03.
