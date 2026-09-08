const INTENT_WINDOW_MS = 3000;

const HEAVY = Object.freeze({ id: 'fraying-blow', name: 'Fraying Blow', kind: 'damage', reaction: 'guard', multiplier: 2 });
const BOSS_HEAVY = Object.freeze({ id: 'needle-break', name: 'Needle Break', kind: 'damage', reaction: 'guard', multiplier: 2.5 });
const MEND = Object.freeze({ id: 'thread-mend', name: 'Thread Mend', kind: 'heal', reaction: 'interrupt', healRatio: 0.22 });
const BOSS_MEND = Object.freeze({ id: 'needle-repair', name: 'Needle Repair', kind: 'heal', reaction: 'interrupt', healRatio: 0.28 });

export function nextEnemyIntent({ enemy, intentCount = 0, now = new Date().toISOString() }) {
  const cycle = enemy.isBoss ? [BOSS_HEAVY, BOSS_MEND, BOSS_HEAVY] : [HEAVY, MEND, HEAVY];
  const template = cycle[intentCount % cycle.length];
  const dueAt = new Date(new Date(now).getTime() + INTENT_WINDOW_MS).toISOString();
  if (template.kind === 'heal') {
    const amount = Math.max(2, Math.ceil(enemy.maxHp * template.healRatio));
    return {
      ...template,
      name: `${template.name} · heals ${amount} HP`,
      amount,
      damage: 0,
      dueAt,
      hint: 'Interrupt before it completes.',
    };
  }
  return {
    ...template,
    damage: Math.max(enemy.retaliation + 2, Math.ceil(enemy.retaliation * template.multiplier)),
    dueAt,
    hint: 'Guard to blunt the hit, or Interrupt to cancel it.',
  };
}

export function resolveEnemyIntent(intent, { enemy, retaliate }) {
  if (intent.kind === 'heal') {
    const before = enemy.hp;
    enemy.hp = Math.min(enemy.maxHp, enemy.hp + intent.amount);
    return { kind: 'heal', amount: enemy.hp - before };
  }
  return { kind: 'damage', damage: retaliate(intent.damage) };
}
