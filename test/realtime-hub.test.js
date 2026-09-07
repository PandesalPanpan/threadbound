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

async function connect(hub, port, playerId) {
  const issued = hub.issueWebSocketToken(playerId);
  const url = `ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(issued.token)}`;
  const client = new WebSocket(url);
  const connectedMessage = once(client, 'message', { signal: AbortSignal.timeout(2000) });
  await once(client, 'open', { signal: AbortSignal.timeout(2000) });
  const [connectedBytes] = await connectedMessage;
  assert.deepEqual(JSON.parse(connectedBytes.toString()), { type: 'connected', transport: 'websocket' });
  return { client, url };
}

function expectNoMessage(client, timeoutMs = 150) {
  return new Promise((resolve, reject) => {
    const onMessage = () => {
      clearTimeout(timer);
      reject(new Error('Unexpected realtime message reached an unrelated player.'));
    };
    const timer = setTimeout(() => {
      client.off('message', onMessage);
      resolve();
    }, timeoutMs);
    client.once('message', onMessage);
  });
}

test('websocket realtime tokens are authenticated, one-use, and broadcasts can target affected players', async () => {
  const hub = new RealtimeHub({ tokenTtlMs: 5000 });
  const server = createServer((_request, response) => response.end('ok'));
  hub.attachWebSocketServer(server);
  const port = await listen(server);
  const first = await connect(hub, port, 'player-a');
  const second = await connect(hub, port, 'player-b');

  try {
    assert.equal(hub.webSocketConnectionCount, 2);

    const firstGlobal = once(first.client, 'message', { signal: AbortSignal.timeout(2000) });
    const secondGlobal = once(second.client, 'message', { signal: AbortSignal.timeout(2000) });
    hub.broadcast({ type: 'stream_entry', entry: { id: 'entry-1', kind: 'chat' } });
    assert.deepEqual(JSON.parse((await firstGlobal)[0].toString()), { type: 'stream_entry', entry: { id: 'entry-1', kind: 'chat' } });
    assert.deepEqual(JSON.parse((await secondGlobal)[0].toString()), { type: 'stream_entry', entry: { id: 'entry-1', kind: 'chat' } });

    const targetedMessage = once(first.client, 'message', { signal: AbortSignal.timeout(2000) });
    const unrelatedSilence = expectNoMessage(second.client);
    hub.broadcast({ type: 'state_changed', eventType: 'EnemyDamaged' }, { playerIds: ['player-a'] });
    assert.deepEqual(JSON.parse((await targetedMessage)[0].toString()), { type: 'state_changed', eventType: 'EnemyDamaged' });
    await unrelatedSilence;

    const replay = new WebSocket(first.url);
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
    first.client.close();
    second.client.close();
    hub.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
