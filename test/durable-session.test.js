import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { SQLiteArcManifestRepository } from '../src/infrastructure/SQLiteArcManifestRepository.js';
import { SQLiteCodexRepository } from '../src/infrastructure/SQLiteCodexRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { SQLiteSessionStore } from '../src/infrastructure/SQLiteSessionStore.js';

const config = {
  authMode: 'local',
  sessionSecret: 'durable-session-test-secret',
};

async function startApplication(filename) {
  const repository = new SQLiteGameRepository({ filename });
  const codexRepository = new SQLiteCodexRepository({ database: repository.db });
  const manifestRepository = new SQLiteArcManifestRepository({ database: repository.db });
  const app = createApp({ config, threadedGateway: null, repository, codexRepository, manifestRepository });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const address = server.address();
  return {
    app,
    repository,
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function stopApplication(instance) {
  instance.app.locals.realtimeHub.close();
  await new Promise((resolve, reject) => instance.server.close((error) => error ? reject(error) : resolve()));
  instance.repository.close();
}

test('SQLiteSessionStore expires stale rows instead of reviving dead sessions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'threadbound-session-store-'));
  const filename = join(directory, 'threadbound.sqlite');
  const repository = new SQLiteGameRepository({ filename });
  let now = Date.parse('2026-09-09T02:00:00.000Z');
  try {
    const store = new SQLiteSessionStore({ database: repository.db, now: () => now });
    await new Promise((resolve, reject) => store.set('sid-a', {
      cookie: { expires: new Date(now + 1_000).toISOString() },
      threaded: { playerId: 'player-a' },
    }, (error) => error ? reject(error) : resolve()));

    const before = await new Promise((resolve, reject) => store.get('sid-a', (error, session) => error ? reject(error) : resolve(session)));
    assert.equal(before.threaded.playerId, 'player-a');

    now += 2_000;
    const after = await new Promise((resolve, reject) => store.get('sid-a', (error, session) => error ? reject(error) : resolve(session)));
    assert.equal(after, null);
  } finally {
    repository.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('authenticated browser session survives app and repository restart with the same cookie', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'threadbound-session-restart-'));
  const filename = join(directory, 'threadbound.sqlite');
  let first;
  let second;
  try {
    first = await startApplication(filename);
    const login = await fetch(`${first.baseUrl}/auth/local`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'slot=a',
    });
    assert.equal(login.status, 302);
    const setCookie = login.headers.get('set-cookie');
    assert.ok(setCookie?.includes('threadbound.sid='));
    const cookie = setCookie.split(';', 1)[0];

    const connectedBefore = await fetch(`${first.baseUrl}/connected`, { headers: { Cookie: cookie } });
    assert.equal(connectedBefore.status, 200);
    const beforeBody = await connectedBefore.json();
    assert.equal(beforeBody.identity.id, 'local:a');

    await stopApplication(first);
    first = null;

    second = await startApplication(filename);
    const connectedAfter = await fetch(`${second.baseUrl}/connected`, { headers: { Cookie: cookie } });
    assert.equal(connectedAfter.status, 200);
    const afterBody = await connectedAfter.json();
    assert.equal(afterBody.identity.id, 'local:a');
    assert.equal(afterBody.player_id, beforeBody.player_id);
  } finally {
    if (first) await stopApplication(first);
    if (second) await stopApplication(second);
    await rm(directory, { recursive: true, force: true });
  }
});
