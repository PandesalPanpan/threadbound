import './shop-rich-card.js';
import './inventory-rich-card.js';
import './profile-rich-card.js';
import './bank-rich-card.js';
import './bank-profile-sync.js';

const DEFAULT_ACTION_GROUP_SELECTOR = '.thread-card-actions, .thread-gear-actions, .thread-party-join, .thread-shop-shelf, .thread-codex-search, .thread-bank-transfer';

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
  if (card.dataset.bankRichCard === 'true') return 'bank';
  return card.dataset.richCardKind || 'panel';
}

function titleFromCard(card) {
  return card.querySelector('.thread-reply-header strong')?.textContent?.trim() || 'Threadbound panel';
}

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function firstText(card, selector) {
  return compactText(card.querySelector(selector)?.textContent || '');
}

function snapshotDetails(card, kind) {
  if (kind === 'inventory') {
    const itemCount = card.querySelectorAll('[data-testid="inventory-rich-item"]').length;
    const attack = firstText(card, '[data-testid="inventory-rich-stat-attack"]');
    const defense = firstText(card, '[data-testid="inventory-rich-stat-defense"]');
    return [`${itemCount} item${itemCount === 1 ? '' : 's'}`, attack, defense].filter(Boolean).join(' · ');
  }
  if (kind === 'bank') {
    return [
      firstText(card, '[data-testid="bank-carried-gold"]'),
      firstText(card, '[data-testid="bank-banked-gold"]'),
    ].filter(Boolean).join(' · ');
  }
  if (kind === 'profile') {
    return [
      firstText(card, '[data-testid="profile-xp"]'),
      firstText(card, '[data-testid="profile-gold"]'),
    ].filter(Boolean).join(' · ');
  }
  if (kind === 'shop') {
    const offers = card.querySelectorAll('[data-testid="shop-rich-offer"], .thread-shop-offer').length;
    const balance = firstText(card, '[data-testid="shop-gold-balance"], [data-testid="shop-balance"]');
    return [offers ? `${offers} offer${offers === 1 ? '' : 's'}` : '', balance].filter(Boolean).join(' · ');
  }
  const subtitle = compactText(card.querySelector('.thread-reply-header small')?.textContent || '');
  return subtitle;
}

function snapshotModel(card) {
  if (!card || card.hidden || !card.childElementCount) return null;
  const kind = card.dataset.richCardKind || commandFromCard(card);
  const title = titleFromCard(card);
  return {
    kind,
    title,
    details: snapshotDetails(card, kind),
    signature: `${kind}:${title}`,
  };
}

export function createHistoricalRichCardSnapshot(model, { documentRef = document } = {}) {
  if (!model) return null;
  const row = documentRef.createElement('article');
  row.className = 'stream-entry stream-entry-system rich-card-history-snapshot';
  row.dataset.testid = 'rich-card-history-snapshot';
  row.dataset.richCardKind = model.kind;
  row.setAttribute('aria-label', `${model.title} historical snapshot`);

  const avatar = documentRef.createElement('span');
  avatar.className = 'stream-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = '✦';

  const content = documentRef.createElement('div');
  content.className = 'stream-entry-content';
  const summary = documentRef.createElement('p');
  summary.className = 'rich-card-history-summary';
  const title = documentRef.createElement('strong');
  title.textContent = `${model.title} viewed`;
  summary.append(title);
  if (model.details) summary.append(documentRef.createTextNode(` · ${model.details}`));
  content.append(summary);
  row.append(avatar, content);
  return row;
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
    .rich-card-history-snapshot { min-height:0; opacity:.82; }
    .rich-card-history-snapshot .stream-avatar { width:30px; height:30px; min-width:30px; font-size:.78rem; }
    .rich-card-history-summary { margin:0; color:var(--muted); font-size:.72rem; line-height:1.4; }
    .rich-card-history-summary strong { color:var(--text); font-weight:800; }
    .threadbound-player #stream .rich-chat-card .rich-chat-card-dismiss {
      width:44px !important;
      min-width:44px !important;
      height:44px !important;
      min-height:44px !important;
      flex:0 0 44px;
    }
    @media (max-width:720px) {
      .rich-chat-card { gap:9px; }
      .rich-chat-card-action { min-height:44px; }
      .rich-card-history-snapshot { padding-block:7px; }
      .rich-card-history-summary { font-size:.68rem; }
    }
  `;
  documentRef.head.append(style);
}

export function installRichChatCardCompatibility({ documentRef = document } = {}) {
  const stream = documentRef.querySelector('#stream');
  if (!stream) return () => {};
  installStyles(documentRef);

  const log = stream.querySelector('[data-testid="adventure-stream-log"]');
  let activeSnapshot = null;
  let scheduled = false;
  const decorateCurrent = () => {
    scheduled = false;
    const card = stream.querySelector('[data-testid="stream-command-card"]');
    if (!card || card.hidden || card.childElementCount === 0) return;
    decorateRichChatCard(card);
    const nextSnapshot = snapshotModel(card);
    if (!nextSnapshot) return;
    if (activeSnapshot && activeSnapshot.signature !== nextSnapshot.signature && log) {
      const historical = createHistoricalRichCardSnapshot(activeSnapshot, { documentRef });
      if (historical) {
        log.querySelector('[data-testid="stream-empty"]')?.remove();
        log.classList.remove('is-empty');
        log.append(historical);
        log.scrollTop = log.scrollHeight;
      }
    }
    activeSnapshot = nextSnapshot;
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
