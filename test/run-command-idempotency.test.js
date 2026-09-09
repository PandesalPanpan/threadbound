import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { RunCommandIdempotencyService, runCommandFingerprint } from '../src/application/RunCommandIdempotencyService.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { SQLiteRunCommandRepository } from '../src/infrastructure/SQLiteRunCommandRepository.js';

function setup(filename = ':memory:') {
  const gameRepository = new SQLiteGameRepository({ filename });
  const player = gameRepository.getOrCreatePlayer({ threadedUserId: 'threaded:px48', displayName: 'Retry Weaver' });
  const commandRepository = new SQLiteRunCommandRepository({ database: gameRepository.db });
  const service = new RunCommandIdempotencyService({ repository: commandRepository });
  return { gameRepository, player, commandRepository, service };
}

test('run command fingerprint is stable across object key order', () => {
  const left = runCommandFingerprint({ method: 'POST', path: '/api/runs/run-1/mend', body: { targetPlayerId: 'b', meta: { z: 2, a: 1 } } });
  const right = runCommandFingerprint({ method: 'post', path: '/api/runs/run-1/mend', body: { meta: { a: 1, z: 2 }, targetPlayerId: 'b' } });
  assert.equal(left, right);
});

test('completed run command replays the stored response without claiming execution again', () => {
  const { gameRepository, player, service } = setup();
  try {
    const first = service.begin({
      playerId: player.id,
      idempotencyKey: 'run-command-key-001',
      method: 'POST',
      path: '/api/runs/run-1/attack',
      body: {},
      runId: 'run-1',
    });
    assert.equal(first.mode, 'claimed');
    service.complete(first, { responseStatus: 200, responseBody: { state: { id: 'run-1', version: 4 }, damage: 6 } });

    const retry = service.begin({
      playerId: player.id,
      idempotencyKey: 'run-command-key-001',
      method: 'POST',
      path: '/api/runs/run-1/attack',
      body: {},
      runId: 'run-1',
    });
    assert.equal(retry.mode, 'replay');
    assert.equal(retry.responseStatus, 200);
    assert.deepEqual(retry.responseBody, { state: { id: 'run-1', version: 4 }, damage: 6 });
  } finally {
    gameRepository.close();
  }
});

test('same idempotency key cannot be reused for a different command or payload', () => {
  const { gameRepository, player, service } = setup();
  try {
    const claim = service.begin({ playerId: player.id, idempotencyKey: 'run-command-key-002', path: '/api/runs/run-1/mend', body: { targetPlayerId: 'ally-a' }, runId: 'run-1' });
    service.complete(claim, { responseStatus: 200, responseBody: { ok: true } });

    assert.throws(
      () => service.begin({ playerId: player.id, idempotencyKey: 'run-command-key-002', path: '/api/runs/run-1/mend', body: { targetPlayerId: 'ally-b' }, runId: 'run-1' }),
      (error) => error.code === 'run_command_replay_mismatch',
    );
    assert.throws(
      () => service.begin({ playerId: player.id, idempotencyKey: 'run-command-key-002', path: '/api/runs/run-1/guard', body: {}, runId: 'run-1' }),
      (error) => error.code === 'run_command_replay_mismatch',
    );
  } finally {
    gameRepository.close();
  }
});

test('pending durable claim blocks blind duplicate execution after an interrupted server path', () => {
  const { gameRepository, player, service } = setup();
  try {
    const first = service.begin({ playerId: player.id, idempotencyKey: 'run-command-key-003', path: '/api/runs/run-1/attack', body: {}, runId: 'run-1' });
    assert.equal(first.mode, 'claimed');
    assert.throws(
      () => service.begin({ playerId: player.id, idempotencyKey: 'run-command-key-003', path: '/api/runs/run-1/attack', body: {}, runId: 'run-1' }),
      (error) => error.code === 'run_command_in_progress',
    );
  } finally {
    gameRepository.close();
  }
});

test('completed idempotency record survives SQLite repository restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'threadbound-px48-'));
  const filename = join(directory, 'threadbound.sqlite');
  try {
    const firstSetup = setup(filename);
    const playerId = firstSetup.player.id;
    const claim = firstSetup.service.begin({ playerId, idempotencyKey: 'run-command-key-004', path: '/api/runs/run-1/attack', body: {}, runId: 'run-1' });
    firstSetup.service.complete(claim, { responseStatus: 200, responseBody: { state: { version: 9 } } });
    firstSetup.gameRepository.close();

    const secondRepository = new SQLiteGameRepository({ filename });
    const secondService = new RunCommandIdempotencyService({ repository: new SQLiteRunCommandRepository({ database: secondRepository.db }) });
    try {
      const replay = secondService.begin({ playerId, idempotencyKey: 'run-command-key-004', path: '/api/runs/run-1/attack', body: {}, runId: 'run-1' });
      assert.equal(replay.mode, 'replay');
      assert.deepEqual(replay.responseBody, { state: { version: 9 } });
    } finally {
      secondRepository.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
