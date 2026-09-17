const CANONICAL_ENEMY_ASSETS = Object.freeze({
  'frayed-wisp': 'mob.void-wisp.v1',
  'hollow-stalker': 'mob.shadow-beast.v1',
  'silkbound-guard': 'mob.silver-knight.v1',
  'first-needle': 'boss.void-knight.v1',
});

const PHASE_LABELS = Object.freeze({
  preBattle: 'Pre-Battle',
  live: 'Live',
  impact: 'Attack Impact',
  skillCast: 'Skill Cast',
  result: 'Result',
  decision: 'Decision',
});

function stableIndex(value, length) {
  if (!length) return 0;
  let hash = 2166136261;
  for (const character of String(value || 'threadbound')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function phaseLabel(phase) {
  return PHASE_LABELS[phase] || 'Live';
}

export function phaseFromRun(run) {
  if (!run) return 'preBattle';
  if (run.phase === 'complete' || run.phase === 'failed') return 'result';
  if (run.phase === 'upgrade' || run.phase === 'event') return 'decision';
  return 'live';
}

export function resolveVisualAsset(entity, kind, assets = []) {
  const candidates = assets.filter((asset) => asset.kind === kind);
  const explicitId = entity?.visualAssetId || (kind === 'mob' || kind === 'boss' ? CANONICAL_ENEMY_ASSETS[entity?.id] : null);
  if (explicitId) return assets.find((asset) => asset.id === explicitId) || null;
  return candidates[stableIndex(entity?.id || entity?.playerId || entity?.name, candidates.length)] || null;
}

export function selectSkill(skills = [], run) {
  const focus = numeric(run?.viewer?.focus);
  const cooldowns = run?.viewer?.skillCooldowns || {};
  return skills.find((skill) => skill.kind === 'damage' && focus >= numeric(skill.cost) && numeric(cooldowns[skill.id]) <= 0) || null;
}

export function battleViewModel({ dashboard, assets = [], outcome = null, previousRun = null, phase = null, action = null }) {
  const run = outcome?.state || dashboard?.activeRun || null;
  const targetSource = run?.enemy || previousRun?.enemy || null;
  const defeated = action?.defeated || run?.phase === 'complete';
  const target = targetSource ? { ...targetSource, hp: defeated ? 0 : targetSource.hp } : null;
  const viewer = run?.viewer || run?.participants?.find((participant) => participant.playerId === dashboard?.character?.id) || null;
  const attacker = viewer || {
    playerId: dashboard?.character?.id,
    displayName: dashboard?.character?.displayName || 'Weaver',
    hp: dashboard?.character?.currentHealth || 0,
    maxHp: dashboard?.character?.maxHealth || 1,
    focus: 0,
    maxFocus: 4,
  };
  const targetBefore = previousRun?.enemy || target;
  const derivedPhase = phase || phaseFromRun(run);

  return {
    run,
    phase: derivedPhase,
    phaseLabel: phaseLabel(derivedPhase),
    attacker: {
      id: attacker.playerId || dashboard?.character?.id || 'viewer',
      name: attacker.displayName || dashboard?.character?.displayName || 'Weaver',
      hp: numeric(attacker.hp),
      maxHp: numeric(attacker.maxHp, 1),
      focus: numeric(attacker.focus),
      maxFocus: numeric(attacker.maxFocus, 4),
      asset: resolveVisualAsset(attacker, 'character', assets),
    },
    target: target ? {
      id: target.id || 'enemy',
      name: target.name || 'Encounter',
      hp: numeric(target.hp),
      maxHp: numeric(target.maxHp, 1),
      isBoss: Boolean(target.isBoss),
      asset: resolveVisualAsset(target, target.isBoss ? 'boss' : 'mob', assets),
    } : null,
    previousTargetHp: numeric(targetBefore?.hp, numeric(target?.hp)),
    previousAttackerHp: numeric(previousRun?.participants?.find((participant) => participant.playerId === attacker.playerId)?.hp, numeric(attacker.hp)),
    action,
  };
}

export function projectCombatOutcome(outcome, { action, previousRun } = {}) {
  const events = Array.isArray(outcome?.events) ? outcome.events : [];
  const damageEvent = events.find((event) => event.type === 'EnemyDamaged');
  const retaliationEvent = events.find((event) => event.type === 'PlayerDamaged');
  const enemyAfter = outcome?.state?.enemy;
  const playerAfter = outcome?.state?.participants?.find((participant) => participant.playerId === previousRun?.viewer?.playerId)
    || outcome?.state?.viewer;

  return {
    action,
    skillId: outcome?.skillId || events.find((event) => event.type === 'CombatSkillUsed')?.skillId || null,
    damage: numeric(outcome?.damage, numeric(damageEvent?.damage)),
    retaliation: numeric(outcome?.retaliation, numeric(retaliationEvent?.damage)),
    critical: Boolean(outcome?.critical || events.some((event) => event.type === 'CriticalStrikeLanded')),
    defeated: Boolean(events.some((event) => event.type === 'EnemyDefeated')),
    targetHpBefore: numeric(previousRun?.enemy?.hp, numeric(enemyAfter?.hp)),
    targetHpAfter: numeric(enemyAfter?.hp, 0),
    actorHpBefore: numeric(previousRun?.viewer?.hp, numeric(playerAfter?.hp)),
    actorHpAfter: numeric(playerAfter?.hp, 0),
    eventTypes: events.map((event) => event.type),
  };
}
