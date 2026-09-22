export async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('json') ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof payload === 'object' ? payload.message : payload;
    const error = new Error(message || `Request failed (${response.status})`);
    error.status = response.status;
    error.code = typeof payload === 'object' ? payload.error : null;
    throw error;
  }
  return payload;
}

export function commandKey(prefix = 'battle') {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}

export function getDashboard() {
  return api('/api/dashboard');
}

export function getVisualAssets() {
  return api('/api/visual-assets');
}

export function getStream({ limit = 30, before = null } = {}) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (before) query.set('before', before);
  return api(`/api/stream?${query.toString()}`);
}

export function postStreamMessage(body) {
  return api('/api/stream/messages', { method: 'POST', body: JSON.stringify({ body }) });
}

export function postInventoryView() {
  return api('/api/stream/inventory-view', { method: 'POST' });
}

export function postStatusView() {
  return api('/api/stream/status-view', { method: 'POST' });
}

export function postShopView() {
  return api('/api/stream/shop-view', { method: 'POST' });
}

export function getAreas() {
  return api('/api/areas');
}

export function getQuests() {
  return api('/api/quests');
}

export function getShop() {
  return api('/api/shop');
}

export function getGambling() {
  return api('/api/gambling');
}

export function getCodex({ category = 'all', query = '' } = {}) {
  const params = new URLSearchParams({ category });
  if (query.trim()) params.set('q', query.trim());
  return api(`/api/codex?${params.toString()}`);
}

export async function connectRealtime(onMessage) {
  if (!('WebSocket' in globalThis)) return () => {};
  try {
    const tokenPayload = await api('/api/realtime-token');
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/ws?token=${encodeURIComponent(tokenPayload.token)}`);
    socket.addEventListener('message', (event) => {
      try { onMessage(JSON.parse(event.data)); } catch { /* Ignore malformed projections. */ }
    });
    return () => socket.close();
  } catch {
    return () => {};
  }
}
