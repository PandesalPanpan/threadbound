import { deriveCharacterStats } from './CharacterStatPolicy.js';

export class Character {
  constructor({ id, threadedUserId, displayName, baseAttack = 6, maxHealth = 40, gold = null, threadDust = 0, equippedItem = null, equipment = null }) {
    if (!id || !threadedUserId) throw new Error('Character requires id and threadedUserId.');
    if (!Number.isInteger(baseAttack) || baseAttack <= 0) throw new Error('baseAttack must be a positive integer.');
    if (!Number.isInteger(maxHealth) || maxHealth <= 0) throw new Error('maxHealth must be a positive integer.');

    this.id = id;
    this.threadedUserId = String(threadedUserId);
    this.displayName = displayName || 'Wayfarer';
    this.baseAttack = baseAttack;
    this.maxHealth = maxHealth;
    this.gold = Math.max(0, Math.floor(Number(gold ?? threadDust ?? 0)) || 0);
    // Migration compatibility: persisted storage and older callers still use threadDust.
    // New domain/read-model code should prefer gold until the SQLite column is migrated.
    this.threadDust = this.gold;
    this.equippedItem = equippedItem;
    this.equipment = equipment || { weapon: equippedItem };
  }

  get stats() {
    return deriveCharacterStats({ baseAttack: this.baseAttack, maxHealth: this.maxHealth, equipment: this.equipment });
  }

  get attackPower() {
    return this.stats.attack;
  }
}
