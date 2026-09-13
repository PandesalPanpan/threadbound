import { createSpriteElement, weaverSpriteFrame } from './sprite-catalog.js';

const stream = document.querySelector('#stream');

if (stream) {
  const styles = document.createElement('style');
  styles.dataset.townRichCardStyles = 'true';
  styles.textContent = `
    .stream-command-card[data-town-rich-card="true"] { scroll-margin-top:76px; }
    .thread-town-heading { display:grid; gap:3px; }
    .thread-town-heading strong { font-size:1rem; }
    .thread-town-heading small { color:var(--muted); font-size:.7rem; line-height:1.4; }
    .thread-town-services { display:flex; flex-wrap:wrap; gap:6px; }
    .thread-town-service { padding:5px 8px; border:1px solid rgba(255,255,255,.09); border-radius:999px; background:rgba(255,255,255,.04); color:var(--muted); font-size:.66rem; font-weight:800; text-transform:capitalize; }
    .thread-town-npcs { display:grid; gap:8px; }
    .thread-town-npc { display:grid; grid-template-columns:58px minmax(0,1fr); gap:10px; align-items:center; padding:10px; border:1px solid rgba(255,255,255,.08); border-radius:11px; background:rgba(4,10,21,.48); }
    .thread-town-npc-sprite { width:58px; min-width:58px; border-radius:10px; background-color:rgba(255,255,255,.035); }
    .thread-town-npc-copy { display:grid; gap:2px; min-width:0; }
    .thread-town-npc-copy strong { font-size:.86rem; }
    .thread-town-npc-copy small { color:var(--muted); font-size:.68rem; line-height:1.4; }
    .thread-town-empty { margin:0; padding:12px; border:1px dashed rgba(255,255,255,.11); border-radius:11px; color:var(--muted); font-size:.72rem; line-height:1.45; }
    .thread-town-note { margin:0; color:var(--muted); font-size:.68rem; line-height:1.45; }
  `;
  document.head.append(styles);

  async function api(path) {
    const response = await fetch(path, { headers: { Accept: 'application/json' } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`);
    return payload;
  }

  function showError(message = '') {
    const error = stream.querySelector('[data-testid="stream-error"]');
    if (!error) return;
    error.textContent = message;
    error.hidden = !message;
  }

  function header(card, subtitle) {
    const wrap = document.createElement('div');
    wrap.className = 'thread-reply-header';
    const copy = document.createElement('div');
    const kicker = document.createElement('span');
    kicker.textContent = 'PRIVATE THREAD REPLY · /town';
    const heading = document.createElement('strong');
    heading.textContent = 'Town';
    const small = document.createElement('small');
    small.textContent = subtitle;
    copy.append(kicker, heading, small);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'thread-reply-close';
    close.setAttribute('aria-label', 'Dismiss Town panel');
    close.textContent = '×';
    close.addEventListener('click', () => {
      card.hidden = true;
      card.innerHTML = '';
    });
    wrap.append(copy, close);
    return wrap;
  }

  function renderTown(area) {
    const card = stream.querySelector('[data-testid="stream-command-card"]');
    if (!card) return;
    card.hidden = false;
    card.innerHTML = '';
    card.dataset.richCardKind = 'town';
    card.dataset.townRichCard = 'true';
    card.append(header(card, `${area.currentArea.name} hub`));

    const town = area.towns?.[0] || null;
    if (!town) {
      const empty = document.createElement('p');
      empty.className = 'thread-town-empty';
      empty.dataset.testid = 'town-empty';
      empty.textContent = `No Town is available in ${area.currentArea.name} yet.`;
      card.append(empty);
      card.scrollIntoView({ block: 'start', inline: 'nearest' });
      return;
    }

    const heading = document.createElement('div');
    heading.className = 'thread-town-heading';
    const name = document.createElement('strong');
    name.dataset.testid = 'town-name';
    name.textContent = town.name;
    const detail = document.createElement('small');
    detail.textContent = `${area.currentArea.name} · ${town.npcs.length} resident${town.npcs.length === 1 ? '' : 's'}`;
    heading.append(name, detail);
    card.append(heading);

    const services = document.createElement('div');
    services.className = 'thread-town-services';
    services.dataset.testid = 'town-services';
    for (const service of town.services || []) {
      const chip = document.createElement('span');
      chip.className = 'thread-town-service';
      chip.textContent = service.replace('_', ' ');
      services.append(chip);
    }
    card.append(services);

    const npcs = document.createElement('div');
    npcs.className = 'thread-town-npcs';
    npcs.dataset.testid = 'town-npcs';
    for (const npc of town.npcs || []) {
      const row = document.createElement('article');
      row.className = 'thread-town-npc';
      row.dataset.testid = `town-npc-${npc.id}`;
      const sprite = createSpriteElement(
        weaverSpriteFrame(npc.id, { variant: npc.spriteVariant === 'female' ? 'female' : 'male' }),
        { className: 'thread-town-npc-sprite', testId: `town-npc-sprite-${npc.id}`, label: `${npc.name} portrait` },
      );
      const copy = document.createElement('div');
      copy.className = 'thread-town-npc-copy';
      const npcName = document.createElement('strong');
      npcName.textContent = npc.name;
      const role = document.createElement('small');
      role.textContent = `${npc.role} service · interaction arrives with NPC dialogue`;
      copy.append(npcName, role);
      row.append(sprite, copy);
      npcs.append(row);
    }
    card.append(npcs);

    const note = document.createElement('p');
    note.className = 'thread-town-note';
    note.textContent = 'Town availability and residents come from Threadbound. NPC interactions remain read-only until the dialogue milestone.';
    card.append(note);
    card.scrollIntoView({ block: 'start', inline: 'nearest' });
  }

  async function openTown() {
    try {
      const payload = await api('/api/areas');
      renderTown(payload.area);
    } catch (error) {
      showError(error.message);
    }
  }

  function installComposerIntercept() {
    const form = stream.querySelector('[data-testid="stream-composer"]');
    const input = stream.querySelector('[data-testid="stream-message"]');
    if (!form || !input || form.dataset.townCommandInstalled === 'true') return false;
    form.dataset.townCommandInstalled = 'true';
    form.addEventListener('submit', (event) => {
      const value = String(input.value || '').trim().toLowerCase();
      if (!['town', '/town'].includes(value)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = '';
      showError('');
      openTown();
    }, true);
    return true;
  }

  if (!installComposerIntercept()) {
    const observer = new MutationObserver(() => {
      if (installComposerIntercept()) observer.disconnect();
    });
    observer.observe(stream, { childList: true, subtree: true });
  }
}
