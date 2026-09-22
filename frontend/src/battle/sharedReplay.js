export const SHARED_REPLAY_BEAT_MS = 1250;

const WINDUP_END = 0.18;
const TRAJECTORY_END = 0.42;
const IMPACT_END = 0.68;

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function textOr(value, fallback) {
  return value == null || value === '' ? fallback : String(value);
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
    targetIsBoss: Boolean(turn.targetIsBoss),
    damage: numberOr(turn.damage ?? turn.targetDamage),
    retaliation: numberOr(turn.retaliation ?? turn.effectDamage),
    retaliationActorId: turn.retaliationActorId || null,
    retaliationActorName: turn.retaliationActorName || null,
    retaliationActorVisualAssetId: turn.retaliationActorVisualAssetId || null,
    retaliationTargetId: turn.retaliationTargetId || null,
    retaliationTargetName: turn.retaliationTargetName || null,
    retaliationTargetVisualAssetId: turn.retaliationTargetVisualAssetId || null,
    critical: Boolean(turn.critical),
    defeated: Boolean(turn.defeated || numberOr(turn.targetHp?.after ?? turn.targetHpAfter, 1) <= 0),
    actorHpBefore: numberOr(turn.actorHp?.before ?? turn.actorHpBefore),
    actorHpAfter: numberOr(turn.actorHp?.after ?? turn.actorHpAfter),
    targetHpBefore: numberOr(turn.targetHp?.before ?? turn.targetHpBefore),
    targetHpAfter: numberOr(turn.targetHp?.after ?? turn.targetHpAfter),
    retaliationActorHpBefore: numberOr(turn.retaliationActorHpBefore),
    retaliationActorHpAfter: numberOr(turn.retaliationActorHpAfter),
    retaliationTargetHpBefore: numberOr(turn.retaliationTargetHpBefore),
    retaliationTargetHpAfter: numberOr(turn.retaliationTargetHpAfter),
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

function replayCombatants(replay) {
  const battleCombatants = Array.isArray(replay?.battle?.combatants) ? replay.battle.combatants : [];
  const players = replay?.players || replay?.battle?.players || battleCombatants.filter((entry) => entry.team === 'players');
  const enemy = replay?.enemy || replay?.battle?.enemy || battleCombatants.find((entry) => entry.team === 'enemies') || null;
  const entries = [...(Array.isArray(players) ? players : []), enemy].filter(Boolean);
  return new Map(entries.map((entry) => [String(entry.id || entry.playerId || entry.enemyId || entry.name), entry]));
}

function directMoment(beat, momentIndex, combatants) {
  const actorId = beat.actorId || beat.actor?.id || null;
  const targetId = beat.targetId || beat.target?.id || null;
  if (!actorId || !targetId) return null;

  const actor = combatants.get(String(actorId));
  const target = combatants.get(String(targetId));
  const hasRetaliation = numberOr(beat.retaliation) > 0 && (beat.retaliationActorId || beat.retaliationTargetId);
  return {
    momentIndex,
    beatIndex: beat.index,
    actorId,
    actorName: textOr(beat.actorName || beat.actor?.label, actor?.name || actor?.label || 'Weaver'),
    actorVisualAssetId: beat.actorVisualAssetId || actor?.visualAssetId || null,
    targetId,
    targetName: textOr(beat.targetName || beat.target?.label, target?.name || target?.label || 'Enemy'),
    targetVisualAssetId: beat.targetVisualAssetId || target?.visualAssetId || null,
    targetIsBoss: Boolean(beat.targetIsBoss || target?.isBoss),
    damage: numberOr(beat.damage ?? beat.targetDamage),
    critical: Boolean(beat.critical),
    defeated: Boolean(beat.defeated),
    actorHpBefore: numberOr(beat.actorHpBefore ?? beat.actorHp?.before ?? actor?.hp),
    actorHpAfter: hasRetaliation ? numberOr(beat.actorHpBefore ?? beat.actorHp?.before ?? actor?.hp) : numberOr(beat.actorHpAfter ?? beat.actorHp?.after ?? actor?.hp),
    targetHpBefore: numberOr(beat.targetHpBefore ?? beat.targetHp?.before ?? target?.hp),
    targetHpAfter: numberOr(beat.targetHpAfter ?? beat.targetHp?.after ?? target?.hp),
    targetMaxHp: numberOr(beat.targetMaxHp ?? target?.maxHp),
    summary: beat.summary || `${textOr(beat.actorName || beat.actor?.label, actor?.name || 'Weaver')} attacks ${textOr(beat.targetName || beat.target?.label, target?.name || 'Enemy')}.`,
    retaliation: false,
  };
}

function retaliationMoment(beat, momentIndex, combatants) {
  const damage = numberOr(beat.retaliation);
  const actorId = beat.retaliationActorId || beat.targetId || null;
  const targetId = beat.retaliationTargetId || beat.actorId || null;
  if (!damage || !actorId || !targetId) return null;

  const actor = combatants.get(String(actorId));
  const target = combatants.get(String(targetId));
  return {
    momentIndex,
    beatIndex: beat.index,
    actorId,
    actorName: beat.retaliationActorName || actor?.name || actor?.label || beat.targetName || 'Enemy',
    actorVisualAssetId: beat.retaliationActorVisualAssetId || actor?.visualAssetId || beat.targetVisualAssetId || null,
    targetId,
    targetName: beat.retaliationTargetName || target?.name || target?.label || beat.actorName || 'Weaver',
    targetVisualAssetId: beat.retaliationTargetVisualAssetId || target?.visualAssetId || beat.actorVisualAssetId || null,
    targetIsBoss: Boolean(target?.isBoss),
    damage,
    critical: false,
    defeated: numberOr(beat.retaliationTargetHpAfter, 1) <= 0,
    actorHpBefore: numberOr(beat.retaliationActorHpBefore ?? actor?.hp),
    actorHpAfter: numberOr(beat.retaliationActorHpAfter ?? actor?.hp),
    targetHpBefore: numberOr(beat.retaliationTargetHpBefore ?? target?.hp),
    targetHpAfter: numberOr(beat.retaliationTargetHpAfter ?? target?.hp),
    targetMaxHp: numberOr(target?.maxHp),
    summary: `${beat.retaliationActorName || actor?.name || actor?.label || beat.targetName || 'Enemy'} retaliates against ${beat.retaliationTargetName || target?.name || target?.label || beat.actorName || 'Weaver'} for ${damage} damage.`,
    retaliation: true,
  };
}

export function replayMoments(replay) {
  const combatants = replayCombatants(replay);
  const moments = [];
  for (const beat of replayBeats(replay)) {
    const direct = directMoment(beat, moments.length, combatants);
    if (direct) moments.push(direct);
    const retaliation = retaliationMoment(beat, moments.length, combatants);
    if (retaliation) moments.push(retaliation);
    if (!direct && !retaliation && beat.summary) {
      moments.push({
        momentIndex: moments.length,
        beatIndex: beat.index,
        actorId: beat.actorId || null,
        actorName: beat.actorName || 'Weaver',
        actorVisualAssetId: beat.actorVisualAssetId || null,
        targetId: beat.targetId || null,
        targetName: beat.targetName || 'Enemy',
        targetVisualAssetId: beat.targetVisualAssetId || null,
        targetIsBoss: Boolean(beat.targetIsBoss),
        damage: 0,
        critical: false,
        defeated: false,
        actorHpBefore: 0,
        actorHpAfter: 0,
        targetHpBefore: 0,
        targetHpAfter: 0,
        targetMaxHp: 0,
        summary: beat.summary,
        retaliation: false,
      });
    }
  }
  return moments;
}

export function replayDurationMs(replay, beatMs = SHARED_REPLAY_BEAT_MS) {
  return replayMoments(replay).length * beatMs;
}

export function replayEpochMs(createdAt) {
  if (typeof createdAt === 'number') return createdAt < 10_000_000_000 ? createdAt * 1000 : createdAt;
  const parsed = Date.parse(String(createdAt || ''));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function phaseAt(progress) {
  if (progress < WINDUP_END) return 'windup';
  if (progress < TRAJECTORY_END) return 'trajectory';
  if (progress < IMPACT_END) return 'impact';
  return 'settle';
}

export function replayFrameAt(replay, createdAt, now = Date.now(), { beatMs = SHARED_REPLAY_BEAT_MS, reducedMotion = false } = {}) {
  const moments = replayMoments(replay);
  if (!moments.length) {
    return {
      elapsedMs: 0,
      visibleIndex: -1,
      momentIndex: -1,
      momentProgress: 1,
      phase: 'complete',
      currentActorId: null,
      currentTargetId: null,
      complete: true,
      progress: 1,
    };
  }
  const durationMs = replayDurationMs(replay, beatMs);
  const elapsedMs = Math.max(0, Math.min(durationMs, reducedMotion ? durationMs : now - replayEpochMs(createdAt)));
  const complete = reducedMotion || elapsedMs >= durationMs;
  const momentIndex = complete ? moments.length - 1 : Math.min(moments.length - 1, Math.floor(elapsedMs / beatMs));
  const momentProgress = complete ? 1 : Math.max(0, Math.min(1, (elapsedMs - momentIndex * beatMs) / beatMs));
  const moment = moments[momentIndex];
  return {
    elapsedMs,
    visibleIndex: moment?.beatIndex ?? -1,
    momentIndex,
    momentProgress,
    phase: complete ? 'complete' : phaseAt(momentProgress),
    currentActorId: complete ? null : moment?.actorId || null,
    currentTargetId: complete ? null : moment?.targetId || null,
    complete,
    progress: durationMs ? elapsedMs / durationMs : 1,
  };
}

export function sharedReplayKind(replay) {
  if (replay?.kind === 'simple-dungeon-battle') return 'dungeon';
  if (replay?.kind === 'automatic-battle-result' || replay?.details?.turns) return 'hunt';
  return null;
}
