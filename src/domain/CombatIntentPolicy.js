const BASE_INTENT_WINDOW_MS = 3000;
const PHASE_TWO_INTENT_WINDOW_MS = 2200;

const HEAVY = Object.freeze({ id: 'fraying-blow', name: 'Fraying Blow', kind: 'damage', reaction: 'guard', multiplier: 2 });
const BOSS_HEAVY = Object.freeze({ id: 'needle-break', name: 'Needle Break', kind: 'damage', reaction: 'guard', multiplier: 2.5 });
const MEND = Object.freeze({ id: 'thread-mend', name: 'Thread Mend', kind: 'heal', reaction: 'interrupt', healRatio: 0.22 });
const BOSS_MEND = Object.freeze({ id: 'needle-repair', name: 'Needle Repair', kind: 'heal', reaction: 'interrupt', healRatio: 0.28 });
const THREADMARK = Object.freeze({ id: 'threadmark-lunge', name: 'Threadmark Lunge', kind: 'targeted-damage', reaction: 'guard', multiplier: 2.25 });

export const ENEMY_ABILITY_CATALOG = Object.freeze({
  basic_retaliation: Object.freeze({
    id: 'basic_retaliation',
    name: 'Balanced pressure',
    description: 'Mixes damaging pressure with occasional recovery.',
  }),
  heavy_pressure: Object.freeze({
    id: 'heavy_pressure',
    name: 'Heavy pressure',
    description: 'Favors dangerous guardable attacks and punishes blind offense.',
  }),
  self_mend: Object.freeze({
    id: 'self_mend',
    name: 'Self mend',
    description: 'Frequently restores health unless interrupted.',
  }),
});

const CANONICAL_ABILITY_PROFILES = Object.freeze({
  'frayed-wisp': Object.freeze(['self_mend']),
  'hollow-stalker': Object.freeze(['heavy_pressure']),
  'silkbound-guard': Object.freeze(['heavy_pressure', 'self_mend']),
});

function mostVulnerableParticipant(participants = []) {
  return participants
    .filter((participant) => participant.hp > 0)
    .sort((left, right) => {
      const leftRatio = left.hp / left.maxHp;
      const rightRatio = right.hp / right.maxHp;
      if (leftRatio !== rightRatio) return leftRatio - rightRatio;
      if (left.hp !== right.hp) return left.hp - right.hp;
      return String(left.playerId).localeCompare(String(right.playerId));
    })[0] || null;
}

function abilityProfile(enemy) {
  const configured = Array.isArray(enemy?.abilities) && enemy.abilities.length > 0
    ? enemy.abilities
    : CANONICAL_ABILITY_PROFILES[enemy?.id] || ['basic_retaliation'];
  const abilities = new Set(configured);
  const heavy = abilities.has('heavy_pressure');
  const mend = abilities.has('self_mend');

  if (heavy && !mend) {
    return {
      cycle: enemy?.isBoss ? [BOSS_HEAVY] : [HEAVY],
      heavyMultiplier: enemy?.isBoss ? 3.1 : 3,
      healRatio: enemy?.isBoss ? BOSS_MEND.healRatio : MEND.healRatio,
    };
  }

  if (mend && !heavy) {
    return {
      cycle: enemy?.isBoss ? [BOSS_MEND, BOSS_MEND, BOSS_HEAVY] : [MEND, MEND, HEAVY],
      heavyMultiplier: enemy?.isBoss ? BOSS_HEAVY.multiplier : HEAVY.multiplier,
      healRatio: enemy?.isBoss ? 0.36 : 0.34,
    };
  }

  if (heavy && mend) {
    return {
      cycle: enemy?.isBoss ? [BOSS_HEAVY, BOSS_MEND, BOSS_HEAVY] : [HEAVY, MEND, HEAVY],
      heavyMultiplier: enemy?.isBoss ? 2.8 : 2.5,
      healRatio: enemy?.isBoss ? 0.31 : 0.26,
    };
  }

  return {
    cycle: enemy?.isBoss ? [BOSS_HEAVY, BOSS_MEND, BOSS_HEAVY] : [HEAVY, MEND, HEAVY],
    heavyMultiplier: enemy?.isBoss ? BOSS_HEAVY.multiplier : HEAVY.multiplier,
    healRatio: enemy?.isBoss ? BOSS_MEND.healRatio : MEND.healRatio,
  };
}

export function nextEnemyIntent({ enemy, intentCount = 0, participants = [], now = new Date().toISOString() }) {
  const battlePhase = Number(enemy?.battlePhase || 1);
  const profile = abilityProfile(enemy);
  const cycle = enemy.isBoss && enemy.id === 'first-needle'
    ? battlePhase >= 2
      ? [THREADMARK, BOSS_HEAVY, BOSS_MEND]
      : [BOSS_HEAVY, BOSS_MEND, BOSS_HEAVY]
    : profile.cycle;
  const template = cycle[intentCount % cycle.length];
  const windowMs = enemy.isBoss && battlePhase >= 2 ? PHASE_TWO_INTENT_WINDOW_MS : BASE_INTENT_WINDOW_MS;
  const dueAt = new Date(new Date(now).getTime() + windowMs).toISOString();

  if (template.kind === 'heal') {
    const amount = Math.max(2, Math.ceil(enemy.maxHp * profile.healRatio));
    return {
      ...template,
      name: `${template.name} · heals ${amount} HP`,
      amount,
      damage: 0,
      dueAt,
      windowMs,
      battlePhase,
      hint: 'Interrupt before it completes.',
    };
  }

  const multiplier = template.kind === 'targeted-damage' ? template.multiplier : profile.heavyMultiplier;
  const damage = Math.max(enemy.retaliation + 2, Math.ceil(enemy.retaliation * multiplier));
  if (template.kind === 'targeted-damage') {
    const target = mostVulnerableParticipant(participants);
    return {
      ...template,
      name: target ? `${template.name} · marked ally` : template.name,
      targetPlayerId: target?.playerId || null,
      damage,
      dueAt,
      windowMs,
      battlePhase,
      hint: 'A marked ally is in danger. Any living Weaver can Guard to intercept and blunt the hit.',
    };
  }

  return {
    ...template,
    damage,
    dueAt,
    windowMs,
    battlePhase,
    hint: 'Guard to blunt the hit, or Interrupt to cancel it.',
  };
}

export function resolveEnemyIntent(intent, { enemy, retaliate, damageTarget }) {
  if (intent.kind === 'heal') {
    const before = enemy.hp;
    enemy.hp = Math.min(enemy.maxHp, enemy.hp + intent.amount);
    return { kind: 'heal', amount: enemy.hp - before };
  }
  if (intent.kind === 'targeted-damage' && intent.targetPlayerId && damageTarget) {
    return { kind: 'targeted-damage', damage: damageTarget(intent.targetPlayerId, intent.damage), targetPlayerId: intent.targetPlayerId };
  }
  return { kind: 'damage', damage: retaliate(intent.damage) };
}
