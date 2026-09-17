const RICH_CARD_METADATA_KEYS = Object.freeze([
  'richCardKind',
  'shopRichCard',
  'inventoryRichCard',
  'profileRichCard',
  'bankRichCard',
  'areaRichCard',
  'townRichCard',
  'questRichCard',
  'leaderboardRichCard',
  'simulatedProfileRichCard',
  'inventoryRichRendering',
  'simpleDungeonSurface',
  'dungeonState',
  'gamblingRichCard',
  'gamblingView',
  'gamblingRoundId',
]);

/** Clear the previous renderer's identity before a shared command card is reused. */
export function resetRichCardMetadata(card) {
  if (!card) return;
  for (const key of RICH_CARD_METADATA_KEYS) delete card.dataset[key];
}
