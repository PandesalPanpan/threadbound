# Generated Sprite Atlases

Threadbound keeps generated art as source atlases under `public/assets/generated/` and crops frames in the presentation layer. Gameplay/domain services do not depend on art assets.

## Source sheets

| Atlas | Source | Layout | Runtime status |
| --- | --- | --- | --- |
| Male Weavers v1 | `threadbound-male-characters-v1.png` | 1024×127, 8×1 | Active in chat combat/status portraits |
| Female Weavers v1 | `threadbound-female-characters-v1.png` | 1024×133, 8×1 | Ready; waiting for an explicit player avatar/gender selection instead of assigning one randomly |
| Enemies v1 | `threadbound-enemies-v1.png` | 1024×283, 8×2 | Active in Hunt and dungeon chat receipts |
| Hero animation reference | `threadbound-hero-animation-reference.png` | Reference sheet | Not used as a runtime atlas |

The atlas grid is defined in `public/sprite-catalog.js`. `public/generated-sprite-presentation.js` is a presentation adapter that applies frames to the existing chat-first UI.

## Current enemy frame coverage

These mappings are intentionally explicit so existing authored enemies keep a stable visual identity:

| Enemy / boss | Frame |
| --- | ---: |
| Frayed Mite (`frayed-mite`) | 0 |
| Hollow Crow (`hollow-crow`) | 1 |
| Thread Wolf (`thread-wolf`) | 2 |
| Frayed Wisp (`frayed-wisp`) | 3 |
| Hollow Stalker (`hollow-stalker`) | 4 |
| Silkbound Guard (`silkbound-guard`) | 5 |
| Ashling (`ashling`) | 6 |
| The First Needle (`first-needle`) | 12 |
| The Ember Loomkeeper (`ember-loomkeeper`) | 13 |

Unknown ArcManifest enemies receive a deterministic frame based on their ID so generated content remains visually stable across reloads. Normal enemies use the first 12 frames; unmapped bosses use the final four frames.

## Current player coverage

Player portraits deterministically choose one of the eight male Weaver frames using the same stable player identity approach already used by the previous sprite catalog. This avoids characters changing appearance between reloads.

The female atlas is deliberately **not** assigned randomly. Once Threadbound has an explicit avatar/profile choice, that preference can select `femaleWeavers` without changing gameplay state or domain boundaries.

## Surfaces using generated art

- Hunt result receipt: generated enemy portrait and compact encounter summary.
- Rich dungeon combat receipt: generated Weaver and enemy/boss portraits beside HP bars.
- `/status` response: generated Weaver and active enemy/boss portraits.

The visual adapter is progressive enhancement. If the sprite presentation cannot load its read model, the underlying chat, commands, persistence, and realtime behavior continue to work.

## Items and equipment

There is currently **no generated equipment/item atlas committed to the repository**. Relics therefore continue to use the existing `relic.svg` fallback. Do not mark generated equipment coverage as complete until an item atlas is added and mapped.

## Adding future art

1. Add the source atlas to `public/assets/generated/`.
2. Record its dimensions/grid in `GENERATED_SPRITE_ATLASES`.
3. Add explicit stable mappings for important authored entities.
4. Leave generated/unknown entities on deterministic ID-based fallbacks where appropriate.
5. Add Playwright assertions for the surface that consumes the art.
6. Review the `ux-review` screenshots on mobile before merging.

Do not duplicate dozens of derived PNGs solely to expose frames. Keep atlas cropping inside the presentation layer unless a later performance measurement shows that pre-splitting is necessary.
