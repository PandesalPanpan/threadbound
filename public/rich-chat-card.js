import './shop-rich-card.js';
import './inventory-rich-card.js';
import './profile-rich-card.js';

const DEFAULT_ACTION_GROUP_SELECTOR = '.thread-card-actions, .thread-gear-actions, .thread-party-join, .thread-shop-shelf, .thread-codex-search';

function commandFromCard(card) {
  const kicker = card.querySelector('.thread-reply-header > div > span')?.textContent || '';
  const slashIndex = kicker.lastIndexOf('/');
  if (slashIndex >= 0) {
    const candidate = kicker.slice(slashIndex + 1).trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (candidate) return candidate;
  }
  if (card.dataset.shopRichCard === 'true') return 'shop';
  if (card.dataset.inventoryRichCard === 'true') return 'inventory';
  if (card.dataset.profileRichCard === 'true') return 'profile';
  return card.dataset.richCardKind || 'panel';
}

function titleFromCard(card) {
  return card.querySelector('.thread-reply-header strong')?.textContent?.trim() || 'Threadbound panel';
}

export function decorateRichChatCard(card, { command = null } = {}) {
  if (!card) return null;
  const parsedKind = command || commandFromCard(card);
  const canonicalKind = parsedKind === 'shop'
    ? 'shop'
    : ['inventory', 'gear'].includes(parsedKind)
      ? 'inventory'
      : parsedKind;
  const title = titleFromCard(card);
  card.classList.add('rich-chat-card');
  card.dataset.richCardKind = canonicalKind;
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', `${title} panel`);

  const header = card.querySelector('.thread-reply-header');
  header?.classList.add('rich-chat-card-header');
  const close = card.querySelector('.thread-reply-close');
  if (close) {
    close.classList.add('rich-chat-card-dismiss');
    close.dataset.richCardDismiss = 'true';
  }

  for (const group of card.querySelectorAll(DEFAULT_ACTION_GROUP_SELECTOR)) {
    group.classList.add('rich-chat-card-actions');
  }
  for (const button of card.querySelectorAll('button')) {
    if (button === close) continue;
    button.classList.add('rich-chat-card-action');
    button.dataset.richCardAction = 'true';
  }
  return card;
}

export function createRichChatCard({ documentRef = document, command, title, subtitle = '', onDismiss = null } = {}) {
  if (!command || !title) throw new Error('Rich chat cards require a command and title.');
  const card = documentRef.createElement('section');
  card.className = 'stream-command-card';
  const header = documentRef.createElement('div');
  header.className = 'thread-reply-header';
  const copy = documentRef.createElement('div');
  const kicker = documentRef.createElement('span');
  kicker.textContent = `PRIVATE THREAD REPLY · /${command}`;
  const heading = documentRef.createElement('strong');
  heading.textContent = title;
  copy.append(kicker, heading);
  if (subtitle) {
    const small = documentRef.createElement('small');
    small.textContent = subtitle;
    copy.append(small);
  }
  const close = documentRef.createElement('button');
  close.type = 'button';
  close.className = 'thread-reply-close';
  close.setAttribute('aria-label', `Dismiss ${title} panel`);
  close.textContent = '×';
  if (onDismiss) close.addEventListener('click', onDismiss);
  header.append(copy, close);
  card.append(header);
  return decorateRichChatCard(card, { command });
}

export function createRichChatCardAction({ documentRef = document, label, onAction, testId = null, className = '', disabled = false } = {}) {
  if (!label) throw new Error('Rich chat card actions require a label.');
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.disabled = disabled;
  button.className = className;
  button.classList.add('rich-chat-card-action');
  button.dataset.richCardAction = 'true';
  if (testId) button.dataset.testid = testId;
  if (onAction) button.addEventListener('click', onAction);
  return button;
}

function installStyles(documentRef) {
  if (documentRef.querySelector('[data-rich-chat-card-styles]')) return;
  const style = documentRef.createElement('style');
  style.dataset.richChatCardStyles = 'true';
  style.textContent = `
    .rich-chat-card { display:grid; gap:10px; }
    .rich-chat-card > .rich-chat-card-header { margin-bottom:0; }
    .rich-chat-card-actions { min-width:0; }
    .rich-chat-card-action { min-height:44px; }
    .rich-chat-card-dismiss { flex:0 0 auto; }
    @media (max-width:720px) {
      .rich-chat-card { gap:9px; }
      .rich-chat-card-action { min-height:44px; }
    }
  `;
  documentRef.head.append(style);
}

export function installRichChatCardCompatibility({ documentRef = document } = {}) {
  const stream = documentRef.querySelector('#stream');
  if (!stream) return () => {};
  installStyles(documentRef);

  let scheduled = false;
  const decorateCurrent = () => {
    scheduled = false;
    const card = stream.querySelector('[data-testid="stream-command-card"]');
    if (card && !card.hidden && card.childElementCount > 0) decorateRichChatCard(card);
  };
  const scheduleDecoration = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(decorateCurrent);
  };
  const observer = new MutationObserver(scheduleDecoration);
  observer.observe(stream, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  scheduleDecoration();
  return () => observer.disconnect();
}

if (typeof document !== 'undefined') {
  const uninstall = installRichChatCardCompatibility();
  window.addEventListener('beforeunload', uninstall, { once: true });
}
