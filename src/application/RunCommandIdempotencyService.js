import { createHash } from 'node:crypto';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function runCommandFingerprint({ method, path, body }) {
  const canonical = JSON.stringify({
    method: String(method || 'POST').toUpperCase(),
    path: String(path || ''),
    body: canonicalize(body ?? null),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function commandNameFromPath(path) {
  const parts = String(path || '').split('/').filter(Boolean);
  const runIndex = parts.indexOf('runs');
  if (runIndex < 0) return 'run-command';
  return parts.slice(runIndex + 2).join(':') || 'run-command';
}

export class RunCommandIdempotencyService {
  constructor({ repository }) {
    if (!repository) throw new Error('RunCommandIdempotencyService requires a repository.');
    this.repository = repository;
  }

  begin({ playerId, idempotencyKey, method = 'POST', path, body, runId }) {
    const key = String(idempotencyKey || '').trim();
    if (!key) return { mode: 'bypass' };
    if (key.length < 8 || key.length > 128) {
      const error = new Error('Idempotency-Key must be between 8 and 128 characters.');
      error.code = 'invalid_idempotency_key';
      throw error;
    }

    const fingerprint = runCommandFingerprint({ method, path, body });
    const commandName = commandNameFromPath(path);
    const claim = this.repository.claim({
      playerId,
      idempotencyKey: key,
      fingerprint,
      commandName,
      runId: String(runId || ''),
    });

    if (claim.claimed) {
      return {
        mode: 'claimed',
        playerId,
        idempotencyKey: key,
        fingerprint,
        commandName,
        runId: String(runId || ''),
      };
    }

    const existing = claim.record;
    if (!existing || existing.fingerprint !== fingerprint) {
      const error = new Error('This Idempotency-Key was already used for a different run command.');
      error.code = 'run_command_replay_mismatch';
      throw error;
    }
    if (existing.state !== 'completed') {
      const error = new Error('A previous run command with this Idempotency-Key has an unresolved outcome. Refresh authoritative state before issuing a new command.');
      error.code = 'run_command_in_progress';
      throw error;
    }

    return {
      mode: 'replay',
      responseStatus: existing.responseStatus,
      responseBody: existing.responseBody,
      commandName: existing.commandName,
      runId: existing.runId,
    };
  }

  complete(claim, { responseStatus, responseBody }) {
    if (!claim || claim.mode !== 'claimed') return null;
    return this.repository.complete({
      playerId: claim.playerId,
      idempotencyKey: claim.idempotencyKey,
      fingerprint: claim.fingerprint,
      responseStatus,
      responseBody,
    });
  }
}
