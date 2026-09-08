const BASE_INTENT_WINDOW_MS = 3000;
const PHASE_TWO_INTENT_WINDOW_MS = 2200;

const HEAVY = Object.freeze({ id: 'fraying-blow', name: 'Fraying Blow', kind: 'damage', reaction: 'guard', multiplier: 2 });
const BOSS_HEAVY = Object.freeze({ id: 'needle-break', name: 'Needle Break', kind: 'damage', reaction: 'guard', multiplier: 2.5 });
const MEND = Object.freeze({ id: 'thread-mend', name: 'Thread Mend', kind: 'heal', reaction: 'interrupt', healRatio: 0.22 });
const BOSS_MEND = Object.freeze({ id: 'needle-repair', name: 'Needle Repair', kind: 'heal', reaction: 'interrupt', healRatio: 0.28 });
const THREADMARK = Object.freeze({ id: 'threadmark-lunge', name: 'Threadmark Lunge', kind: 'targeted-damage', reaction: 'guard', multiplier: 2.25 });

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

export function nextEnemyIntent({ enemy, intentCount = 0, participants = [], now = new Date().toISOString() }) {
  const battlePhase = Number(enemy?.battlePhase || 1);
  const cycle = enemy.isBoss
    ? battlePhase >= 2
      ? [THREADMARK, BOSS_HEAVY, BOSS_MEND]
      : [BOSS_HEAVY, BOSS_MEND, BOSS_HEAVY]
    : [HEAVY, MEND, HEAVY];
  const template = cycle[intentCount % cycle.length];
  const intentWindowMs = enemy.isBoss && battlePhase >= 2 ? PHASE_TWO_INTENT_WINDOW_MS : BASE_INTENT_WINDOW_MS;
  const dueAt = new Date(new Date(now).getTime() + intentWindowMs).toISOString();

  if (template.kind === 'heal') {
    const amount = Math.max(2, Math.ceil(enemy.maxHp * template.healRatio));
    return {
      ...template,
      name: `${template.name} · heals ${amount} HP`,
      amount,
      damage: 0,
      dueAt,
      battlePhase,
      hint: 'Interrupt before it completes.',
    };
  }

  const damage = Math.max(enemy.retaliation + 2, Math.ceil(enemy.retaliation * template.multiplier));
  if (template.kind === 'targeted-damage') {
    const target = mostVulnerableParticipant(participants);
    return {
      ...template,
      name: target ? `${template.name} · marked ally` : template.name,
      targetPlayerId: target?.playerId || null,
      damage,
      dueAt,
      battlePhase,
      hint: 'A marked ally is in danger. Any living Weaver can Guard to intercept and blunt the hit.',
    };
  }

  return {
    ...template,
    damage,
    dueAt,
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
