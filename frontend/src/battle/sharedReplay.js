export const SHARED_REPLAY_BEAT_MS = 720;

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function huntTurnBeat(turn, index) {
  return {
    index,
    actorId: turn.actor?.id || turn.actorId || null,
    actorName: turn.actor?.label || turn.actorName || 'Weaver',
    actorVisualAssetId: turn.actorVisualAssetId || null,
    targetId: turn.target?.id || turn.targetId || null,
    targetName: turn.target?.label || turn.targetName || 'Enemy',
    targetVisualAssetId: turn.targetVisualAssetId || null,
    damage: numberOr(turn.damage ?? turn.targetDamage),
    retaliation: numberOr(turn.retaliation ?? turn.effectDamage),
    critical: Boolean(turn.critical),
    defeated: Boolean(turn.defeated || numberOr(turn.targetHp?.after ?? turn.targetHpAfter, 1) <= 0),
    actorHpBefore: numberOr(turn.actorHp?.before ?? turn.actorHpBefore),
    actorHpAfter: numberOr(turn.actorHp?.after ?? turn.actorHpAfter),
    targetHpBefore: numberOr(turn.targetHp?.before ?? turn.targetHpBefore),
    targetHpAfter: numberOr(turn.targetHp?.after ?? turn.targetHpAfter),
    targetMaxHp: numberOr(turn.targetMaxHp),
    summary: turn.summary || `${turn.actor?.label || turn.actorName || 'Weaver'} acted.`,
    participants: Array.isArray(turn.participants) ? turn.participants : null,
  };
}

export function replayBeats(replay) {
  if (!replay) return [];
  if (Array.isArray(replay.beats)) return replay.beats.map((beat, index) => ({ ...beat, index }));
  return (replay.details?.turns || replay.turns || []).map(huntTurnBeat);
}

export function replayDurationMs(replay, beatMs = SHARED_REPLAY_BEAT_MS) {
  return replayBeats(replay).length * beatMs;
}

export function replayEpochMs(createdAt) {
  if (typeof createdAt === 'number') return createdAt < 10_000_000_000 ? createdAt * 1000 : createdAt;
  const parsed = Date.parse(String(createdAt || ''));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function replayFrameAt(replay, createdAt, now = Date.now(), { beatMs = SHARED_REPLAY_BEAT_MS, reducedMotion = false } = {}) {
  const beats = replayBeats(replay);
  if (!beats.length) return { elapsedMs: 0, visibleIndex: -1, complete: true, progress: 1 };
  const durationMs = replayDurationMs(replay, beatMs);
  const elapsedMs = Math.max(0, Math.min(durationMs, reducedMotion ? durationMs : now - replayEpochMs(createdAt)));
  const complete = reducedMotion || elapsedMs >= durationMs;
  const visibleIndex = complete ? beats.length - 1 : Math.min(beats.length - 1, Math.floor(elapsedMs / beatMs));
  return {
    elapsedMs,
    visibleIndex,
    complete,
    progress: durationMs ? elapsedMs / durationMs : 1,
  };
}

export function sharedReplayKind(replay) {
  if (replay?.kind === 'simple-dungeon-battle') return 'dungeon';
  if (replay?.kind === 'automatic-battle-result' || replay?.details?.turns) return 'hunt';
  return null;
}
