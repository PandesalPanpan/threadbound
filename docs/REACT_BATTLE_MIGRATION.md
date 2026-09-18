# React Battle Simulation

The React battle surface is an authenticated projection of the existing
server-side automatic battle engine. It does not own combat formulas, HP, Mana,
targeting, rewards, or victory state.

## Authoritative flow

`GET /api/battle-simulation` returns a deterministic preview. `POST
/api/battle-simulation` returns the same server-owned battle payload for the
focused replay. `BattleSimulationService` selects the canonical 3v3 roster and
delegates resolution to `AutomaticBattleSimulator`; `AutomaticBattleReadModel`
projects the concise result receipt and expandable turn details.

The browser indexes `BattleStarted`, `SkillCastStarted`, `BasicAttackStarted`,
and `TurnResolved` events. It animates the action phase and then replaces the
displayed collection with the next committed `TurnResolved.combatants`
snapshot. It never derives damage from Attack, Defense, or Mana. A reload uses
the same authoritative GET projection and returns to the committed result.

## Figma source of truth

The inspected Figma file is `xfAbc94dv0LxhxhC9q9BhK`, page node `91:2`.
Reference nodes are:

- `115:3` — Pre-Battle
- `115:199` — Live Battle
- `127:2` — Attack Impact
- `115:395` — Skill Cast
- `115:601` — Result

Canonical artwork is exported from the source nodes and committed under
`public/assets/runtime/threadbound-figma-*.v1.svg`. The asset generator emits
hashed WebP runtime files and semantic catalog entries. The React registry in
`frontend/src/battle/visuals.js` maps each stable ID to its source node:

| Unit | Stable visual asset ID | Source node |
| --- | --- | --- |
| Bramble Druid | `character.bramble-druid-figma.v1` | `112:7` |
| Iron Vanguard | `character.iron-vanguard-figma.v1` | `112:12` |
| Rune Bard | `character.rune-bard-figma.v1` | `112:17` |
| Cinder Imp | `mob.cinder-imp-figma.v1` | `112:22` |
| Rot Toad | `mob.rot-toad-figma.v1` | `112:27` |
| Gloom Hound | `mob.gloom-hound-figma.v1` | `112:32` |

Presentation resolves these IDs through `/api/visual-assets`; no direct legacy
sprite path or CSS/emoji stand-in is used for the canonical units.

## Surface behavior

- Pre-Battle presents the six exported roster artworks and a single start action.
- Live Battle keeps enemy units above the threadline and player units below it.
- Attack Impact and Skill Cast animate the acting unit, target recoil, impact
  flash, HP transition, Mana meter, and floating numeric delta.
- Skills are shown only when the server event stream says they were ready and
  cast. Auto-casting is resolved by the domain policy at the Mana threshold.
- Result shows one concise receipt first; turn-by-turn summaries stay behind
  the Battle Details disclosure.
- Play, Codex, and Arc Workshop are the only battle navigation links. Arc
  Workshop is rendered only when the dashboard capability allows it.

## Verification

`test/battle-simulation-service.test.js` verifies the 3v3 projection, Figma
metadata, six stable asset IDs, skill/Mana events, and the non-mutating boundary.
`test/e2e/react-battle.local.spec.js` covers the 390×844 flow, canonical art,
event replay, Battle Details, reload recovery, and the 1440×960 layout.
