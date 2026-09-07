import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import WebSocket from 'ws';
import { RealtimeHub } from '../src/infrastructure/RealtimeHub.js';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening', { signal: AbortSignal.timeout(2000) });
  return server.address().port;
}

test('websocket realtime tokens are authenticated, one-use, and receive broadcast payloads', async () => {
  const hub = new RealtimeHub({ tokenTtlMs: 5000 });
  const server = createServer((_request, response) => response.end('ok'));
  hub.attachWebSocketServer(server);
  const port = await listen(server);
  const issued = hub.issueWebSocketToken('player-a');
  const url = `ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(issued.token)}`;
  const client = new WebSocket(url);

  try {
    const connectedMessage = once(client, 'message', { signal: AbortSignal.timeout(2000) });
    await once(client, 'open', { signal: AbortSignal.timeout(2000) });
    const [connectedBytes] = await connectedMessage;
    assert.deepEqual(JSON.parse(connectedBytes.toString()), { type: 'connected', transport: 'websocket' });
    assert.equal(hub.webSocketConnectionCount, 1);

    const broadcastMessage = once(client, 'message', { signal: AbortSignal.timeout(2000) });
    hub.broadcast({ type: 'stream_entry', entry: { id: 'entry-1', kind: 'chat' } });
    const [broadcastBytes] = await broadcastMessage;
    assert.deepEqual(JSON.parse(broadcastBytes.toString()), { type: 'stream_entry', entry: { id: 'entry-1', kind: 'chat' } });

    const replay = new WebSocket(url);
    const replayStatus = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Token replay was not rejected in time.')), 2000);
      replay.once('unexpected-response', (_request, response) => {
        clearTimeout(timeout);
        resolve(response.statusCode);
        response.destroy();
      });
      replay.once('open', () => {
        clearTimeout(timeout);
        reject(new Error('A consumed realtime token unexpectedly connected twice.'));
      });
      replay.once('error', () => {});
    });
    assert.equal(replayStatus, 401);
  } finally {
    client.close();
    hub.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
