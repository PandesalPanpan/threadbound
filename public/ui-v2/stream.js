export const MAX_VISIBLE_STREAM_ENTRIES = 100;

export function streamMessageRole(entry, viewerPlayerId = null) {
  if (entry?.eventType === 'NpcInteracted') return 'npc';
  if (entry?.kind !== 'chat') return 'threadbound';
  if (viewerPlayerId && String(entry.actorPlayerId) === String(viewerPlayerId)) return 'player';
  return 'partner';
}

function roleLabel(role) {
  if (role === 'npc') return 'NPC';
  if (role === 'threadbound') return 'APP';
  return '';
}

export function decorateStreamEntry(row, entry, { viewerPlayerId = null } = {}) {
  if (!row || !entry) return row;
  const role = streamMessageRole(entry, viewerPlayerId);
  row.dataset.messageRole = role;
  row.classList.remove('stream-entry-player', 'stream-entry-partner', 'stream-entry-npc', 'stream-entry-threadbound');
  row.classList.add(`stream-entry-${role}`);
  row.dataset.actorPlayerId = entry.actorPlayerId || '';
  row.dataset.entryKind = entry.kind || '';
  row.dataset.eventType = entry.eventType || '';

  const avatar = row.querySelector('.stream-avatar');
  if (avatar) {
    avatar.textContent = role === 'threadbound' ? 'T' : (entry.actorName || '?').slice(0, 1).toUpperCase();
    avatar.setAttribute('aria-hidden', 'true');
  }

  const meta = row.querySelector('.stream-entry-meta');
  const author = meta?.querySelector('strong');
  if (author && role === 'npc' && entry.actorName) author.textContent = entry.actorName;
  else if (author && role === 'threadbound') author.textContent = 'THREADBOUND';
  const label = roleLabel(role);
  let badge = meta?.querySelector('.stream-role-badge');
  if (!label) badge?.remove();
  else if (meta) {
    if (!badge) {
      badge = document.createElement('span');
      const time = meta.querySelector('time');
      if (time) meta.insertBefore(badge, time);
      else meta.append(badge);
    }
    badge.className = role === 'threadbound' ? 'stream-role-badge stream-app-badge' : 'stream-role-badge';
    badge.textContent = label;
  }
  return row;
}

export function refreshStreamEntryRoles(log, viewerPlayerId = null) {
  if (!log) return;
  for (const row of log.querySelectorAll('.stream-entry[data-entry-id]')) {
    decorateStreamEntry(row, {
      kind: row.dataset.entryKind,
      eventType: row.dataset.eventType,
      actorPlayerId: row.dataset.actorPlayerId,
      actorName: row.querySelector('.stream-entry-meta strong')?.textContent || '',
    }, { viewerPlayerId });
  }
}

export function enforceBoundedStreamHistory(log, limit = MAX_VISIBLE_STREAM_ENTRIES) {
  if (!log) return 0;
  const boundedLimit = Math.max(1, Math.floor(Number(limit) || MAX_VISIBLE_STREAM_ENTRIES));
  const entries = [...log.querySelectorAll(':scope > .stream-entry')];
  const overflow = Math.max(0, entries.length - boundedLimit);
  for (const entry of entries.slice(0, overflow)) entry.remove();
  return overflow;
}
