# Item rarity foundation

Status: **M1-06 implementation candidate; mark complete only after merge and green post-merge main CI.**

## Canonical contract

`ItemRarityPolicy` owns the ordered equipment rarity vocabulary:

1. Common
2. Uncommon
3. Rare
4. Epic
5. Legendary
6. Mythic

The policy owns tier numbers, labels, generated Attack bands, validation helpers, and generated-reward roll boundaries. Item generation consumes this policy instead of defining a second rarity table.

Mythic is deliberately a very small top reward band. Adding it does not introduce a new wallet, crafting material, or tactical mechanic.

## Compatibility

Existing Common through Legendary IDs and tier numbers remain unchanged. Legacy persisted items therefore retain the same rarity identity and upgrade behavior. Mythic uses the existing three-level Upgrade ceiling for now; M1-06 does not redesign Upgrade balance.

Hunt's existing Rare cap remains unchanged, so routine Hunt cannot suddenly bypass progression with Mythic drops. Higher rarity generation remains available to reward paths that already use the uncapped item generator.

The current Arc Manifest v1 schema remains a legacy content contract and still stops at Legendary. Expanding generated Arc equipment belongs to the ordered Arc Manifest vNext work in Phase 10; foundation work must not jump ahead by changing world-generation scope now.

## Presentation

`rarity-presentation.js` is a Presentation Model enhancement loaded through the existing generated-art module graph. It establishes the six-tier browser presentation contract and gives Mythic the same semantic `rarity-*` treatment already used by Inventory/reward cards. It also repairs tier badges from the canonical rarity ID so persisted items do not depend on a separately stored browser tier.

The Adventure Stream remains the primary shell. No dashboard or new screen is introduced.

## Verification

- Domain tests assert the exact six-tier ordering, labels, tier numbers, roll boundaries, Mythic generation, Upgrade compatibility, and salvage policy.
- Active Chromium Playwright coverage asserts the six-tier presentation module loads on the real mobile game route, the primary chat shell stays intact, and a Mythic rich card receives tier-6 semantics/styling.

## Handoff

After green merge/main CI, reconcile **M1-06** as complete in `docs/THREADBOUND_MASTER_PLAN.md`. The next earliest dependency-satisfied task is **M1-07**: preserve Honey as externally Threaded-owned premium currency and prove local mode cannot mutate it.
