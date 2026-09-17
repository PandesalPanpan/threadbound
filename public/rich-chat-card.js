import './shop-rich-card.js';
import './inventory-rich-card.js';
import './profile-rich-card.js';
import './bank-rich-card.js';
import './area-rich-card.js';
import './town-rich-card.js';
import './quest-rich-card.js';
import './leaderboard-rich-card.js';
import './bank-profile-sync.js';
import './rich-card-visual-polish.js';

const DEFAULT_ACTION_GROUP_SELECTOR = '.thread-card-actions, .thread-gear-actions, .thread-party-join, .thread-shop-shelf, .thread-codex-search, .thread-bank-transfer, .thread-area-list, .thread-town-npcs, .thread-quest-list, .thread-leaderboard-actions';
const CANONICAL_RICH_CARD_KINDS = new Set(['shop', 'inventory', 'profile', 'bank', 'area', 'town', 'quest', 'leaderboard', 'simulated-profile']);
const MAX_HISTORICAL_RICH_CARDS = 12;

function commandFromCard(card) {
  const kicker = card.querySelector('.thread-reply-header > div > span')?.textContent || '';
  const slashIndex = kicker.lastIndexOf('/');
  if (slashIndex >= 0) {
    const candidate = kicker.slice(slashIndex + 1).trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (candidate) return candidate === 'adventurer-profile' ? 'simulated-profile' : candidate;
  }
  if (CANONICAL_RICH_CARD_KINDS.has(card.dataset.richCardKind)) return card.dataset.richCardKind;
  for (const kind of CANONICAL_RICH_CARD_KINDS) {
    if (card.dataset[`${kind}RichCard`] === 'true') return kind;
  }
  return card.dataset.richCardKind || 'panel';
}

function titleFromCard(card) {
  return card.querySelector('.thread-reply-header strong')?.textContent?.trim()
    || (card.dataset.richCardKind === 'blackjack' || card.dataset.gamblingRichCard === 'true' ? 'Blackjack' : 'Threadbound panel');
}

