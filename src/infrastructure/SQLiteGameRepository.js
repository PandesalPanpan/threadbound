import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

function decodeItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    playerId: row.player_id,
    definitionId: row.definition_id,
    name: row.name,
    slot: row.slot,
    rarity: row.rarity,
    attackBonus: row.attack_bonus,
    effectCode: row.effect_code,
    effect: JSON.parse(row.effect_json),
    source: row.source,
    createdAt: row.created_at,
  };
}

export class SQLiteGameRepository {
  constructor({ filename = './data/threadbound.sqlite', idFactory = randomUUID } = {}) {
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.idFactory = idFactory;
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.#migrate();
  }

  close() { this.db.close(); }

  getOrCreatePlayer({ threadedUserId, displayName }) {
    const existing = this.db.prepare('SELECT * FROM players WHERE threaded_user_id = ?').get(String(threadedUserId));
    if (existing) return this.#decodePlayer(existing);
    const id = this.idFactory();
    this.db.prepare('INSERT INTO players (id, threaded_user_id, display_name, base_attack, max_health, thread_dust) VALUES (?, ?, ?, 6, 40, 0)').run(id, String(threadedUserId), displayName);
    return this.getPlayer(id);
  }

  getPlayer(playerId) {
    const row = this.db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
    return row ? this.#decodePlayer(row) : null;
  }

  listItems(playerId) {
    return this.db.prepare('SELECT * FROM items WHERE player_id = ? ORDER BY created_at DESC, id DESC').all(playerId).map(decodeItem);
  }

  getItem(itemId) { return decodeItem(this.db.prepare('SELECT * FROM items WHERE id = ?').get(itemId)); }

  addItem(playerId, item) {
    this.db.prepare('INSERT OR IGNORE INTO items (id, player_id, definition_id, name, slot, rarity, attack_bonus, effect_code, effect_json, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      item.id, playerId, item.definitionId, item.name, item.slot, item.rarity, item.attackBonus, item.effectCode, JSON.stringify(item.effect), item.source,
    );
    return this.getItem(item.id);
  }

  equipItem(playerId, itemId) {
    const item = this.getItem(itemId);
    if (!item || item.playerId !== playerId) throw new Error('Cannot equip an item owned by another player.');
    this.db.prepare('UPDATE players SET equipped_item_id = ? WHERE id = ?').run(itemId, playerId);
  }

  addThreadDust(playerId, amount) {
    this.db.prepare('UPDATE players SET thread_dust = thread_dust + ? WHERE id = ?').run(amount, playerId);
  }

  createRun(state) {
    this.db.prepare('INSERT INTO dungeon_runs (id, player_id, dungeon_id, phase, state_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      state.id, state.playerId, state.dungeonId, state.phase, JSON.stringify(state), state.createdAt, new Date().toISOString(),
    );
  }

  getRun(runId) {
    const row = this.db.prepare('SELECT state_json FROM dungeon_runs WHERE id = ?').get(runId);
    return row ? JSON.parse(row.state_json) : null;
  }

  saveRun(state) {
    this.db.prepare('UPDATE dungeon_runs SET phase = ?, state_json = ?, updated_at = ? WHERE id = ?').run(state.phase, JSON.stringify(state), new Date().toISOString(), state.id);
  }

  getActiveRun(playerId) {
    const row = this.db.prepare("SELECT state_json FROM dungeon_runs WHERE player_id = ? AND phase IN ('combat', 'upgrade', 'boss') ORDER BY created_at DESC LIMIT 1").get(playerId);
    return row ? JSON.parse(row.state_json) : null;
  }

  unlockAchievement(playerId, achievement) {
    this.db.prepare('INSERT OR IGNORE INTO player_achievements (player_id, achievement_id, name, description) VALUES (?, ?, ?, ?)').run(playerId, achievement.id, achievement.name, achievement.description);
  }

  listAchievements(playerId) {
    return this.db.prepare('SELECT achievement_id AS id, name, description, unlocked_at AS unlockedAt FROM player_achievements WHERE player_id = ? ORDER BY unlocked_at ASC, achievement_id ASC').all(playerId);
  }

  incrementWorldProgress(key, amount) {
    this.db.prepare('INSERT INTO world_progress (progress_key, amount) VALUES (?, ?) ON CONFLICT(progress_key) DO UPDATE SET amount = amount + excluded.amount').run(key, amount);
  }

  getWorldState() {
    const row = this.db.prepare("SELECT amount FROM world_progress WHERE progress_key = 'arc-1-frayed-hollow-clears'").get();
    return { arcId: 'arc-1', arcName: 'The First Unraveling', frayedHollowClears: row?.amount ?? 0, target: 1000 };
  }

  getPurchaseGrant(playerId, idempotencyKey) {
    const row = this.db.prepare('SELECT * FROM purchase_grants WHERE player_id = ? AND idempotency_key = ?').get(playerId, idempotencyKey);
    return row ? this.#decodeGrant(row) : null;
  }

  recordPurchaseGrant({ playerId, threadedUserId, idempotencyKey, threadedTransactionId, itemInstanceId }) {
    this.db.prepare('INSERT INTO purchase_grants (player_id, threaded_user_id, idempotency_key, threaded_transaction_id, item_instance_id) VALUES (?, ?, ?, ?, ?)').run(
      playerId, threadedUserId, idempotencyKey, threadedTransactionId, itemInstanceId,
    );
    return this.getPurchaseGrant(playerId, idempotencyKey);
  }

  #decodePlayer(row) {
    return { id: row.id, threadedUserId: row.threaded_user_id, displayName: row.display_name, baseAttack: row.base_attack, maxHealth: row.max_health, threadDust: row.thread_dust, equippedItemId: row.equipped_item_id };
  }

  #decodeGrant(row) {
    return { playerId: row.player_id, threadedUserId: row.threaded_user_id, idempotencyKey: row.idempotency_key, threadedTransactionId: row.threaded_transaction_id, itemInstanceId: row.item_instance_id, createdAt: row.created_at };
  }

  #migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        threaded_user_id TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        base_attack INTEGER NOT NULL,
        max_health INTEGER NOT NULL,
        thread_dust INTEGER NOT NULL DEFAULT 0,
        equipped_item_id TEXT NULL
      );
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        definition_id TEXT NOT NULL,
        name TEXT NOT NULL,
        slot TEXT NOT NULL,
        rarity TEXT NOT NULL,
        attack_bonus INTEGER NOT NULL,
        effect_code TEXT NOT NULL,
        effect_json TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS dungeon_runs (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        dungeon_id TEXT NOT NULL,
        phase TEXT NOT NULL,
        state_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS player_achievements (
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        achievement_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (player_id, achievement_id)
      );
      CREATE TABLE IF NOT EXISTS world_progress (
        progress_key TEXT PRIMARY KEY,
        amount INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS purchase_grants (
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        threaded_user_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        threaded_transaction_id TEXT NOT NULL,
        item_instance_id TEXT NOT NULL REFERENCES items(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (player_id, idempotency_key),
        UNIQUE (threaded_transaction_id)
      );
    `);
  }
}
