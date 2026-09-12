function nonNegativeNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function titleize(value) {
  return String(value || '')
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeQuestProgress(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry) => entry && typeof entry === 'object' && (entry.questName || entry.name || entry.label || entry.questId))
    .map((entry) => {
      const current = nonNegativeNumber(entry.current);
      return Object.freeze({
        questId: entry.questId ? String(entry.questId) : null,
        questName: String(entry.questName || entry.name || entry.label || entry.questId),
        current,
        required: Math.max(current, nonNegativeNumber(entry.required ?? entry.target)),
        completed: Boolean(entry.completed),
      });
    });
}

function normalizeCooldown(event) {
  if (!event.nextHuntReadyAt) return null;
  const readyAt = new Date(event.nextHuntReadyAt);
  if (Number.isNaN(readyAt.getTime())) return null;
  return Object.freeze({
    nextReadyAt: readyAt.toISOString(),
    cooldownSeconds: nonNegativeNumber(event.huntCooldownSeconds),
  });
}

/**
 * Projects already-authoritative HuntResolved facts into one concise stream receipt.
 * It never calculates combat, rewards, loot, death penalties, level, quest completion, or cooldown legality.
 */
export function projectHuntReceipt(event, { actorName = 'Adventurer', fallbackEnemyName = 'enemy' } = {}) {
  if (!event || event.type !== 'HuntResolved') throw new Error('Hunt receipt requires a HuntResolved event.');

  const victory = Boolean(event.victory);
  const enemyName = String(event.enemyName || fallbackEnemyName || 'enemy');
  const damageTaken = nonNegativeNumber(event.damageTaken);
  const remainingHp = nonNegativeNumber(event.remainingHp);
  const maxHp = nonNegativeNumber(event.maxHp);
  const gold = victory ? nonNegativeNumber(event.gold ?? event.threadDust) : 0;
  const goldLost = victory ? 0 : nonNegativeNumber(event.goldLost);
  const carriedGold = event.carriedGold == null ? null : nonNegativeNumber(event.carriedGold);
  const bankedGold = event.bankedGold == null ? null : nonNegativeNumber(event.bankedGold);
  const xp = victory ? nonNegativeNumber(event.experienceGained ?? event.xp) : 0;
  const healthPotionsFound = victory ? nonNegativeNumber(event.healthPotionsFound) : 0;
  const questProgress = normalizeQuestProgress(event.questProgress);
  const cooldown = normalizeCooldown(event);
  const loot = victory && event.itemName ? Object.freeze({
    id: event.itemId || null,
    name: String(event.itemName),
    rarity: event.itemRarity ? String(event.itemRarity) : null,
    attackBonus: nonNegativeNumber(event.itemAttackBonus),
  }) : null;

  const resultText = victory
    ? `Victory — ${actorName} defeated ${enemyName}.`
    : `Defeat — ${actorName} fell to ${enemyName}.`;
  const hpText = ` −${damageTaken} HP · ${remainingHp}/${maxHp} HP.`;
  const rewardText = victory
    ? ` +${gold} Gold · +${xp} XP.`
    : goldLost > 0
      ? ` −${goldLost} carried Gold · Bank safe.`
      : ' No rewards.';
  const levelText = victory && event.leveledUp ? ` Level up — ${nonNegativeNumber(event.level)}.` : '';
  const lootText = loot
    ? ` Loot — ${loot.rarity ? `${titleize(loot.rarity)} ` : ''}${loot.name} · +${loot.attackBonus} Attack.`
    : '';
  const potionText = healthPotionsFound
    ? ` +${healthPotionsFound} Health Potion${healthPotionsFound === 1 ? '' : 's'}.`
    : '';
  const questText = questProgress.map((progress) => {
    if (progress.completed) return ` Quest complete — ${progress.questName}.`;
    return progress.required > 0
      ? ` Quest — ${progress.questName} ${progress.current}/${progress.required}.`
      : ` Quest — ${progress.questName}.`;
  }).join('');
  const cooldownText = cooldown ? ` Next Hunt — ${cooldown.nextReadyAt}.` : '';

  return Object.freeze({
    kind: 'hunt-result',
    victory,
    enemy: Object.freeze({ id: event.enemyId || null, name: enemyName }),
    hp: Object.freeze({ damageTaken, remaining: remainingHp, max: maxHp }),
    rewards: Object.freeze({ gold, xp, goldLost }),
    deathPenalty: victory ? null : Object.freeze({ goldLost, carriedGold, bankedGold }),
    progression: Object.freeze({
      level: nonNegativeNumber(event.level),
      leveledUp: victory && Boolean(event.leveledUp),
      levelsGained: victory ? nonNegativeNumber(event.levelsGained) : 0,
    }),
    loot,
    healthPotionsFound,
    questProgress: Object.freeze(questProgress),
    cooldown,
    text: `${resultText}${hpText}${rewardText}${levelText}${lootText}${potionText}${questText}${cooldownText}`,
  });
}
