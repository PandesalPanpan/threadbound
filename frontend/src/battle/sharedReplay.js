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
    // Periodic effect damage is suffered by the acting combatant. It must not
    // be replayed as a second enemy attack.
    retaliation: numberOr(turn.retaliation),
    retaliationActorId: turn.retaliationActorId || null,
    retaliationActorName: turn.retaliationActorName || null,
    retaliationActorVisualAssetId: turn.retaliationActorVisualAssetId || null,
    retaliationTargetId: turn.retaliationTargetId || null,
    retaliationTargetName: turn.retaliationTargetName || null,
    retaliationTargetVisualAssetId: turn.retaliationTargetVisualAssetId || null,
    critical: Boolean(turn.critical),
    defeated: Boolean(turn.defeated || numberOr(turn.targetHp?.after ?? turn.targetHpAfter, 1) <= 0),
    actorHpBefore: numberOr(turn.actorHp?.before ?? turn.actorHpBefore),
    actorHpAfterEffects: numberOr(turn.actorHp?.afterEffects ?? turn.actorHpAfterEffects),
    actorHpAfter: numberOr(turn.actorHp?.after ?? turn.actorHpAfter),
    actorManaBefore: turn.actorMana?.before ?? turn.actorManaBefore ?? turn.manaBefore ?? null,
    actorManaAfter: turn.actorMana?.after ?? turn.actorManaAfter ?? turn.manaAfter ?? null,
    actionType: turn.actionType || null,
    skillId: turn.skillId || null,
    events: Array.isArray(turn.events) ? turn.events : [],
    effectDamage: numberOr(turn.effectDamage),
    selfDamage: numberOr(turn.selfDamage),
    damageEvents: Array.isArray(turn.damageEvents) ? turn.damageEvents : [],
    healingEvents: Array.isArray(turn.healingEvents) ? turn.healingEvents : [],
    manaEvents: Array.isArray(turn.manaEvents) ? turn.manaEvents : [],
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
  if (Array.isArray(replay.actions)) return replay.actions.map((beat, index) => ({ ...beat, index }));
  if (Array.isArray(replay.beats)) return replay.beats.map((beat, index) => ({ ...beat, index }));
  return (replay.details?.turns || replay.turns || []).map(huntTurnBeat);
}

function replayCombatants(replay) {
  const battleCombatants = Array.isArray(replay?.battle?.combatants) ? replay.battle.combatants : [];
  const players = replay?.players || replay?.battle?.players || battleCombatants.filter((entry) => entry.team === 'players');
  const enemies = Array.isArray(replay?.enemies) && replay.enemies.length
    ? replay.enemies
    : [replay?.enemy || replay?.battle?.enemy || battleCombatants.find((entry) => entry.team === 'enemies') || null];
  const details = Array.isArray(replay?.details?.combatants) ? replay.details.combatants : [];
  const entries = [...(Array.isArray(players) ? players : []), ...enemies, ...details].filter(Boolean);
  return new Map(entries.map((entry) => [String(entry.combatantId || entry.id || entry.playerId || entry.enemyId || entry.name), entry]));
}

function directMoment(beat, momentIndex, combatants) {
  const actorId = beat.actorCombatantId || beat.actorId || beat.actor?.id || null;
  const targetId = beat.targetCombatantId || beat.targetId || beat.target?.id || null;
  if (!actorId || !targetId) return null;

  const actor = combatants.get(String(actorId));
  const target = combatants.get(String(targetId));
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
    actorHpAfter: null,
    actorManaBefore: beat.actorManaBefore ?? beat.manaBefore ?? null,
    actorManaAfter: beat.actorManaAfter ?? beat.manaAfter ?? null,
    actionType: beat.actionType || beat.metadata?.actionType || null,
    skillId: beat.skillId || beat.metadata?.skillId || null,
    events: eventsForBeat(beat),
    manaEvents: Array.isArray(beat.manaEvents) ? beat.manaEvents : [],
    targetHpBefore: numberOr(beat.targetHpBefore ?? beat.targetHp?.before ?? target?.hp),
    targetHpAfter: numberOr(beat.targetHpAfter ?? beat.targetHp?.after ?? target?.hp),
    targetMaxHp: numberOr(beat.targetMaxHp ?? target?.maxHp),
    summary: beat.summary || `${textOr(beat.actorName || beat.actor?.label, actor?.name || 'Weaver')} attacks ${textOr(beat.targetName || beat.target?.label, target?.name || 'Enemy')}.`,
    retaliation: false,
  };
}