function compactText(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function firstText(card, selector) { return compactText(card.querySelector(selector)?.textContent || ''); }

function snapshotDetails(card, kind) {
  if (kind === 'inventory') {
    const itemCount = card.querySelectorAll('[data-testid="inventory-rich-item"]').length;
    return [`${itemCount} item${itemCount === 1 ? '' : 's'}`, firstText(card, '[data-testid="inventory-rich-stat-attack"]'), firstText(card, '[data-testid="inventory-rich-stat-defense"]')].filter(Boolean).join(' · ');
  }
  if (kind === 'bank') return [firstText(card, '[data-testid="bank-carried-gold"]'), firstText(card, '[data-testid="bank-banked-gold"]')].filter(Boolean).join(' · ');
  if (kind === 'profile') return [firstText(card, '[data-testid="profile-xp"]'), firstText(card, '[data-testid="profile-gold"]')].filter(Boolean).join(' · ');
  if (kind === 'simulated-profile') return [firstText(card, '[data-testid="simulated-profile-name"]'), firstText(card, '[data-testid="simulated-profile-level"]') ? `Lv ${firstText(card, '[data-testid="simulated-profile-level"]')}` : '', firstText(card, '[data-testid="simulated-profile-area"]') ? `Area ${firstText(card, '[data-testid="simulated-profile-area"]')}` : '', firstText(card, '[data-testid="simulated-profile-duels"]') ? `Duels ${firstText(card, '[data-testid="simulated-profile-duels"]')}` : ''].filter(Boolean).join(' · ');
  if (kind === 'area') return [firstText(card, '[data-testid="area-current"]'), firstText(card, '[data-testid="area-highest-unlocked"]')].filter(Boolean).join(' · ');
  if (kind === 'town') {
    const town = firstText(card, '[data-testid="town-name"]') || firstText(card, '[data-testid="town-empty"]');
    const residents = card.querySelectorAll('[data-testid^="town-npc-"]:not([data-testid^="town-npc-sprite-"])').length;
    return [town, residents ? `${residents} resident${residents === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
  }
  if (kind === 'quest') {
    const quests = card.querySelectorAll('[data-testid^="quest-row-"]').length;
    const claimable = card.querySelectorAll('[data-testid^="quest-state-"][data-state="claimable"]').length;
    return [quests ? `${quests} quest${quests === 1 ? '' : 's'}` : 'No quests', claimable ? `${claimable} claimable` : ''].filter(Boolean).join(' · ');
  }
  if (kind === 'leaderboard') {
    const rows = card.querySelectorAll('[data-testid^="leaderboard-row-"]').length;
    const leader = card.querySelector('[data-place="1"] .thread-leaderboard-name strong')?.textContent?.trim() || '';
    return [rows ? `${rows} ranked` : 'No standings', leader ? `#1 ${leader}` : ''].filter(Boolean).join(' · ');
  }
  if (kind === 'blackjack') {
    const outcome = firstText(card, '.blackjack-table-copy small');
    const bankroll = firstText(card, '.blackjack-payout-bankroll, .blackjack-bankroll strong');
    return [outcome, bankroll ? `Bankroll ${bankroll.replace(/^Bankroll\s+/i, '')}` : ''].filter(Boolean).join(' · ');
  }
  if (kind === 'shop') {
    const offers = card.querySelectorAll('[data-testid="shop-rich-offer"], .thread-shop-offer').length;
    return [offers ? `${offers} offer${offers === 1 ? '' : 's'}` : '', firstText(card, '[data-testid="shop-gold-balance"], [data-testid="shop-balance"]')].filter(Boolean).join(' · ');
  }
  return compactText(card.querySelector('.thread-reply-header small')?.textContent || '');
}

function snapshotModel(card) {
  if (!card || card.hidden || !card.childElementCount) return null;
  const kind = card.dataset.richCardKind || commandFromCard(card);
  const title = titleFromCard(card);
  const label = kind === 'shop' ? 'RECEIPT' : kind === 'blackjack' ? (card.dataset.gamblingView === 'active' ? 'OPEN' : 'RESULT') : ['inventory', 'profile', 'area', 'town', 'quest', 'leaderboard', 'simulated-profile'].includes(kind) ? 'OPEN' : 'DETAILS';
  return { kind, title, details: snapshotDetails(card, kind), label, signature: `${kind}:${title}` };
}

export function createHistoricalRichCardSnapshot(model, { documentRef = document } = {}) {
  if (!model) return null;
  const row = documentRef.createElement('article');
  row.className = 'rich-card-history-snapshot';
  row.dataset.testid = 'rich-card-history-snapshot';
  row.dataset.richCardKind = model.kind;
  row.setAttribute('role', 'listitem');
  row.setAttribute('aria-label', `${model.title} historical snapshot`);
  const icon = documentRef.createElement('span');
  icon.className = 'rich-card-history-icon'; icon.dataset.historyTone = model.kind; icon.setAttribute('aria-hidden', 'true');
  const disclosure = documentRef.createElement('details'); disclosure.className = 'rich-card-history-disclosure';
  const summary = documentRef.createElement('summary');
  const copy = documentRef.createElement('span'); copy.className = 'rich-card-history-copy';
  const title = documentRef.createElement('strong'); title.className = 'rich-card-history-summary'; title.textContent = `${model.title} viewed`;
  const details = documentRef.createElement('span'); details.className = 'rich-card-history-details'; details.textContent = model.details || 'Previous interaction';
  const label = documentRef.createElement('span'); label.className = 'rich-card-history-label'; label.textContent = model.label || 'DETAILS';
  const note = documentRef.createElement('p'); note.className = 'rich-card-history-note'; note.textContent = 'Historical snapshot. Open the latest card to take actions.';
  copy.append(title, details); summary.append(copy, label); disclosure.append(summary, note); row.append(icon, disclosure); return row;
}

function createHistoricalRichCardHistory({ documentRef = document } = {}) {
  const group = documentRef.createElement('article');
  group.className = 'stream-entry stream-entry-system rich-card-history';
  group.dataset.testid = 'rich-card-history';
  group.setAttribute('aria-label', 'Collapsed rich-card history');
  const avatar = documentRef.createElement('span');
  avatar.className = 'stream-avatar'; avatar.setAttribute('aria-hidden', 'true'); avatar.textContent = '';
  const content = documentRef.createElement('div');
  content.className = 'rich-card-history-content';
  const header = documentRef.createElement('header');
  header.className = 'rich-card-history-header';
  const copy = documentRef.createElement('div');
  copy.className = 'rich-card-history-header-copy';
  const title = documentRef.createElement('strong');
  title.textContent = 'COLLAPSED HISTORY';
  const subtitle = documentRef.createElement('small');
  subtitle.textContent = 'Compact, readable, still auditable';
  copy.append(title, subtitle);
  const count = documentRef.createElement('span');
  count.className = 'rich-card-history-count';
  count.dataset.testid = 'rich-card-history-count';
  header.append(copy, count);
  const list = documentRef.createElement('div');
  list.className = 'rich-card-history-list';
  list.dataset.testid = 'rich-card-history-list';
  list.setAttribute('role', 'list');
  const note = documentRef.createElement('p');
  note.className = 'rich-card-history-footer';
  note.textContent = 'Only the newest relevant card stays fully interactive.';
  content.append(header, list, note);
  group.append(avatar, content);
  return group;
}

function updateHistoricalRichCardHistory(group) {
  if (!group) return;
  const snapshots = [...group.querySelectorAll('[data-testid="rich-card-history-snapshot"]')];
  const count = group.querySelector('[data-testid="rich-card-history-count"]');
  if (count) count.textContent = `${snapshots.length} SNAPSHOT${snapshots.length === 1 ? '' : 'S'}`;
}

export function decorateRichChatCard(card, { command = null } = {}) {
  if (!card) return null;
  const parsedKind = command || commandFromCard(card);
  const canonicalKind = parsedKind === 'shop' ? 'shop' : ['inventory', 'gear'].includes(parsedKind) ? 'inventory' : parsedKind;
  const title = titleFromCard(card);
  card.classList.add('rich-chat-card'); card.dataset.richCardKind = canonicalKind; card.setAttribute('role', 'region'); card.setAttribute('aria-label', `${title} panel`);
  const header = card.querySelector('.thread-reply-header'); header?.classList.add('rich-chat-card-header');
  const close = card.querySelector('.thread-reply-close');
  if (close) { close.classList.add('rich-chat-card-dismiss'); close.dataset.richCardDismiss = 'true'; }
  for (const group of card.querySelectorAll(DEFAULT_ACTION_GROUP_SELECTOR)) group.classList.add('rich-chat-card-actions');
  for (const button of card.querySelectorAll('button')) { if (button === close) continue; button.classList.add('rich-chat-card-action'); button.dataset.richCardAction = 'true'; }
  return card;
}

export function createRichChatCard({ documentRef = document, command, title, subtitle = '', onDismiss = null } = {}) {
  if (!command || !title) throw new Error('Rich chat cards require a command and title.');
  const card = documentRef.createElement('section'); card.className = 'stream-command-card';
  const header = documentRef.createElement('div'); header.className = 'thread-reply-header';
  const copy = documentRef.createElement('div'); const kicker = documentRef.createElement('span'); kicker.textContent = `PRIVATE THREAD REPLY · /${command}`;
  const heading = documentRef.createElement('strong'); heading.textContent = title; copy.append(kicker, heading);
  if (subtitle) { const small = documentRef.createElement('small'); small.textContent = subtitle; copy.append(small); }
  const close = documentRef.createElement('button'); close.type = 'button'; close.className = 'thread-reply-close'; close.setAttribute('aria-label', `Dismiss ${title} panel`); close.textContent = '×'; if (onDismiss) close.addEventListener('click', onDismiss);
  header.append(copy, close); card.append(header); return decorateRichChatCard(card, { command });
}

export function createRichChatCardAction({ documentRef = document, label, onAction, testId = null, className = '', disabled = false } = {}) {
  if (!label) throw new Error('Rich chat card actions require a label.');
  const button = documentRef.createElement('button'); button.type = 'button'; button.textContent = label; button.disabled = disabled; button.className = className; button.classList.add('rich-chat-card-action'); button.dataset.richCardAction = 'true'; if (testId) button.dataset.testid = testId; if (onAction) button.addEventListener('click', onAction); return button;
}

function installStyles(documentRef) {
  if (documentRef.querySelector('[data-rich-chat-card-styles]')) return;
  const style = documentRef.createElement('style'); style.dataset.richChatCardStyles = 'true';
  style.textContent = `.rich-chat-card{display:grid;gap:10px}.rich-chat-card>.rich-chat-card-header{margin-bottom:0}.rich-chat-card-actions{min-width:0}.rich-chat-card-action{min-height:44px}.rich-card-history-snapshot{min-height:0;opacity:1}.threadbound-player #stream .rich-chat-card .rich-chat-card-dismiss{width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important;flex:0 0 44px}@media(max-width:720px){.rich-chat-card{gap:9px}.rich-chat-card-action{min-height:44px}.rich-card-history-snapshot{padding-block:7px}}`;
  documentRef.head.append(style);
}

export function installRichChatCardCompatibility({ documentRef = document } = {}) {
  const stream = documentRef.querySelector('#stream'); if (!stream) return () => {}; installStyles(documentRef);
  let activeSnapshot = null; let scheduled = false;
  const decorateCurrent = () => { scheduled = false; const card = stream.querySelector('[data-testid="stream-command-card"]'); if (!card || card.hidden || card.childElementCount === 0) { activeSnapshot = null; return; } if (card.dataset.simpleDungeonSurface === 'true' && card.dataset.richCardKind === 'dungeon') { activeSnapshot = null; return; } decorateRichChatCard(card); const nextSnapshot = snapshotModel(card); if (!nextSnapshot) return; const log = stream.querySelector('[data-testid="adventure-stream-log"]'); if (activeSnapshot && activeSnapshot.signature !== nextSnapshot.signature && log) { const historical = createHistoricalRichCardSnapshot(activeSnapshot, { documentRef }); if (historical) { log.querySelector('[data-testid="stream-empty"]')?.remove(); log.classList.remove('is-empty'); let history = log.querySelector(':scope > [data-testid="rich-card-history"]'); if (!history) { history = createHistoricalRichCardHistory({ documentRef }); log.append(history); } const list = history.querySelector('[data-testid="rich-card-history-list"]'); list?.append(historical); const snapshots = [...(list?.querySelectorAll(':scope > [data-testid="rich-card-history-snapshot"]') || [])]; for (const stale of snapshots.slice(0, Math.max(0, snapshots.length - MAX_HISTORICAL_RICH_CARDS))) stale.remove(); updateHistoricalRichCardHistory(history); log.scrollTop = log.scrollHeight; } } activeSnapshot = nextSnapshot; };
  const scheduleDecoration = () => { if (scheduled) return; scheduled = true; queueMicrotask(decorateCurrent); };
  const observer = new MutationObserver(scheduleDecoration); observer.observe(stream, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] }); scheduleDecoration(); return () => observer.disconnect();
}

if (typeof document !== 'undefined') { const uninstall = installRichChatCardCompatibility(); window.addEventListener('beforeunload', uninstall, { once: true }); }
