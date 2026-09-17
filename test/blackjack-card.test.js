import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { BLACKJACK_CARD_BACK_ASSET, blackjackCardDetails } from '../public/blackjack-card.js';

test('Blackjack card details preserve dynamic ranks and suit color semantics', () => {
  assert.deepEqual(blackjackCardDetails('10h'), {
    code: '10H',
    rank: '10',
    suitCode: 'H',
    symbol: '♥',
    name: 'Hearts',
    red: true,
    label: '10 of Hearts',
  });
  assert.equal(blackjackCardDetails('as').symbol, '♠');
  assert.equal(blackjackCardDetails('as').red, false);
  assert.equal(blackjackCardDetails('').rank, '?');
});

test('Blackjack card back points to the committed Figma export', () => {
  const assetPath = path.resolve('public', `.${BLACKJACK_CARD_BACK_ASSET.src}`);
  assert.equal(BLACKJACK_CARD_BACK_ASSET.figmaNodeId, '44:567');
  assert.equal(BLACKJACK_CARD_BACK_ASSET.width, 46);
  assert.equal(BLACKJACK_CARD_BACK_ASSET.height, 62);
  assert.match(BLACKJACK_CARD_BACK_ASSET.src, /blackjack-card-back\.[a-f0-9]{12}\.png$/);
  assert.equal(existsSync(assetPath), true);
});