function eventsForBeat(beat) {
  const events = Array.isArray(beat.events) ? [...beat.events] : [];
  for (const event of [...(beat.effectEvents || []), ...(beat.metadata?.effectEvents || [])]) {
    if (!event || typeof event !== 'object') continue;
    const type = event.effect || event.type || 'status';
    const kind = event.kind
      || (event.expired ? 'effect-expired' : event.damage > 0 ? 'effect-damage' : event.blocked || event.applied === false ? 'effect-blocked' : 'effect-applied');
    events.push({
      ...event,
      kind,
      effect: type,
      targetId: event.targetId || beat.actorCombatantId || beat.actorId || null,
    });
  }
  const seen = new Set();
  return events.filter((event) => {
    if (!event || typeof event !== 'object') return true;
    const key = `${event.kind || ''}|${event.effect || event.type || ''}|${event.targetId || ''}|${event.damage || 0}|${event.resistanceLevel || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function eventMoment(beat, momentIndex, combatants, {
  targetId,
  damage = 0,
  healing = 0,
  targetHpBefore = null,
  targetHpAfter = null,
  summary = null,
  events = [],
  manaEvents = [],
  actionType = null,
  skillId = null,
  defeated = false,
} = {}) {
  const actorId = beat.actorCombatantId || beat.actorId || null;
  const actor = combatants.get(String(actorId));
  const target = combatants.get(String(targetId));
  if (!actorId || !targetId) return null;
  const actorName = textOr(beat.actorName || beat.actor?.label, actor?.name || actor?.label || 'Weaver');
  const targetName = textOr(target?.name || target?.label, beat.targetName || 'Target');
  return {
    momentIndex,
    beatIndex: beat.index,
    actorId,
    actorName,
    actorVisualAssetId: beat.actorVisualAssetId || actor?.visualAssetId || null,
    targetId,
    targetName,
    targetVisualAssetId: target?.visualAssetId || beat.targetVisualAssetId || null,
    targetIsBoss: Boolean(target?.isBoss),
    damage: numberOr(damage),
    healing: numberOr(healing),
    critical: Boolean(beat.critical),
    defeated: Boolean(defeated || (targetHpAfter != null && numberOr(targetHpAfter) <= 0)),
    actorHpBefore: numberOr(beat.actorHpBefore ?? actor?.hp),
    actorHpAfter: null,
    actorManaBefore: beat.actorManaBefore ?? beat.manaBefore ?? null,
    actorManaAfter: beat.actorManaAfter ?? beat.manaAfter ?? null,
    actionType: actionType || beat.actionType || beat.metadata?.actionType || null,
    skillId: skillId || beat.skillId || beat.metadata?.skillId || null,
    events,
    manaEvents,
    targetHpBefore: numberOr(targetHpBefore ?? target?.hp),
    targetHpAfter: numberOr(targetHpAfter ?? target?.hp),
    targetMaxHp: numberOr(target?.maxHp),
    summary: summary || `${actorName} acted against ${targetName}.`,
    retaliation: false,
  };
}

function damageMoments(beat, startIndex, combatants) {
  const entries = Array.isArray(beat.damageEvents) && beat.damageEvents.length
    ? beat.damageEvents
    : Array.isArray(beat.targetDamages) && beat.targetDamages.length
      ? beat.targetDamages
      : [];
  if (!entries.length) {
    const direct = directMoment(beat, startIndex, combatants);
    return direct ? [direct] : [];
  }
  return entries.map((event, index) => {
    const targetId = event.targetCombatantId || event.targetId;
    const target = combatants.get(String(targetId));
    const actor = combatants.get(String(beat.actorCombatantId || beat.actorId));
    const name = actor?.name || actor?.label || beat.actorName || 'Weaver';
    const targetName = target?.name || target?.label || event.targetName || 'Target';
    return eventMoment(beat, startIndex + index, combatants, {
      targetId,
      damage: event.damage,
      targetHpBefore: event.targetHpBefore,
      targetHpAfter: event.targetHpAfter,
      events: index === 0 ? eventsForBeat(beat) : [],
      actionType: index === 0 ? beat.actionType : null,
      skillId: index === 0 ? beat.skillId : null,
      defeated: numberOr(event.targetHpAfter, 1) <= 0,
      summary: index === 0
        ? beat.summary || `${name} hit ${targetName} for ${numberOr(event.damage)} damage.`
        : `${name} also hit ${targetName} for ${numberOr(event.damage)} damage.`,
    });
  }).filter(Boolean);
}

function selfDamageMoment(beat, momentIndex, combatants, amount, label) {
  const actorId = beat.actorCombatantId || beat.actorId || null;
  if (!actorId || amount <= 0) return null;
  const actor = combatants.get(String(actorId));
  const before = numberOr(beat.actorHpBefore ?? actor?.hp);
  const afterEffects = beat.actorHpAfterEffects == null ? null : numberOr(beat.actorHpAfterEffects);
  const after = label === 'effect' && afterEffects != null
    ? afterEffects
    : Math.max(0, (afterEffects ?? before) - amount);
  const moment = eventMoment(beat, momentIndex, combatants, {
    targetId: actorId,
    damage: amount,
    targetHpBefore: before,
    targetHpAfter: after,
    summary: `${actor?.name || actor?.label || beat.actorName || 'Combatant'} took ${amount} ${label === 'effect' ? 'effect ' : ''}damage.`,
    events: label === 'effect' ? eventsForBeat(beat).filter((event) => event.kind === 'effect-damage') : [],
  });
  if (!moment) return null;
  moment.actorHpAfter = after;
  return moment;
}

function healingMoments(beat, startIndex, combatants) {
  const entries = Array.isArray(beat.healingEvents) ? beat.healingEvents : [];
  return entries.map((event) => eventMoment(beat, startIndex, combatants, {
    targetId: event.targetId,
    healing: event.healing,
    targetHpBefore: event.targetHpBefore,
    targetHpAfter: event.targetHpAfter,
    summary: `${combatants.get(String(event.targetId))?.name || combatants.get(String(event.targetId))?.label || 'A Weaver'} recovered ${numberOr(event.healing)} HP.`,
  })).filter(Boolean);
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
    const effectDamage = selfDamageMoment(beat, moments.length, combatants, numberOr(beat.effectDamage), 'effect');
    if (effectDamage) moments.push(effectDamage);
    const selfDamage = selfDamageMoment(beat, moments.length, combatants, numberOr(beat.selfDamage), 'self');
    if (selfDamage) moments.push(selfDamage);
    let actionMoments = damageMoments(beat, moments.length, combatants);
    if (!actionMoments.length && beat.summary) {
      const fallback = directMoment(beat, moments.length, combatants);
      if (fallback) actionMoments = [fallback];
    }
    if (actionMoments.length) {
      const lastActionMoment = actionMoments.length - 1;
      actionMoments[lastActionMoment].manaEvents = Array.isArray(beat.manaEvents) ? beat.manaEvents : [];
      moments.push(...actionMoments);
    }
    const retaliation = retaliationMoment(beat, moments.length, combatants);
    if (retaliation) moments.push(retaliation);
    const healing = healingMoments(beat, moments.length, combatants);
    if (healing.length) {
      const lastActionMoment = moments.length - 1;
      if (lastActionMoment >= 0 && !moments[lastActionMoment].manaEvents?.length) {
        moments[lastActionMoment].manaEvents = Array.isArray(beat.manaEvents) ? beat.manaEvents : [];
      }
      moments.push(...healing);
    }
    if (!effectDamage && !selfDamage && !actionMoments.length && !retaliation && !healing.length && beat.summary) {
      const fallback = {
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
        actorManaBefore: beat.actorManaBefore ?? beat.manaBefore ?? null,
        actorManaAfter: beat.actorManaAfter ?? beat.manaAfter ?? null,
        actionType: beat.actionType || beat.metadata?.actionType || null,
        skillId: beat.skillId || beat.metadata?.skillId || null,
        events: eventsForBeat(beat),
        manaEvents: Array.isArray(beat.manaEvents) ? beat.manaEvents : [],
        targetHpBefore: 0,
        targetHpAfter: 0,
        targetMaxHp: 0,
        summary: beat.summary,
        retaliation: false,
      };
      moments.push(fallback);
    }
  }
  moments.forEach((moment, index) => { moment.momentIndex = index; });
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
  if (replay?.presentationKind === 'duel') return 'duel';
  if (replay?.kind === 'simple-dungeon-battle') return 'dungeon';
  if (replay?.kind === 'automatic-battle-result' || replay?.details?.turns) return 'hunt';
  return null;
}
