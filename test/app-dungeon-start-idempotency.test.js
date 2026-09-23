import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { EventBus } from '../src/application/EventBus.js';
import { PartyService } from '../src/application/PartyService.js';
import { SQLiteArcManifestRepository } from '../src/infrastructure/SQLiteArcManifestRepository.js';
import { SQLiteCodexRepository } from '../src/infrastructure/SQLiteCodexRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

test('shared progression Dungeon start replays its committed response for the same idempotency key', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'threadbound-dungeon-start-idempotency-'));
  const repository = new SQLiteGameRepository({ filename: join(directory, 'threadbound.sqlite') });
  const codexRepository = new SQLiteCodexRepository({ database: repository.db });
  const manifestRepository = new SQLiteArcManifestRepository({ database: repository.db });
  const app = createApp({
    config: { authMode: 'local', sessionSecret: 'dungeon-start-idempotency-secret' },
    threadedGateway: null,
    repository,
    codexRepository,
    manifestRepository,
  });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const connect = async (slot) => {
      const login = await fetch(`${baseUrl}/auth/local`, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `slot=${slot}`,
      });
      assert.equal(login.status, 302);
      const cookie = login.headers.get('set-cookie').split(';', 1)[0];
      const connected = await fetch(`${baseUrl}/connected`, { headers: { Cookie: cookie } });
      return { cookie, playerId: (await connected.json()).player_id };
    };

    const leader = await connect('a');
    const partner = await connect('b');
    const parties = new PartyService({ repository, eventBus: new EventBus() });
    const party = parties.createParty(leader.playerId);
    parties.joinParty(partner.playerId, party.joinCode);
    parties.setReady(partner.playerId, true);

    const path = '/api/dungeons/brightbell-trial/start-shared';
    const idempotencyKey = 'progression-start-command-001';
    const headers = { Cookie: leader.cookie, 'Idempotency-Key': idempotencyKey };
    const firstResponse = await fetch(`${baseUrl}${path}`, { method: 'POST', headers });
    assert.equal(firstResponse.status, 201);
    assert.equal(firstResponse.headers.get('Idempotency-Replayed'), 'false');
    const firstBody = await firstResponse.json();
    assert.ok(firstBody.run.id);
    assert.ok(firstBody.battleReplay);

    const committedRun = repository.getRun(firstBody.run.id);
    assert.equal(committedRun.version, firstBody.run.version);
    assert.equal(repository.getActiveRun(leader.playerId).id, committedRun.id);
    assert.equal(repository.getActiveRun(partner.playerId).id, committedRun.id);
    assert.equal(repository.db.prepare('SELECT COUNT(*) AS count FROM dungeon_runs').get().count, 1);

    const retryResponse = await fetch(`${baseUrl}${path}`, { method: 'POST', headers });
    assert.equal(retryResponse.status, 201);
    assert.equal(retryResponse.headers.get('Idempotency-Replayed'), 'true');
    assert.deepEqual(await retryResponse.json(), firstBody);

    const runAfterRetry = repository.getRun(firstBody.run.id);
    assert.equal(runAfterRetry.version, committedRun.version);
    assert.equal(repository.db.prepare('SELECT COUNT(*) AS count FROM dungeon_runs').get().count, 1);
    const idempotencyRecord = repository.db.prepare(`
      SELECT state, response_status FROM run_command_idempotency
      WHERE player_id = ? AND idempotency_key = ?
    `).get(leader.playerId, idempotencyKey);
    assert.deepEqual({ ...idempotencyRecord }, { state: 'completed', response_status: 201 });
  } finally {
    app.locals.realtimeHub.close();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    repository.close();
    await rm(directory, { recursive: true, force: true });
  }
});
