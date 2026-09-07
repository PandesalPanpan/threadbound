export class Character {
  constructor({ id, threadedUserId, displayName, baseAttack = 6, maxHealth = 40, threadDust = 0, equippedItem = null }) {
    if (!id || !threadedUserId) throw new Error('Character requires id and threadedUserId.');
    if (!Number.isInteger(baseAttack) || baseAttack <= 0) throw new Error('baseAttack must be a positive integer.');
    if (!Number.isInteger(maxHealth) || maxHealth <= 0) throw new Error('maxHealth must be a positive integer.');

    this.id = id;
    this.threadedUserId = String(threadedUserId);
    this.displayName = displayName || 'Wayfarer';
    this.baseAttack = baseAttack;
    this.maxHealth = maxHealth;
    this.threadDust = threadDust;
    this.equippedItem = equippedItem;
  }

  get attackPower() {
    return this.baseAttack + (this.equippedItem?.attackBonus ?? 0);
  }
}
