import { useEffect, useMemo, useState } from 'react';
import { getCodex, getVisualAssets } from './api/client.js';

const CATEGORIES = Object.freeze([
  ['all', 'All'],
  ['items', 'Items'],
  ['enemies', 'Enemies'],
  ['bosses', 'Bosses'],
  ['lore', 'Lore'],
  ['achievements', 'Achievements'],
  ['history', 'History'],
]);

function titleize(value) {
  return String(value || 'Unknown').replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function iconFor(category) {
  return { items: '↗', enemies: '◎', bosses: '♛', lore: '✦', achievements: '★', history: '⌛' }[category] || '◇';
}

function assetForEntry(entry, assets) {
  if (!entry?.visualAssetId) return null;
  return assets.find((asset) => asset.id === entry.visualAssetId) || null;
}

function EntryIcon({ entry, assets, detail = false }) {
  const asset = assetForEntry(entry, assets);
  const className = `${detail ? 'react-codex-detail-art' : 'react-codex-entry-art'} react-codex-entry-icon react-codex-entry-icon--${entry.category}`;
  return asset
    ? <img className={className} src={asset.src} alt={`${entry.title} artwork`} data-testid={detail ? 'codex-detail-art' : 'codex-entry-art'} data-visual-asset-id={asset.id} />
    : <span className={className}>{iconFor(entry.category)}</span>;
}

function parseHash() {
  const [category, ...idParts] = window.location.hash.replace(/^#/, '').split('/');
  const id = decodeURIComponent(idParts.join('/'));
  return CATEGORIES.some(([key]) => key === category && key !== 'all') && id ? { category, id } : null;
}

function entryMeta(entry) {
  if (entry.category === 'items') return `${entry.mechanics?.rarity || 'Item'} · ${titleize(entry.mechanics?.slot || 'equipment')}`;
  if (entry.category === 'achievements') return `${entry.unlocked ? 'UNLOCKED' : 'LOCKED'} · Achievement`;
  return `${titleize(entry.category)}${entry.source ? ` · ${titleize(entry.source)}` : ''}`;
}

function entrySummary(entry) {
  if (entry.category === 'items' && Number.isFinite(Number(entry.mechanics?.attackBonus))) return `+${entry.mechanics.attackBonus} Attack · ${entry.mechanics?.effectName || 'Equipment effect'}`;
  return entry.summary || entry.body || 'No summary recorded.';
}

function Detail({ entry, assets }) {
  if (!entry) return <div className="react-codex-empty-detail">Choose a record to open its full entry.</div>;
  const mechanics = Object.entries(entry.mechanics || {});
  return (
    <article className="react-codex-detail" data-testid="codex-detail" data-category={entry.category} data-entry-id={entry.id}>
      <nav className="react-codex-breadcrumbs" aria-label="Breadcrumb"><a href="/codex">Codex</a><span>›</span><span>{titleize(entry.category)}</span><span>›</span><strong>{entry.title}</strong></nav>
      <header className="react-codex-detail__header">
        <EntryIcon entry={entry} assets={assets} detail />
        <div><span className="react-codex-kicker">{entryMeta(entry)}</span><h2 data-testid="codex-detail-title">{entry.title}</h2><p data-testid="codex-detail-summary">{entry.summary || entry.body}</p></div>
      </header>
      <div className="react-codex-infobox"><div><span>TYPE</span><strong>{titleize(entry.category).replace(/s$/, '')}</strong></div><div><span>SOURCE</span><strong>{titleize(entry.source || 'Threadbound')}</strong></div>{entry.unlocked !== undefined ? <div><span>STATUS</span><strong>{entry.unlocked ? 'Unlocked' : 'Locked'}</strong></div> : null}{entry.revision ? <div><span>REVISION</span><strong>{entry.revision}</strong></div> : null}</div>
      <section className="react-codex-section"><h3>Overview</h3><p data-testid="codex-detail-body">{entry.body || entry.summary || 'This record is part of the living Threadbound Codex.'}</p></section>
      {mechanics.length ? <section className="react-codex-section"><h3>Mechanics</h3><dl className="react-codex-mechanics" data-testid="codex-mechanics">{mechanics.map(([key, value]) => <div key={key}><dt>{titleize(key)}</dt><dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>)}</dl></section> : null}
      <section className="react-codex-section"><h3>History</h3><p className="react-codex-history">{entry.discoveredAt ? `Discovered ${entry.discoveredAt}` : entry.createdAt ? `Recorded ${entry.createdAt}` : `Source: ${titleize(entry.source || 'Threadbound')}`}</p>{entry.tags?.length ? <div className="react-codex-tags">{entry.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}</section>
    </article>
  );
}

export function CodexApp() {
  const deepLink = parseHash();
  const [category, setCategory] = useState(deepLink?.category || 'all');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState({ entries: [], counts: {}, total: 0 });
  const [assets, setAssets] = useState([]);
  const [activeId, setActiveId] = useState(deepLink?.id || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getVisualAssets().then((payload) => setAssets(payload.assets || [])).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      getCodex({ category, query }).then((payload) => {
        if (cancelled) return;
        setResult(payload);
        setActiveId((current) => payload.entries.some((entry) => entry.id === current) ? current : payload.entries[0]?.id || null);
        setError('');
      }).catch((caught) => { if (!cancelled) setError(caught.message); }).finally(() => { if (!cancelled) setLoading(false); });
    }, query ? 160 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [category, query]);

  const activeEntry = useMemo(() => result.entries.find((entry) => entry.id === activeId) || null, [activeId, result.entries]);
  useEffect(() => {
    if (!activeEntry) {
      if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
      return;
    }
    const nextHash = `#${activeEntry.category}/${encodeURIComponent(activeEntry.id)}`;
    if (window.location.hash !== nextHash) window.history.replaceState(null, '', `${window.location.pathname}${nextHash}`);
  }, [activeEntry]);

  const selectCategory = (nextCategory) => { setCategory(nextCategory); setActiveId(null); };
  const allCount = Object.values(result.counts || {}).reduce((sum, count) => sum + Number(count || 0), 0);
  const status = error || (loading ? 'Loading…' : `${result.total} record${result.total === 1 ? '' : 's'} · living wiki`);

  return (
    <div className="react-codex">
      <header className="react-codex-topbar"><a className="react-codex-brand" href="/game" aria-label="Threadbound Adventure Stream"><span>✦</span><strong>THREADBOUND</strong></a><span className="react-codex-topbar__context">LIVING ARCHIVE</span><nav aria-label="Threadbound"><a data-testid="nav-game" href="/game">Play</a><a data-testid="nav-codex" className="is-current" href="/codex" aria-current="page">Codex</a></nav></header>
      <main className="react-codex-page">
        <header className="react-codex-hero"><span className="react-codex-kicker">LIVING ARCHIVE</span><h1>Codex</h1><p>Everything the world has revealed so far.</p></header>
        <div className="react-codex-toolbar"><label className="react-codex-search"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setActiveId(null); }} aria-label="Search the Loom" placeholder="Search the Loom…" data-testid="codex-search" /></label><div className="react-codex-tabs" role="tablist" aria-label="Codex categories">{CATEGORIES.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={category === key} data-testid={`codex-tab-${key}`} onClick={() => selectCategory(key)}>{label}</button>)}</div></div>
        <div className="react-codex-status" data-testid="codex-status" role="status" aria-live="polite">{status}</div>
        <div className="react-codex-counts">{CATEGORIES.slice(1).map(([key, label]) => <span key={key} data-testid={`codex-count-${key}`}>{label} {result.counts?.[key] || 0}</span>)}<span>All {allCount}</span></div>
        <div className="react-codex-layout"><aside className="react-codex-rail" aria-label="Codex categories"><span className="react-codex-rail__label">BROWSE</span>{CATEGORIES.map(([key, label]) => <button key={key} type="button" aria-pressed={category === key} data-testid={`codex-rail-${key}`} onClick={() => selectCategory(key)}><span>{label}</span><b>{key === 'all' ? allCount : result.counts?.[key] || 0}</b></button>)}</aside><section className="react-codex-list" aria-label="Codex entries">{result.entries.length ? result.entries.map((entry) => <button key={`${entry.category}:${entry.id}`} type="button" className="react-codex-entry" aria-selected={entry.id === activeId} data-testid="codex-entry" data-entry-id={entry.id} onClick={() => setActiveId(entry.id)}><EntryIcon entry={entry} assets={assets} /><span className="react-codex-entry__copy"><small>{entryMeta(entry)}</small><strong>{entry.title}</strong><span>{entrySummary(entry)}</span></span><b aria-hidden="true">›</b></button>) : <div className="react-codex-empty" data-testid="codex-empty">No records match this search.</div>}<small className="react-codex-list-note">{result.counts?.history || 0} history records · retry-safe world projection</small></section><Detail entry={activeEntry} assets={assets} /></div>
      </main>
    </div>
  );
}
