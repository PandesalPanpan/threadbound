import test from 'node:test';
import assert from 'node:assert/strict';
import { connectRealtime } from '../frontend/src/api/client.js';

test('realtime client retries a closed socket and reports connection state for stream reconciliation', async () => {
  const originals = new Map(['fetch', 'WebSocket', 'window', 'location'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const sockets = [];
  const timers = new Map();
  const statuses = [];
  const messages = [];
  let nextTimer = 0;

  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.listeners = new Map();
      sockets.push(this);
    }
    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) || [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }
    emit(type, event = {}) {
      for (const listener of this.listeners.get(type) || []) listener(event);
    }
    close() { this.emit('close'); }
  }

  const setGlobal = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  setGlobal('fetch', async () => new Response(JSON.stringify({ token: `token-${sockets.length + 1}` }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }));
  setGlobal('WebSocket', FakeWebSocket);
  setGlobal('location', { protocol: 'https:', host: 'threadbound.test' });
  setGlobal('window', {
    setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
  });

  try {
    const close = connectRealtime((message) => messages.push(message), (connected) => statuses.push(connected));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(sockets.length, 1);
    assert.match(sockets[0].url, /^wss:\/\/threadbound\.test\/ws\?token=/);
    sockets[0].emit('open');
    sockets[0].emit('message', { data: JSON.stringify({ type: 'state_changed' }) });
    assert.deepEqual(messages, [{ type: 'state_changed' }]);
    sockets[0].emit('close');
    assert.deepEqual(statuses, [false, true, false]);

    const [timerId, retry] = timers.entries().next().value;
    timers.delete(timerId);
    retry();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(sockets.length, 2);
    sockets[1].emit('open');
    assert.equal(statuses.at(-1), true);
    close();
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
