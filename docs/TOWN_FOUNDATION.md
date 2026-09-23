# Towns and NPC interactions

Status: **Four Area Towns, contextual NPC dialogue, and Quest-connected interactions are implemented and branch-verified. Delivery remains pending merge and green `main` CI.**

`src/domain/Town.js` owns immutable Town identity, Area association, service
capabilities, and resident NPC references. `src/content/TownCatalog.js`
provides Town and NPC data. `TownService` validates the player's persisted
current Area, selects constrained dialogue, and publishes one authoritative
NPC-interaction event. The Activity Stream projects that event as a shared
receipt.

## World content

The catalog covers Bellbloom (Area 1), Emberglass Waystation (Area 2),
Kitewatch (Area 3), and Mirrorfen Waystation (Area 4), with 18 authored
service and background NPCs. Residents use stable IDs and semantic character
art. Service capabilities describe where existing Shop, Upgrade, Heal, Bank,
and Guild Hall flows are available; an NPC conversation does not itself
execute those services.

Background NPCs provide local context, rumors, and relevant Quest leads
without requiring a separate service. Dialogue is authored in constrained
pools and selected on the server from safe current context, including Area,
unlocked frontier, and Quest history. Selection is stable for replay and tests;
the browser does not invent or randomly choose lore.

## Authoritative boundary

- A Town belongs to one Area; Area progression owns player location/unlocks.
- `TownService.browse()` returns only the Town for the player's current Area.
- `TownService.interact()` revalidates Area, Town, and NPC residency before
  publishing `NpcInteracted`.
- `AreaService` composes the available Town and the locked-frontier/challenge
  explanation into the Area read model.
- NPC dialogue can introduce an Area-local Quest. Quest availability,
  acceptance, progress, and rewards remain owned by `QuestService`.
- Service mutations remain with their existing server commands and services.
- The event and realtime update are projections; persisted Town/Area/Quest
  state remains authoritative.

Unavailable Towns or nonresident NPC IDs fail closed. A valid interaction
produces one shared receipt and can advance matching `speak` or `visit` Quest
objectives from the authoritative event.

## Chat presentation

`town` / `/town` opens the Town/NPC card inside the Adventure Stream rather
than navigating to a separate page. Each resident has a tappable Talk action;
typed `talk <NPC>` and `speak <NPC>` shortcuts reach the same endpoint. The
card uses generated semantic character art and collapses into the shared
historical-card pattern when it is no longer current.

## Verification

`test/town-foundation.test.js` covers Town/NPC definitions, Area authorization,
contextual deterministic dialogue, one-event publication, and unavailable
identities. `test/quest-objectives.test.js` covers NPC-triggered Quest progress.
The Area/Town Playwright journey covers the in-stream card, Talk receipts,
semantic portraits, and mobile target sizing. Combined delivery also checks
the current mobile/desktop React surfaces and reconnect behavior.

Keep NPC rules and context selection in the server service/catalog boundary.
Do not introduce browser-side randomized lore or a separate private Town page.
