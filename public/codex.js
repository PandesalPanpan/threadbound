const minimalUi = document.createElement('link');
minimalUi.rel = 'stylesheet';
minimalUi.href = '/minimal-ui.css';
document.head.append(minimalUi);

const codexV2 = document.createElement('link');
codexV2.rel = 'stylesheet';
codexV2.href = '/ui-v2/codex.css';
document.head.append(codexV2);

import { createSpriteElement, enemySpriteFrame, itemSpriteFrame } from './sprite-catalog.js';

const statusEl = document.querySelector('#codex-status');
const searchEl = document.querySelector('#codex-search');
const tabsEl = document.querySelector('#codex-tabs');
const countsEl = document.querySelector('#codex-counts');
const railItemsEl = document.querySelector('#codex-rail-items');
const listEl = document.querySelector('#codex-list');
const detailEl = document.querySelector('#codex-detail');

const CATEGORIES = [
  ['all', 'All'],
  ['items', 'Items'],
  ['enemies', 'Enemies'],
  ['bosses', 'Bosses'],
  ['lore', 'Lore'],
  ['achievements', 'Achievements'],
  ['history', 'History'],
];

let activeCategory = 'all';
let activeId = null;
let timer = null;
let loadRevision = 0;
let lastResult = null;
let directoryEntries = [];

