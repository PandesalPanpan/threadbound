function nonNegativeNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function normalizeQuestProgress(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      questId: entry.questId ? String(entry.questId) : null,
      label: String(entry.label || entry.questName || entry.questId || 'Quest'),
      current: nonNegativeNumber(entry.current),
      target: nonNegativeNumber(entry.target),
      completed: Boolean(entry.completed),
    }));
}

/**
 * Projects authoritative HuntResolved facts into one concise Adventure Stream receipt.
 * This read model never calculates rewards, progression, loot, or quest completion.
 */
export function projectHuntReceipt(event, { actorName = 'Adventurer', fallbackEnemyName = 'enemy' } = {}) {
  if (!event || event.type !== 'HuntResolved') throw new Error('Hunt receipt requires a HuntResolved event.');

  const victory = Boolean(event.victory);
  const enemyName = String(event.enemyName || fallbackEnemyName || 'enemy');
  const gold = victory ? nonNegativeNumber(event.gold ?? event.threadDust) : 0;
  const xp = victory ? nonNegativeNumber(event.experienceGained ?? event.xp) : 0;
  const damageTaken = nonNegativeNumber(event.damageTaken);
  const remainingHp = nonNegativeNumber(event.remainingHp);
  const maxHp = nonNegativeNumber(event.maxHp);
  const questProgress = normalizeQuestProgress(event.questProgress);
  const loot = event.itemName ? {
    id: event.itemId || null,
    name: String(event.itemName),
    rarity: event.itemRarity ? String(event.itemRarity) : null,
    attackBonus: nonNegativeNumber(event.itemAttackBonus),
  } : null;

  const resultText = victory
    ? `${actorName} defeated ${enemyName}.`
    : `${actorName} was defeated by ${enemyName}.`;
  const rewardText = victory ? ` +${gold} Gold · +${xp} XP.` : ' No rewards.';
  const hpText = ` −${damageTaken} HP · ${remainingHp}/${maxHp} HP.`;
  const levelText = event.leveledUp ? ` Level ${nonNegativeNumber(event.level)}!` : '';
  const lootText = loot
    ? ` Loot: ${loot.rarity ? `${loot.rarity} ` : ''}${loot.name}${loot.attackBonus ? ` (+${loot.attackBonus} ATK)` : ''}.`
    : '';
  const potionText = event.healthPotionsFound ? ` +${nonNegativeNumber(event.healthPotionsFound)} health potion${Number(event.healthPotionsFound) === 1 ? '' : 's'}.` : '';
  const questText = questProgress.length
    ? ` Quest: ${questProgress.map((entry) => `${entry.label} ${entry.current}/${entry.target}${entry.completed ? ' complete' : ''}`).join(' · ')}.`
    : '';

  return Object.freeze({
    kind: 'hunt-result',
    victory,
    enemy: Object.freeze({ id: event.enemyId || null, name: enemyName }),
    hp: Object.freeze({ damageTaken, remaining: remainingHp, max: maxHp }),
    rewards: Object.freeze({ gold, xp }),
    progression: Object.freeze({
      level: nonNegativeNumber(event.level),
      leveledUp: Boolean(event.leveledUp),
      levelsGained: nonNegativeNumber(event.levelsGained),
    }),
    loot: loot ? Object.freeze(loot) : null,
    questProgress: Object.freeze(questProgress.map((entry) => Object.freeze(entry))),
    text: `${resultText}${rewardText}${hpText}${levelText}${lootText}${potionText}${questText}`,
  });
}
