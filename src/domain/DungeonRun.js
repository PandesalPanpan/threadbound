export const DUNGEONS = Object.freeze({
  'frayed-hollow': Object.freeze({
    id: 'frayed-hollow',
    name: 'Frayed Hollow',
    recommendedPlayers: 1,
    encounters: Object.freeze([
      Object.freeze({ id: 'frayed-wisp', name: 'Frayed Wisp', hp: 12, retaliation: 2 }),
      Object.freeze({ id: 'hollow-stalker', name: 'Hollow Stalker', hp: 12, retaliation: 2 }),
      Object.freeze({ id: 'silkbound-guard', name: 'Silkbound Guard', hp: 12, retaliation: 2 }),
    ]),
    boss: Object.freeze({ id: 'first-needle', name: 'The First Needle', hp: 24, retaliation: 4 }),
  }),
});

export const RUN_UPGRADES = Object.freeze({
  sharpen: Object.freeze({ id: 'sharpen', name: 'Sharpen the Thread', attackBonus: 3, heal: 0 }),
  reinforce: Object.freeze({ id: 'reinforce', name: 'Reinforce the Weave', attackBonus: 0, heal: 12 }),
});

function cloneEnemy(definition, isBoss = false) {
  return { id: definition.id, name: definition.name, hp: definition.hp, maxHp: definition.hp, retaliation: definition.retaliation, isBoss };
}

export class DungeonRun {
  constructor(state) { this.state = structuredClone(state); }

  static start({ id, playerId, dungeonId, playerMaxHealth, now = new Date().toISOString() }) {
    const dungeon = DUNGEONS[dungeonId];
    if (!dungeon) throw new Error(`Unknown dungeon: ${dungeonId}`);
    return new DungeonRun({ id, playerId, dungeonId, phase: 'combat', encounterIndex: 0, playerHp: playerMaxHealth, runAttackBonus: 0, selectedUpgrade: null, firstStrikeUsed: false, enemy: cloneEnemy(dungeon.encounters[0]), rewardItemId: null, createdAt: now, completedAt: null });
  }

  attack({ attackPower, equipmentEffect = 'none', now = new Date().toISOString() }) {
    if (!['combat', 'boss'].includes(this.state.phase)) throw new Error('The run is not currently in combat.');
    const events = [];
    let damage = attackPower + this.state.runAttackBonus;
    if (equipmentEffect === 'opening_strike' && !this.state.firstStrikeUsed) damage += 2;
    if (equipmentEffect === 'boss_bane' && this.state.enemy.isBoss) damage += 2;
    this.state.firstStrikeUsed = true;
    this.state.enemy.hp = Math.max(0, this.state.enemy.hp - damage);
    events.push({ type: 'EnemyDamaged', runId: this.state.id, enemyId: this.state.enemy.id, damage });
    if (this.state.enemy.hp === 0) {
      const defeated = structuredClone(this.state.enemy);
      events.push({ type: 'EnemyDefeated', runId: this.state.id, dungeonId: this.state.dungeonId, enemyId: defeated.id, isBoss: defeated.isBoss });
      this.#advanceAfterDefeat(events, now);
      return { state: this.toJSON(), events, damage, retaliation: 0 };
    }
    const retaliation = this.state.enemy.retaliation;
    this.state.playerHp = Math.max(0, this.state.playerHp - retaliation);
    events.push({ type: 'PlayerDamaged', runId: this.state.id, damage: retaliation });
    if (this.state.playerHp === 0) {
      this.state.phase = 'failed';
      events.push({ type: 'DungeonFailed', runId: this.state.id, dungeonId: this.state.dungeonId });
    }
    return { state: this.toJSON(), events, damage, retaliation };
  }

  chooseUpgrade(upgradeId) {
    if (this.state.phase !== 'upgrade') throw new Error('An upgrade can only be chosen between the normal encounters and the boss.');
    const upgrade = RUN_UPGRADES[upgradeId];
    if (!upgrade) throw new Error(`Unknown run upgrade: ${upgradeId}`);
    this.state.selectedUpgrade = upgrade.id;
    this.state.runAttackBonus += upgrade.attackBonus;
    this.state.playerHp += upgrade.heal;
    this.state.phase = 'boss';
    this.state.firstStrikeUsed = false;
    this.state.enemy = cloneEnemy(DUNGEONS[this.state.dungeonId].boss, true);
    return { state: this.toJSON(), events: [{ type: 'RunUpgradeChosen', runId: this.state.id, upgradeId }] };
  }

  markReward(itemId) {
    if (this.state.phase !== 'complete') throw new Error('Rewards can only be attached to completed runs.');
    this.state.rewardItemId = itemId;
  }

  toJSON() { return structuredClone(this.state); }

  #advanceAfterDefeat(events, now) {
    const dungeon = DUNGEONS[this.state.dungeonId];
    if (this.state.phase === 'boss') {
      this.state.phase = 'complete';
      this.state.enemy = null;
      this.state.completedAt = now;
      events.push({ type: 'BossDefeated', runId: this.state.id, dungeonId: this.state.dungeonId });
      events.push({ type: 'DungeonCompleted', runId: this.state.id, dungeonId: this.state.dungeonId });
      return;
    }
    if (this.state.encounterIndex < dungeon.encounters.length - 1) {
      this.state.encounterIndex += 1;
      this.state.firstStrikeUsed = false;
      this.state.enemy = cloneEnemy(dungeon.encounters[this.state.encounterIndex]);
      return;
    }
    this.state.phase = 'upgrade';
    this.state.enemy = null;
  }
}