async function api(path) {
  const response = await fetch(path, { headers: { Accept: 'application/json' } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`);
  return payload;
}

function escapeText(value) {
  return String(value ?? '');
}

function titleize(value) {
  return String(value || '')
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ') || 'Unknown';
}

function categoryLabel(category) {
  return CATEGORIES.find(([key]) => key === category)?.[1] || titleize(category);
}

function singularCategory(category) {
  return {
    items: 'Item',
    enemies: 'Enemy',
    bosses: 'Boss',
    lore: 'Lore',
    achievements: 'Achievement',
    history: 'History',
  }[category] || categoryLabel(category);
}

function entryIcon(entry) {
  if (entry.category === 'items') return '↗';
  if (entry.category === 'enemies') return '◎';
  if (entry.category === 'bosses') return '♛';
  if (entry.category === 'lore') return '✦';
  if (entry.category === 'achievements') return '★';
  if (entry.category === 'history') return '⌛';
  return '◇';
}

function entrySprite(entry, { className = '', testId = null } = {}) {
  let frame = null;
  if (entry.category === 'enemies' || entry.category === 'bosses') {
    frame = enemySpriteFrame({
      id: entry.id,
      name: entry.title,
      isBoss: entry.category === 'bosses',
      visualAssetId: entry.visualAssetId,
    });
  } else if (entry.category === 'items') {
    frame = itemSpriteFrame({ id: entry.id, name: entry.title, visualAssetId: entry.visualAssetId });
  }
  return frame ? createSpriteElement(frame, {
    className,
    testId,
    label: `${entry.title} artwork`,
  }) : null;
}

function parseHash() {
  const raw = location.hash.replace(/^#/, '');
  if (!raw) return null;
  const [category, ...idParts] = raw.split('/');
  const id = decodeURIComponent(idParts.join('/'));
  return CATEGORIES.some(([key]) => key === category) && category !== 'all' && id ? { category, id } : null;
}

function setHash(category, id) {
  const next = `#${category}/${encodeURIComponent(id)}`;
  if (location.hash !== next) history.replaceState(null, '', next);
}

function setCodexView(view) {
  document.body.dataset.codexView = view;
}

function sourceLabel(source) {
  return titleize(source).replace(/Arc Manifest/g, 'Arc Manifest');
}

function entryMeta(entry) {
  const category = singularCategory(entry.category).toUpperCase();
  if (entry.category === 'items') {
    const rarity = entry.mechanics?.rarity || entry.tags?.[0];
    return rarity ? `${category} · ${String(rarity).toUpperCase()}` : category;
  }
  if (entry.category === 'achievements') return `${category} · ${entry.unlocked ? 'UNLOCKED' : 'LOCKED'}`;
  const area = entry.tags?.find((tag) => String(tag).includes('area'));
  return area ? `${category} · ${String(area).replace(/[-_]/g, ' ').toUpperCase()}` : category;
}

function entrySummary(entry) {
  if (entry.category === 'items' && Number.isFinite(Number(entry.mechanics?.attackBonus))) {
    const attack = `+${entry.mechanics.attackBonus} ATK`;
    const source = entry.source ? `discovered in ${sourceLabel(entry.source)}` : '';
    return [attack, source].filter(Boolean).join(' · ');
  }
  return entry.summary || entry.body || 'No summary recorded.';
}

function entrySubtitle(entry) {
  if (entry.category === 'achievements') return entryMeta(entry);
  const tags = (entry.tags || [])
    .filter((tag) => !['achievement', 'unlocked', 'locked'].includes(String(tag).toLowerCase()))
    .slice(0, 2);
  return `${singularCategory(entry.category)}${tags.length ? ` · ${tags.join(' · ')}` : ''}`;
}

function mergeDirectory(entries = []) {
  const byKey = new Map(directoryEntries.map((entry) => [`${entry.category}:${entry.id}`, entry]));
  for (const entry of entries) byKey.set(`${entry.category}:${entry.id}`, entry);
  directoryEntries = [...byKey.values()];
}

function wikiLink(label, onClick, { testId = null, title = '' } = {}) {
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'wiki-link';
  link.textContent = label;
  if (testId) link.dataset.testid = testId;
  if (title) link.title = title;
  link.addEventListener('click', () => Promise.resolve(onClick()).catch((error) => {
    statusEl.textContent = error.message;
  }));
  return link;
}

async function openEntry(entry) {
  if (!entry) return;
  clearTimeout(timer);
  timer = null;
  setCodexView('article');
  activeCategory = entry.category;
  activeId = entry.id;
  searchEl.value = '';
  setHash(entry.category, entry.id);
  renderTabs();
  await load();
}

function openCategory(category) {
  clearTimeout(timer);
  timer = null;
  setCodexView('directory');
  activeCategory = category;
  activeId = null;
  searchEl.value = '';
  history.replaceState(null, '', location.pathname);
  renderTabs();
  return load();
}

function appendLinkedText(container, text, currentEntry) {
  const source = escapeText(text);
  if (!source) return;
  const currentKey = currentEntry ? `${currentEntry.category}:${currentEntry.id}` : '';
  const candidates = directoryEntries
    .filter((entry) => `${entry.category}:${entry.id}` !== currentKey && entry.title && entry.title.length >= 3)
    .map((entry) => ({ entry, title: String(entry.title), lower: String(entry.title).toLowerCase() }))
    .sort((a, b) => b.title.length - a.title.length);

  const lowerSource = source.toLowerCase();
  const linked = new Set();
  let cursor = 0;
  while (cursor < source.length) {
    let next = null;
    for (const candidate of candidates) {
      if (linked.has(`${candidate.entry.category}:${candidate.entry.id}`)) continue;
      const index = lowerSource.indexOf(candidate.lower, cursor);
      if (index < 0) continue;
      if (!next || index < next.index || (index === next.index && candidate.title.length > next.candidate.title.length)) {
        next = { index, candidate };
      }
    }
    if (!next) {
      container.append(document.createTextNode(source.slice(cursor)));
      break;
    }
    if (next.index > cursor) container.append(document.createTextNode(source.slice(cursor, next.index)));
    const exact = source.slice(next.index, next.index + next.candidate.title.length);
    container.append(wikiLink(exact, () => openEntry(next.candidate.entry), { title: `Open ${next.candidate.title}` }));
    linked.add(`${next.candidate.entry.category}:${next.candidate.entry.id}`);
    cursor = next.index + next.candidate.title.length;
  }
}

function renderTabs() {
  tabsEl.innerHTML = '';
  const definitions = [
    ...CATEGORIES.slice(0, 5),
    ['more', 'More'],
    ...CATEGORIES.slice(5),
  ];
  for (const [key, label] of definitions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.testid = `codex-tab-${key}`;
    if (key === 'more') {
      button.dataset.more = 'true';
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', () => {
        const expanded = tabsEl.classList.toggle('more-open');
        button.setAttribute('aria-expanded', String(expanded));
      });
    } else {
      button.setAttribute('aria-pressed', String(activeCategory === key));
      button.addEventListener('click', () => openCategory(key));
    }
    tabsEl.append(button);
  }
  renderCategoryRail(lastResult?.counts || {});
}

