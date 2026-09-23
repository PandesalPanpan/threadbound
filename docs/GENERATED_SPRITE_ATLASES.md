# Historical Generated Sprite Atlases

> Archived. The SVG sheets remain in the repository for historical reference, but current UI code does not load or crop them. Active presentation resolves semantic IDs through [VISUAL_ASSET_ARCHITECTURE.md](VISUAL_ASSET_ARCHITECTURE.md) and `public/visual-asset-catalog.js`.

Gameplay and domain services do not depend on art assets. The legacy PNG sheets and their SVG exports are not active runtime dependencies.

## Archived source sheets

| Atlas | Source | Layout | Runtime status |
| --- | --- | --- | --- |
| Male Weavers v1 | `threadbound-male-characters-v1.svg` | 1024×127, 8×1 | Archived; not loaded by the current runtime |
| Female Weavers v1 | `threadbound-female-characters-v1.svg` | 1024×133, 8×1 | Archived; not loaded by the current runtime |
| Enemies v1 | `threadbound-enemies-v1.svg` | 1024×283, 8×2 | Archived; not loaded by the current runtime |
| Equipment v1 | `threadbound-equipment-v1.svg` | 1024×128, 8×1 | Retired; item surfaces use semantic Visual Asset Catalog IDs |
| Hero animation reference | `threadbound-hero-animation-reference.png` | Reference sheet | Not used as a runtime atlas |

`public/generated-sprite-presentation.js` remains a legacy presentation adapter, but it renders semantic catalog assets. `public/sprite-catalog.js` no longer defines atlas geometry or crops atlas frames.

## Historical enemy frame assignments

These frame assignments document the archived atlas only. Current runtime enemies resolve through the semantic visual catalog.

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

## Historical player atlas behavior

The archived presentation chose a stable male Weaver frame from player identity. Current avatars resolve through semantic character asset IDs.

## Current semantic art surfaces

- Hunt and Dungeon receipts resolve enemy and player IDs through the visual catalog.
- Gear, Shop, Codex, rewards, and loadouts resolve item IDs through the visual catalog.
- Persisted legacy item IDs use `public/item-asset-policy.js` to retain their object family while resolving to current Figma assets.

The legacy visual adapter remains progressive enhancement. If it cannot load its read model, chat, commands, persistence, and realtime behavior continue to work.

## Items and equipment

The equipment atlas fallback was removed after the semantic item catalog and legacy-ID mappings were covered by unit and browser tests. Item art now resolves through catalog IDs; the domain model stores no URLs, crop geometry, or frame indexes.

## Adding future art

Follow [VISUAL_ASSET_ARCHITECTURE.md](VISUAL_ASSET_ARCHITECTURE.md): add reviewed source art through the asset generator, use stable semantic IDs, and test the presentation surface that consumes the asset. Do not add new atlas-frame dependencies.
