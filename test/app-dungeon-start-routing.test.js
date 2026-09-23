import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { EventBus } from '../src/application/EventBus.js';
import { PartyService } from '../src/application/PartyService.js';
import { SQLiteArcManifestRepository } from '../src/infrastructure/SQLiteArcManifestRepository.js';
import { SQLiteAreaRepository } from '../src/infrastructure/SQLiteAreaRepository.js';
import { SQLiteCodexRepository } from '../src/infrastructure/SQLiteCodexRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

test('Dungeon start route gates canonical Area challenges, checks every party member Area, and preserves legacy starts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'threadbound-dungeon-routing-'));
  const repository = new SQLiteGameRepository({ filename: join(directory, 'threadbound.sqlite') });
  const codexRepository = new SQLiteCodexRepository({ database: repository.db });
  const manifestRepository = new SQLiteArcManifestRepository({ database: repository.db });
  const app = createApp({
    config: { authMode: 'local', sessionSecret: 'dungeon-routing-test-secret' },
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
    const login = await fetch(`${baseUrl}/auth/local`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'slot=a',
    });
    assert.equal(login.status, 302);
    const cookie = login.headers.get('set-cookie').split(';', 1)[0];
    const playerAConnection = await fetch(`${baseUrl}/connected`, { headers: { Cookie: cookie } });
    const playerA = (await playerAConnection.json()).player_id;

    const challengeResponse = await fetch(`${baseUrl}/api/dungeons/brightbell-trial/start`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    assert.equal(challengeResponse.status, 409);
    assert.equal((await challengeResponse.json()).error, 'progression_party_required');
    assert.equal(repository.getActiveRun(playerA), null);

    const legacyResponse = await fetch(`${baseUrl}/api/dungeons/frayed-hollow/start`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    assert.equal(legacyResponse.status, 201);
    assert.ok((await legacyResponse.json()).run.id);

    const loginB = await fetch(`${baseUrl}/auth/local`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'slot=b',
    });
    assert.equal(loginB.status, 302);
    const cookieB = loginB.headers.get('set-cookie').split(';', 1)[0];
    const playerBConnection = await fetch(`${baseUrl}/connected`, { headers: { Cookie: cookieB } });
    const playerB = (await playerBConnection.json()).player_id;
    const loginC = await fetch(`${baseUrl}/auth/local`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'slot=c',
    });
    assert.equal(loginC.status, 302);
    const cookieC = loginC.headers.get('set-cookie').split(';', 1)[0];
    const playerCConnection = await fetch(`${baseUrl}/connected`, { headers: { Cookie: cookieC } });
    const playerC = (await playerCConnection.json()).player_id;

    const parties = new PartyService({ repository, eventBus: new EventBus() });
    const party = parties.createParty(playerB);
    parties.joinParty(playerC, party.joinCode);
    parties.setReady(playerC, true);
    new SQLiteAreaRepository({ database: repository.db }).save(playerC, {
      currentAreaNumber: 2,
      highestUnlockedAreaNumber: 2,
    });

    const splitPartyResponse = await fetch(`${baseUrl}/api/dungeons/brightbell-trial/start`, {
      method: 'POST',
      headers: { Cookie: cookieB },
    });
    assert.equal(splitPartyResponse.status, 409);
    assert.equal((await splitPartyResponse.json()).error, 'progression_challenge_area_mismatch');
    assert.equal(repository.getActiveRun(playerB), null);
    assert.equal(repository.getActiveRun(playerC), null);

    new SQLiteAreaRepository({ database: repository.db }).save(playerC, {
      currentAreaNumber: 1,
      highestUnlockedAreaNumber: 2,
    });
    const progressionStartResponse = await fetch(`${baseUrl}/api/dungeons/brightbell-trial/start`, {
      method: 'POST',
      headers: { Cookie: cookieB },
    });
    assert.equal(progressionStartResponse.status, 201);
    const progressionBody = await progressionStartResponse.json();
    assert.ok(progressionBody.run.id);
    assert.equal(progressionBody.run.simpleCombat, true);
    assert.ok(progressionBody.battleReplay);
    assert.equal(progressionBody.battleReplay.kind, 'simple-dungeon-battle');
  } finally {
    app.locals.realtimeHub.close();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    repository.close();
    await rm(directory, { recursive: true, force: true });
  }
});
