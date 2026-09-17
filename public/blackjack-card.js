// Presentation-only Blackjack card component.
//
// Figma node 44:507 draws the card faces as ordinary frame/text layers, so the
// face stays dynamic here and can represent every server-dealt card. The
// THREAD card back is a direct export of Figma node 44:567 and is committed
// locally so the runtime never depends on an expiring Figma URL.
export const BLACKJACK_CARD_BACK_ASSET = Object.freeze({
  id: 'ui.blackjack-card-back.figma-v1',
  src: '/assets/runtime/blackjack-card-back.6ab5c2eb53e6.png',
  width: 46,
  height: 62,
  figmaNodeId: '44:567',
});

const SUITS = Object.freeze({
  C: Object.freeze({ symbol: '♣', name: 'Clubs', red: false }),
  D: Object.freeze({ symbol: '♦', name: 'Diamonds', red: true }),
  H: Object.freeze({ symbol: '♥', name: 'Hearts', red: true }),
  S: Object.freeze({ symbol: '♠', name: 'Spades', red: false }),
});

export function blackjackCardDetails(cardCode) {
  const code = String(cardCode || '').trim().toUpperCase();
  const suitCode = code.slice(-1);
  const rank = code.slice(0, -1) || '?';
  const suit = SUITS[suitCode] || { symbol: '•', name: 'unknown suit', red: false };
  return Object.freeze({
    code,
    rank,
    suitCode: SUITS[suitCode] ? suitCode : '',
    symbol: suit.symbol,
    name: suit.name,
    red: suit.red,
    label: `${rank} of ${suit.name}`,
  });
}

function setTestId(element, testId) {
  if (testId) element.dataset.testid = testId;
  return element;
}

function createBackElement(testId) {
  const card = setTestId(document.createElement('div'), testId);
  card.className = 'blackjack-playing-card blackjack-card-back';
  card.dataset.blackjackCard = 'true';
  card.dataset.cardKind = 'back';
  card.dataset.blackjackAssetId = BLACKJACK_CARD_BACK_ASSET.id;
  card.setAttribute('role', 'img');
  card.setAttribute('aria-label', 'Hidden dealer card');

  const image = document.createElement('img');
  image.className = 'blackjack-card-back-image';
  image.src = BLACKJACK_CARD_BACK_ASSET.src;
  image.width = BLACKJACK_CARD_BACK_ASSET.width;
  image.height = BLACKJACK_CARD_BACK_ASSET.height;
  image.alt = '';
  image.draggable = false;
  image.setAttribute('aria-hidden', 'true');
  card.append(image);
  return card;
}

export function createBlackjackCard(cardCode, { hidden = false, testId = null } = {}) {
  if (hidden) return createBackElement(testId);

  const details = blackjackCardDetails(cardCode);
  const card = setTestId(document.createElement('div'), testId);
  card.className = `blackjack-playing-card${details.red ? ' is-red' : ''}`;
  card.dataset.blackjackCard = 'true';
  card.dataset.cardKind = 'face';
  card.dataset.cardCode = details.code;
  card.dataset.cardRank = details.rank;
  card.dataset.cardSuit = details.suitCode;
  card.setAttribute('role', 'img');
  card.setAttribute('aria-label', details.label);
  card.append(
    Object.assign(document.createElement('strong'), {
      className: 'blackjack-card-rank',
      textContent: details.rank,
    }),
    Object.assign(document.createElement('span'), {
      className: 'blackjack-card-suit',
      textContent: details.symbol,
    }),
  );
  return card;
}
