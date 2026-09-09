import { enemySprite } from './sprite-catalog.js';

const stream = document.querySelector('[data-testid="adventure-stream"]');

if (stream) {
  const style = document.createElement('style');
  style.textContent = `
    .stream-entry-transition {
      border-color:rgba(255,224,107,.3) !important;
      box-shadow:inset 3px 0 0 rgba(255,224,107,.72),0 8px 24px rgba(0,0,0,.14) !important;
    }
    .stream-transition-card { display:grid; gap:8px; }
    .stream-transition-kicker { color:#ffe78a; font-size:.59rem; font-weight:1000; letter-spacing:.12em; }
    .stream-transition-summary { color:var(--text); font-size:.86rem; font-weight:850; line-height:1.35; }
    .stream-transition-foe {
      display:grid; grid-template-columns:36px minmax(0,1fr); gap:8px; align-items:center;
      padding:8px; border:1px solid rgba(255,95,120,.2); border-radius:10px; background:rgba(3,8,17,.5);
      animation:threadbound-encounter-arrive .24s ease-out;
    }
    .stream-transition-foe img { width:34px; height:34px; object-fit:contain; image-rendering:pixelated; }
    .stream-transition-foe strong, .stream-transition-foe small { display:block; }
    .stream-transition-foe small { margin-top:2px; color:#fff1f3; font-size:.68rem; font-weight:900; font-variant-numeric:tabular-nums; }
    .stream-transition-track { height:7px; margin-top:5px; overflow:hidden; border-radius:999px; background:rgba(255,255,255,.08); }
    .stream-transition-track > span { display:block; width:100%; height:100%; background:linear-gradient(90deg,#ff5f78,#ff8e68); border-radius:inherit; }
    .stream-entry-critical {
      border-color:rgba(255,224,107,.38) !important;
      box-shadow:inset 3px 0 0 #ffe45c,0 8px 24px rgba(0,0,0,.14) !important;
    }
    .stream-critical-card { display:flex; align-items:center; gap:8px; padding:7px 9px; border-radius:9px; background:linear-gradient(135deg,rgba(255,228,92,.17),rgba(255,184,77,.1)); }
    .stream-critical-card strong { color:#fff2a7; font-size:.78rem; letter-spacing:.06em; }
    .stream-critical-card span { color:var(--text); font-size:.72rem; font-weight:800; }
    .stream-entry-death-effect { border-color:rgba(210,164,255,.28) !important; box-shadow:inset 3px 0 0 rgba(210,164,255,.72),0 8px 24px rgba(0,0,0,.14) !important; }
    @keyframes threadbound-encounter-arrive { from { transform:translateY(4px); opacity:.45; } to { transform:translateY(0); opacity:1; } }
    @media (prefers-reduced-motion:reduce) { .stream-transition-foe { animation:none !important; } }
  `;
  document.head.append(style);

  let refreshTimer = null;
  let inFlight = false;

  async function latestEntries() {
    const response = await fetch('/api/stream?limit=30', { headers:{ Accept:'application/json' } });
    if (!response.ok) return [];
    const payload = await response.json();
    return payload.entries || [];
  }

  function transitionCard(entry) {
    const metadata = entry.metadata || {};
    const card = document.createElement('section');
    card.className = 'stream-transition-card';
    card.dataset.testid = 'stream-encounter-transition';
    const kicker = document.createElement('span');
    kicker.className = 'stream-transition-kicker';
    kicker.textContent = entry.eventType === 'RunUpgradeChosen' ? '✦ POWER LOCKED IN · NEXT ENCOUNTER' : '✦ PATH CHOSEN · NEXT ENCOUNTER';
    const summary = document.createElement('span');
    summary.className = 'stream-transition-summary';
    summary.textContent = entry.body || 'The thread advances.';
    card.append(kicker, summary);

    if (metadata.nextEnemyId && metadata.nextEnemyHp !== null && metadata.nextEnemyMaxHp !== null) {
      const foe = document.createElement('div');
      foe.className = 'stream-transition-foe';
      foe.dataset.testid = 'stream-next-enemy';
      const image = document.createElement('img');
      image.src = enemySprite({ id:metadata.nextEnemyId, isBoss:Boolean(metadata.nextEnemyIsBoss) });
      image.alt = '';
      const copy = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = `${metadata.nextEnemyName || metadata.nextEnemyId}${metadata.nextEnemyIsBoss ? ' · BOSS' : ''}`;
      const hp = document.createElement('small');
      hp.dataset.testid = 'stream-next-enemy-hp';
      hp.textContent = `${metadata.nextEnemyHp} / ${metadata.nextEnemyMaxHp} HP`;
      const track = document.createElement('div');
      track.className = 'stream-transition-track';
      track.setAttribute('role','meter');
      track.setAttribute('aria-valuemin','0');
      track.setAttribute('aria-valuemax',String(metadata.nextEnemyMaxHp));
      track.setAttribute('aria-valuenow',String(metadata.nextEnemyHp));
      track.append(document.createElement('span'));
      copy.append(name,hp,track);
      foe.append(image,copy);
      card.append(foe);
    }
    return card;
  }

  function criticalCard(entry) {
    const metadata = entry.metadata || {};
    const card = document.createElement('div');
    card.className = 'stream-critical-card';
    card.dataset.testid = 'stream-critical-result';
    const title = document.createElement('strong');
    title.textContent = '✦ CRITICAL';
    const copy = document.createElement('span');
    copy.textContent = `${metadata.damage || '?'} damage · ${Number(metadata.multiplier || 1).toFixed(2)}× strike`;
    card.append(title,copy);
    return card;
  }

  function decorate(row, entry) {
    if (!row || !entry || row.dataset.transitionProcessed === 'true') return;
    if (!['RunUpgradeChosen','RunEventChosen','CriticalStrikeLanded','EnemyDeathEffectResolved'].includes(entry.eventType)) return;
    row.dataset.transitionProcessed = 'true';
    const content = row.querySelector('.stream-entry-content');
    const body = content?.querySelector(':scope > p');
    if (!content || !body) return;
    body.classList.add('sr-only');
    content.querySelector('.stream-system-tag')?.remove();
    row.classList.add('stream-entry-rich');
    if (entry.eventType === 'RunUpgradeChosen' || entry.eventType === 'RunEventChosen') {
      row.classList.add('stream-entry-transition');
      row.querySelector('.stream-avatar').textContent = entry.metadata?.nextEnemyIsBoss ? '♛' : '✦';
      content.append(transitionCard(entry));
    } else if (entry.eventType === 'CriticalStrikeLanded') {
      row.classList.add('stream-entry-critical');
      row.querySelector('.stream-avatar').textContent = '✦';
      content.append(criticalCard(entry));
    } else {
      row.classList.add('stream-entry-death-effect');
      row.querySelector('.stream-avatar').textContent = '✹';
      const banner = document.createElement('div');
      banner.className = 'stream-outcome-banner upgrade';
      banner.textContent = entry.body || 'An on-death effect triggered.';
      content.append(banner);
    }
  }

  async function refresh() {
    if (inFlight) return;
    const pending = [...stream.querySelectorAll('.stream-entry-system[data-entry-id]:not([data-transition-processed="true"])')];
    if (!pending.length) return;
    inFlight = true;
    try {
      const entries = new Map((await latestEntries()).map((entry) => [entry.id,entry]));
      for (const row of pending) decorate(row,entries.get(row.dataset.entryId));
    } finally { inFlight = false; }
  }

  function schedule() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refresh().catch(() => {}),65);
  }

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.type === 'childList')) schedule();
  });
  observer.observe(stream,{ childList:true,subtree:true });
  schedule();
  window.addEventListener('beforeunload',() => { clearTimeout(refreshTimer); observer.disconnect(); },{ once:true });
}