function renderCategoryRail(counts = {}) {
  if (!railItemsEl) return;
  railItemsEl.innerHTML = '';
  for (const [key, label] of CATEGORIES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'codex-rail-item';
    button.dataset.testid = `codex-rail-${key}`;
    button.setAttribute('aria-pressed', String(activeCategory === key));
    const name = document.createElement('span');
    name.textContent = label;
    const count = document.createElement('span');
    count.textContent = key === 'all' ? Object.values(counts).reduce((total, value) => total + Number(value || 0), 0) : counts[key] ?? 0;
    button.append(name, count);
    button.addEventListener('click', () => openCategory(key));
    railItemsEl.append(button);
  }
}

function renderCounts(counts) {
  countsEl.innerHTML = '';
  for (const [key, label] of CATEGORIES.filter(([key]) => key !== 'all')) {
    const chip = document.createElement('span');
    chip.className = 'count';
    chip.dataset.testid = `codex-count-${key}`;
    chip.textContent = `${label} ${counts[key] ?? 0}`;
    countsEl.append(chip);
  }
  renderCategoryRail(counts);
}

function metadataRows(entry) {
  const rows = [];
  rows.push(['Type', categoryLabel(entry.category).replace(/s$/, '')]);
  if (entry.source) rows.push(['Source', entry.source]);
  if (entry.revision) rows.push(['Revision', entry.revision]);
  if (entry.discoveredAt) rows.push(['Discovered', entry.discoveredAt]);
  if (entry.createdAt) rows.push(['Recorded', entry.createdAt]);
  if (entry.category === 'achievements') rows.push(['Status', entry.unlocked ? 'Unlocked' : 'Locked']);
  if (entry.unlockedAt) rows.push(['Unlocked', entry.unlockedAt]);
  return rows;
}

function relatedEntries(entry) {
  const tags = new Set((entry.tags || []).map((tag) => String(tag).toLowerCase()));
  const body = `${entry.summary || ''} ${entry.body || ''}`.toLowerCase();
  return directoryEntries
    .filter((candidate) => !(candidate.id === entry.id && candidate.category === entry.category))
    .map((candidate) => {
      let score = 0;
      if (candidate.source && entry.source && candidate.source === entry.source) score += 2;
      for (const tag of candidate.tags || []) if (tags.has(String(tag).toLowerCase())) score += 2;
      if (candidate.title && body.includes(String(candidate.title).toLowerCase())) score += 4;
      if (candidate.category === entry.category) score += 1;
      return { candidate, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || String(a.candidate.title).localeCompare(String(b.candidate.title)))
    .slice(0, 8)
    .map(({ candidate }) => candidate);
}

function renderInfobox(entry) {
  const box = document.createElement('section');
  box.className = 'wiki-infobox';
  const title = document.createElement('div');
  title.className = 'wiki-infobox-title';
  const name = document.createElement('strong');
  name.textContent = 'RECORD';
  const category = document.createElement('span');
  category.textContent = categoryLabel(entry.category).toUpperCase();
  title.append(name, category);
  box.append(title);

  for (const [label, value] of metadataRows(entry)) {
    const cell = document.createElement('div');
    cell.className = 'wiki-infobox-cell';
    const key = document.createElement('span');
    key.textContent = label;
    const val = document.createElement('span');
    val.textContent = escapeText(value);
    cell.append(key, val);
    box.append(cell);
  }
  return box;
}

function renderContents(sections) {
  const contents = document.createElement('section');
  contents.className = 'wiki-contents';
  const heading = document.createElement('strong');
  heading.textContent = 'Contents';
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Article contents');
  sections.forEach(([id, label], index) => {
    const anchor = document.createElement('a');
    anchor.href = `#${id}`;
    anchor.textContent = `${index + 1} ${label}`;
    nav.append(anchor);
  });
  contents.append(heading, nav);
  return contents;
}

function renderDetail(entry, { updateHash = true } = {}) {
  if (!entry) {
    history.replaceState(null, '', location.pathname);
    detailEl.innerHTML = '<div class="empty">Choose an entry to open its full record.</div>';
    return;
  }
  activeId = entry.id;
  if (updateHash) setHash(entry.category, entry.id);
  detailEl.dataset.category = entry.category;
  detailEl.dataset.entryId = entry.id;
  detailEl.innerHTML = '';

  const breadcrumbs = document.createElement('nav');
  breadcrumbs.className = 'wiki-breadcrumbs';
  breadcrumbs.setAttribute('aria-label', 'Breadcrumb');
  breadcrumbs.append(wikiLink('Codex', () => openCategory('all')), document.createTextNode(' › '), wikiLink(categoryLabel(entry.category), () => openCategory(entry.category)), document.createTextNode(` › ${entry.title}`));
  detailEl.append(breadcrumbs);

  const titleRow = document.createElement('header');
  titleRow.className = 'wiki-title-row';
  const icon = entrySprite(entry, { className: 'wiki-entry-icon wiki-entry-artwork', testId: 'codex-detail-art' }) || document.createElement('div');
  if (!icon.dataset.testid) {
    icon.className = 'wiki-entry-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = entryIcon(entry);
  }
  const copy = document.createElement('div');
  const heading = document.createElement('h2');
  heading.dataset.testid = 'codex-detail-title';
  heading.textContent = entry.title;
  const subtitle = document.createElement('div');
  subtitle.className = 'wiki-subtitle';
  subtitle.textContent = entrySubtitle(entry);
  copy.append(heading, subtitle);
  titleRow.append(icon, copy);
  detailEl.append(titleRow);

  const summary = document.createElement('p');
  summary.className = 'wiki-lead';
  summary.dataset.testid = 'codex-detail-summary';
  appendLinkedText(summary, entry.summary, entry);
  detailEl.append(summary);
  const articleBody = document.createElement('div');
  articleBody.className = 'wiki-article-body';
  articleBody.append(renderInfobox(entry));
  detailEl.append(articleBody);

  const sections = [['codex-overview', 'Overview']];
  if (entry.mechanics && Object.keys(entry.mechanics).length) sections.push(['codex-mechanics-section', 'Mechanics']);
  sections.push(['codex-related', 'Related pages'], ['codex-history', 'History']);
  articleBody.append(renderContents(sections));

  const overview = document.createElement('section');
  overview.className = 'wiki-section';
  overview.id = 'codex-overview';
  const overviewTitle = document.createElement('h3');
  overviewTitle.textContent = 'Overview';
  const body = document.createElement('p');
  body.dataset.testid = 'codex-detail-body';
  appendLinkedText(body, entry.body || entry.summary, entry);
  overview.append(overviewTitle, body);
  articleBody.append(overview);

  if (entry.mechanics && Object.keys(entry.mechanics).length) {
    const mechanicsSection = document.createElement('section');
    mechanicsSection.className = 'wiki-section';
    mechanicsSection.id = 'codex-mechanics-section';
    const mechanicsTitle = document.createElement('h3');
    mechanicsTitle.textContent = 'Mechanics';
    const mechanics = document.createElement('dl');
    mechanics.className = 'wiki-mechanics';
    mechanics.dataset.testid = 'codex-mechanics';
    for (const [key, value] of Object.entries(entry.mechanics)) {
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
      const dd = document.createElement('dd');
      dd.textContent = escapeText(value);
      row.append(dt, dd);
      mechanics.append(row);
    }
    mechanicsSection.append(mechanicsTitle, mechanics);
    articleBody.append(mechanicsSection);
  }

  const relatedSection = document.createElement('section');
  relatedSection.className = 'wiki-section';
  relatedSection.id = 'codex-related';
  const relatedTitle = document.createElement('h3');
  relatedTitle.textContent = 'Related pages';
  const related = document.createElement('div');
  related.className = 'wiki-related';
  const relations = relatedEntries(entry);
  if (relations.length) {
    for (const candidate of relations) related.append(wikiLink(candidate.title, () => openEntry(candidate)));
  } else {
    related.append(wikiLink(`Browse ${categoryLabel(entry.category)}`, () => openCategory(entry.category)));
  }
  relatedSection.append(relatedTitle, related);
  articleBody.append(relatedSection);

  const historySection = document.createElement('section');
  historySection.className = 'wiki-section';
  historySection.id = 'codex-history';
  const historyTitle = document.createElement('h3');
  historyTitle.textContent = 'History';
  const historyCopy = document.createElement('p');
  historyCopy.className = 'wiki-history';
  const historyBits = [];
  if (entry.revision) historyBits.push(`Revision ${entry.revision}`);
  if (entry.source) historyBits.push(`Source: ${entry.source}`);
  if (entry.discoveredAt) historyBits.push(`Discovered ${entry.discoveredAt}`);
  if (entry.createdAt) historyBits.push(`Recorded ${entry.createdAt}`);
  historyCopy.textContent = historyBits.join(' · ') || 'This record is part of the living Threadbound Codex.';
  historySection.append(historyTitle, historyCopy);

  if (entry.tags?.length) {
    const tags = document.createElement('div');
    tags.className = 'wiki-related';
    tags.append(document.createTextNode('Tags: '));
    for (const tag of entry.tags) {
      tags.append(wikiLink(tag, async () => {
        activeCategory = 'all';
        activeId = null;
        searchEl.value = tag;
        history.replaceState(null, '', location.pathname);
        renderTabs();
        await load();
      }));
    }
    historySection.append(tags);
  }

  if (entry.category === 'history' && entry.entityType === 'item' && entry.entityId) {
    const target = directoryEntries.find((candidate) => candidate.category === 'items' && candidate.id === entry.entityId);
    const relatedItem = wikiLink('Open related item', async () => {
      if (target) await openEntry(target);
      else {
        activeCategory = 'items';
        searchEl.value = '';
        activeId = entry.entityId;
        renderTabs();
        await load();
      }
    }, { testId: 'codex-related-item' });
    historySection.append(relatedItem);
  }
  articleBody.append(historySection);
}

function renderList(entries) {
  listEl.innerHTML = '';
  if (!entries.length) {
    listEl.innerHTML = '<div class="empty" data-testid="codex-empty">No records match this search.</div>';
    renderDetail(null);
    return;
  }

  for (const entry of entries) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'entry';
    button.dataset.testid = 'codex-entry';
    button.dataset.category = entry.category;
    button.dataset.entryId = entry.id;
    button.setAttribute('aria-selected', String(entry.id === activeId));

    const icon = entrySprite(entry, {
      className: `entry-icon icon--${entry.category} entry-artwork`,
      testId: 'codex-entry-art',
    }) || document.createElement('span');
    if (!icon.dataset.testid) {
      icon.className = `entry-icon icon--${entry.category}`;
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = entryIcon(entry);
    }
    const copy = document.createElement('span');
    copy.className = 'entry-copy';
    const meta = document.createElement('span');
    meta.className = 'entry-meta';
    meta.textContent = entryMeta(entry);
    const heading = document.createElement('h3');
    heading.textContent = entry.title;
    const summary = document.createElement('p');
    summary.textContent = entrySummary(entry);
    copy.append(meta, heading, summary);
    const chevron = document.createElement('span');
    chevron.className = 'entry-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '›';
    button.append(icon, copy, chevron);
    button.addEventListener('click', () => {
      for (const other of listEl.querySelectorAll('.entry')) other.setAttribute('aria-selected', 'false');
      button.setAttribute('aria-selected', 'true');
      setCodexView('article');
      renderDetail(entry);
    });
    listEl.append(button);
  }

  const listNote = document.createElement('span');
  listNote.className = 'codex-list-note';
  listNote.textContent = `${lastResult?.counts?.history ?? 0} history records · retry-safe world projection`;
  listEl.append(listNote);

  const selected = entries.find((entry) => entry.id === activeId) || entries[0];
  renderDetail(selected, { updateHash: Boolean(activeId) });
}

async function load() {
  const revision = ++loadRevision;
  statusEl.textContent = 'Loading…';
  try {
    const params = new URLSearchParams({ category: activeCategory });
    const query = searchEl.value.trim();
    if (query) params.set('q', query);
    const result = await api(`/api/codex?${params}`);
    if (revision !== loadRevision) return;
    lastResult = result;
    mergeDirectory(result.entries || []);
    renderCounts(lastResult.counts);
    renderList(lastResult.entries);
    statusEl.textContent = `${lastResult.total} record${lastResult.total === 1 ? '' : 's'} · living wiki`;
  } catch (error) {
    if (revision === loadRevision) statusEl.textContent = error.message;
  }
}

async function loadDirectory() {
  try {
    const result = await api('/api/codex?category=all');
    mergeDirectory(result.entries || []);
  } catch {
    // The normal category load remains useful even if this optional cross-link index fails.
  }
}

searchEl.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    setCodexView('directory');
    activeId = null;
    load();
  }, 180);
});

const deepLink = parseHash();
if (deepLink) {
  setCodexView('article');
  activeCategory = deepLink.category;
  activeId = deepLink.id;
}
renderTabs();
loadDirectory().finally(() => load());
