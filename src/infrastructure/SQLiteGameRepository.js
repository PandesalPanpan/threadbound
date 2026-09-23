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
    visualAssetId: row.visual_asset_id || null,
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
    this.db.prepare("INSERT OR IGNORE INTO player_consumables (player_id, consumable_id, quantity) VALUES (?, 'minor-health-potion', 1)").run(id);
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
    this.#insertItem(playerId, item, true);
    return this.getItem(item.id);
  }

  equipItem(playerId, itemId) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const item = this.getItem(itemId);
      if (!item || item.playerId !== playerId) throw new Error('Cannot equip an item owned by another player.');
      const activeRun = this.db.prepare("SELECT 1 FROM dungeon_runs dr JOIN dungeon_run_participants rp ON rp.run_id = dr.id WHERE rp.player_id = ? AND dr.phase IN ('combat', 'event', 'upgrade', 'boss', 'between_encounter') LIMIT 1").get(playerId);
      if (activeRun) {
        const error = new Error('Finish the active dungeon before changing equipped relics.');
        error.code = 'item_equip_during_run';
        throw error;
      }
      this.db.prepare('UPDATE players SET equipped_item_id = ? WHERE id = ?').run(itemId, playerId);
      this.db.exec('COMMIT');
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  addThreadDust(playerId, amount) {
    this.db.prepare('UPDATE players SET thread_dust = thread_dust + ? WHERE id = ?').run(amount, playerId);
  }

  setPlayerHealth(playerId, currentHealth, updatedAt = new Date().toISOString()) {
    const player = this.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const health = Math.max(0, Math.min(player.maxHealth, Math.floor(Number(currentHealth))));
    this.db.prepare('UPDATE players SET current_health = ?, health_updated_at = ? WHERE id = ?').run(health, updatedAt, playerId);
    return { ...this.getPlayer(playerId), currentHealth: health, healthUpdatedAt: updatedAt };
  }

  addHealthPotions(playerId, amount = 1) {
    return this.addConsumable(playerId, 'minor-health-potion', amount);
  }

  listConsumables(playerId) {
    return this.db.prepare('SELECT consumable_id AS consumableId, quantity FROM player_consumables WHERE player_id = ? ORDER BY consumable_id ASC').all(playerId).map((row) => ({
      consumableId: row.consumableId,
      quantity: Math.max(0, Number(row.quantity || 0)),
    }));
  }

  getConsumableQuantity(playerId, consumableId) {
    const row = this.db.prepare('SELECT quantity FROM player_consumables WHERE player_id = ? AND consumable_id = ?').get(playerId, consumableId);
    return Math.max(0, Number(row?.quantity || 0));
  }

  addConsumable(playerId, consumableId, amount = 1) {
    const quantity = Math.max(0, Math.floor(Number(amount) || 0));
    const player = this.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    this.db.prepare(`
      INSERT INTO player_consumables (player_id, consumable_id, quantity)
      VALUES (?, ?, ?)
      ON CONFLICT(player_id, consumable_id) DO UPDATE SET quantity = quantity + excluded.quantity
    `).run(playerId, consumableId, quantity);
    this.#syncLegacyPotionProjection(playerId);
    return this.getConsumableQuantity(playerId, consumableId);
  }

  useConsumable(playerId, { consumableId = 'minor-health-potion', heal = 8, currentHealth = null, updatedAt = new Date().toISOString() } = {}) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT current_health, max_health FROM players WHERE id = ?').get(playerId);
      if (!row) throw new Error('Player not found.');
      const startingHealth = currentHealth == null
        ? Number(row.current_health)
        : Math.max(0, Math.min(Number(row.max_health), Math.floor(Number(currentHealth))));
      if (startingHealth >= row.max_health) {
        const error = new Error('You are already at full health.');
        error.code = 'health_already_full';
        throw error;
      }
      const inventory = this.db.prepare('SELECT quantity FROM player_consumables WHERE player_id = ? AND consumable_id = ?').get(playerId, consumableId);
      if (Number(inventory?.quantity || 0) <= 0) {
        const error = new Error('You do not have that Health Potion.');
        error.code = 'no_health_potions';
        throw error;
      }
      const nextHealth = Math.min(row.max_health, startingHealth + Math.max(1, Math.floor(Number(heal) || 0)));
      const healed = nextHealth - startingHealth;
      const consumed = this.db.prepare('UPDATE player_consumables SET quantity = quantity - 1 WHERE player_id = ? AND consumable_id = ? AND quantity > 0').run(playerId, consumableId);
      if (consumed.changes !== 1) {
        const error = new Error('That Health Potion is no longer available.');
        error.code = 'no_health_potions';
        throw error;
      }
      this.db.prepare('UPDATE players SET current_health = ?, health_updated_at = ? WHERE id = ?').run(nextHealth, updatedAt, playerId);
      this.#syncLegacyPotionProjection(playerId);
      const remaining = this.getConsumableQuantity(playerId, consumableId);
      this.db.exec('COMMIT');
      return { healed, currentHealth: nextHealth, maxHealth: row.max_health, consumableId, quantity: remaining, healthPotions: this.#legacyPotionQuantity(playerId) };
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  useHealthPotion(playerId, { heal = 8, updatedAt = new Date().toISOString() } = {}) {
    return this.useConsumable(playerId, { consumableId: 'minor-health-potion', heal, updatedAt });
  }

  buyConsumable(playerId, { consumableId = 'minor-health-potion', cost = 5, quantity = 1 } = {}) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT thread_dust FROM players WHERE id = ?').get(playerId);
      if (!row) throw new Error('Player not found.');
      if (row.thread_dust < cost) {
        const error = new Error(`You need ${cost} Thread Dust to buy a Health Potion.`);
        error.code = 'insufficient_thread_dust';
        throw error;
      }
      this.db.prepare('UPDATE players SET thread_dust = thread_dust - ? WHERE id = ?').run(cost, playerId);
      this.db.prepare(`
        INSERT INTO player_consumables (player_id, consumable_id, quantity)
        VALUES (?, ?, ?)
        ON CONFLICT(player_id, consumable_id) DO UPDATE SET quantity = quantity + excluded.quantity
      `).run(playerId, consumableId, Math.max(0, Math.floor(Number(quantity) || 0)));
      this.#syncLegacyPotionProjection(playerId);
      const nextQuantity = this.getConsumableQuantity(playerId, consumableId);
      this.db.exec('COMMIT');
      return { cost, quantity, consumableId, threadDust: row.thread_dust - cost, quantityOwned: nextQuantity, healthPotions: this.#legacyPotionQuantity(playerId) };
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  buyHealthPotion(playerId, { cost = 5, quantity = 1 } = {}) {
    return this.buyConsumable(playerId, { consumableId: 'minor-health-potion', cost, quantity });
  }

  createParty(party) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO parties (id, leader_player_id, join_code, status) VALUES (?, ?, ?, ?)').run(party.id, party.leaderPlayerId, party.joinCode, party.status);
      const insertMember = this.db.prepare('INSERT INTO party_members (party_id, player_id, ready) VALUES (?, ?, ?)');
      for (const member of party.members) insertMember.run(party.id, member.playerId, member.ready ? 1 : 0);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  getParty(partyId) {
    const row = this.db.prepare('SELECT * FROM parties WHERE id = ?').get(partyId);
    return row ? this.#decodeParty(row) : null;
  }

  getPartyByJoinCode(joinCode) {
    const row = this.db.prepare('SELECT * FROM parties WHERE join_code = ?').get(joinCode);
    return row ? this.#decodeParty(row) : null;
  }

  getPartyForPlayer(playerId) {
    const row = this.db.prepare('SELECT p.* FROM parties p JOIN party_members pm ON pm.party_id = p.id WHERE pm.player_id = ? LIMIT 1').get(playerId);
    return row ? this.#decodeParty(row) : null;
  }

  addPartyMember(partyId, playerId, ready = false) {
    this.db.prepare('INSERT INTO party_members (party_id, player_id, ready) VALUES (?, ?, ?)').run(partyId, playerId, ready ? 1 : 0);
  }

  setPartyMemberReady(partyId, playerId, ready) {
    this.db.prepare('UPDATE party_members SET ready = ? WHERE party_id = ? AND player_id = ?').run(ready ? 1 : 0, partyId, playerId);
  }

  removePartyMember(partyId, playerId) {
    this.db.prepare('DELETE FROM party_members WHERE party_id = ? AND player_id = ?').run(partyId, playerId);
  }

  deleteParty(partyId) { this.db.prepare('DELETE FROM parties WHERE id = ?').run(partyId); }
  setPartyStatus(partyId, status) { this.db.prepare('UPDATE parties SET status = ? WHERE id = ?').run(status, partyId); }

  createRun(state) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const persisted = { ...state, version: 0 };
      this.db.prepare('INSERT INTO dungeon_runs (id, player_id, dungeon_id, phase, state_json, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)').run(
        persisted.id, persisted.startedByPlayerId, persisted.dungeonId, persisted.phase, JSON.stringify(persisted), persisted.createdAt, new Date().toISOString(),
      );
      const insertParticipant = this.db.prepare('INSERT INTO dungeon_run_participants (run_id, player_id) VALUES (?, ?)');
      for (const participant of persisted.participants) insertParticipant.run(persisted.id, participant.playerId);
      this.#syncRunHealth(persisted, new Date().toISOString());
      if (persisted.ownerType === 'party') this.db.prepare("UPDATE parties SET status = 'in_run' WHERE id = ?").run(persisted.ownerId);
      this.db.exec('COMMIT');
      return persisted;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  getRun(runId) {
    return this.#decodeRunRow(this.db.prepare('SELECT state_json, version FROM dungeon_runs WHERE id = ?').get(runId));
  }

  saveRun(state) {
    const expectedVersion = Number.isInteger(state.version) ? state.version : 0;
    const nextState = { ...state, version: expectedVersion + 1 };
    const updatedAt = new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = this.db.prepare('UPDATE dungeon_runs SET phase = ?, state_json = ?, version = ?, updated_at = ? WHERE id = ? AND version = ?').run(
        nextState.phase,
        JSON.stringify(nextState),
        nextState.version,
        updatedAt,
        nextState.id,
        expectedVersion,
      );
      if (result.changes !== 1) {
        const error = new Error('Dungeon state changed before this action could be saved. Refresh and retry.');
        error.code = 'stale_run_version';
        throw error;
      }
      this.#syncRunHealth(nextState, updatedAt);
      if (['failed', 'retreated'].includes(nextState.phase) && nextState.ownerType === 'party') {
        this.#releaseParty(nextState.ownerId);
      }
      this.db.exec('COMMIT');
      return nextState;
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  saveRunWithPotion(state, playerId, { consumableId = 'minor-health-potion', updatedAt = new Date().toISOString() } = {}) {
    const expectedVersion = Number.isInteger(state.version) ? state.version : 0;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const storedRow = this.db.prepare('SELECT state_json, version FROM dungeon_runs WHERE id = ?').get(state.id);
      if (!storedRow) throw new Error('Run not found while using a Dungeon potion.');
      const stored = this.#decodeRunRow(storedRow);
      if (stored.version !== expectedVersion) {
        const error = new Error('Dungeon state changed before the potion could be used. Refresh and retry.');
        error.code = 'stale_run_version';
        throw error;
      }
      const potionRow = this.db.prepare('SELECT quantity FROM player_consumables WHERE player_id = ? AND consumable_id = ?').get(playerId, consumableId);
      if (!this.db.prepare('SELECT 1 FROM players WHERE id = ?').get(playerId)) throw new Error('Player not found.');
      if (Number(potionRow?.quantity || 0) <= 0) {
        const error = new Error('You have no Health Potions left.');
        error.code = 'no_health_potions';
        throw error;
      }
      const nextState = { ...state, version: expectedVersion + 1 };
      const nextUpdatedAt = updatedAt || new Date().toISOString();
      const update = this.db.prepare('UPDATE dungeon_runs SET phase = ?, state_json = ?, version = ?, updated_at = ? WHERE id = ? AND version = ?').run(
        nextState.phase,
        JSON.stringify(nextState),
        nextState.version,
        nextUpdatedAt,
        nextState.id,
        expectedVersion,
      );
      if (update.changes !== 1) {
        const error = new Error('Dungeon state changed before the potion could be saved. Refresh and retry.');
        error.code = 'stale_run_version';
        throw error;
      }
      const consumed = this.db.prepare('UPDATE player_consumables SET quantity = quantity - 1 WHERE player_id = ? AND consumable_id = ? AND quantity > 0').run(playerId, consumableId);
      if (consumed.changes !== 1) {
        const error = new Error('That Health Potion is no longer available.');
        error.code = 'no_health_potions';
        throw error;
      }
      this.#syncRunHealth(nextState, nextUpdatedAt);
      this.#syncLegacyPotionProjection(playerId);
      this.db.exec('COMMIT');
      return { state: nextState, consumableId, quantity: this.getConsumableQuantity(playerId, consumableId), healthPotions: this.#legacyPotionQuantity(playerId) };
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  saveFailedRunWithPenalty(state, penaltiesByPlayer = {}) {
    const expectedVersion = Number.isInteger(state.version) ? state.version : 0;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const storedRow = this.db.prepare('SELECT state_json, version FROM dungeon_runs WHERE id = ?').get(state.id);
      if (!storedRow) throw new Error('Run not found while applying the Dungeon death penalty.');
      const stored = this.#decodeRunRow(storedRow);
      if (stored.version !== expectedVersion) {
        const error = new Error('Dungeon state changed before the death penalty could be saved. Refresh and retry.');
        error.code = 'stale_run_version';
        throw error;
      }

      const appliedPenalties = {};
      for (const participant of state.participants || []) {
        const planned = penaltiesByPlayer[participant.playerId] || { goldLost: 0, lossPercent: 20 };
        const row = this.db.prepare(`
          SELECT p.thread_dust AS carried_gold, COALESCE(b.banked_gold, 0) AS banked_gold
          FROM players p
          LEFT JOIN player_bank_balances b ON b.player_id = p.id
          WHERE p.id = ?
        `).get(participant.playerId);
        if (!row) throw new Error('Player not found while applying the Dungeon death penalty.');
        const carriedGoldBefore = Number(row.carried_gold || 0);
        const goldLost = Math.min(carriedGoldBefore, Math.max(0, Math.floor(Number(planned.goldLost || 0))));
        if (goldLost > 0) this.db.prepare('UPDATE players SET thread_dust = thread_dust - ? WHERE id = ?').run(goldLost, participant.playerId);
        appliedPenalties[participant.playerId] = {
          penaltyType: 'carried_gold',
          carriedGoldBefore,
          carriedGoldAfter: carriedGoldBefore - goldLost,
          goldLost,
          lossPercent: Number(planned.lossPercent || 20),
          bankedGold: Number(row.banked_gold || 0),
          bankedGoldSafe: true,
        };
      }

      const nextState = { ...state, version: expectedVersion + 1, deathPenalties: appliedPenalties };
      const update = this.db.prepare('UPDATE dungeon_runs SET phase = ?, state_json = ?, version = ?, updated_at = ? WHERE id = ? AND version = ?').run(
        nextState.phase,
        JSON.stringify(nextState),
        nextState.version,
        new Date().toISOString(),
        nextState.id,
        expectedVersion,
      );
      if (update.changes !== 1) {
        const error = new Error('Dungeon state changed before the death penalty could be committed.');
        error.code = 'stale_run_version';
        throw error;
      }
      this.#syncRunHealth(nextState, new Date().toISOString());
      if (nextState.ownerType === 'party') this.#releaseParty(nextState.ownerId);
      this.db.exec('COMMIT');
      return { state: nextState, penalties: appliedPenalties };
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  getActiveRun(playerId) {
    // Non-combat decision phases are still active runs: they must survive dashboard reads,
    // reconnects, and party/run creation guards until the aggregate reaches complete/failed.
    const row = this.db.prepare("SELECT dr.state_json, dr.version FROM dungeon_runs dr JOIN dungeon_run_participants rp ON rp.run_id = dr.id WHERE rp.player_id = ? AND dr.phase IN ('combat', 'event', 'upgrade', 'boss', 'between_encounter') ORDER BY dr.created_at DESC LIMIT 1").get(playerId);
    return this.#decodeRunRow(row);
  }

  completeRunWithRewards(state, rewardsByPlayer, { threadDust = 15, worldProgressKey, areaUnlockNumber = null }) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const storedRow = this.db.prepare('SELECT state_json, version FROM dungeon_runs WHERE id = ?').get(state.id);
      if (!storedRow) throw new Error('Run not found while applying completion rewards.');
      const stored = this.#decodeRunRow(storedRow);
      if (stored.rewardsGranted) {
        this.db.exec('ROLLBACK');
        return { applied: false, state: stored, areaUnlocks: [] };
      }
      if (stored.version !== state.version) {
        const error = new Error('Dungeon state changed before completion rewards could be saved. Refresh and retry.');
        error.code = 'stale_run_version';
        throw error;
      }

      for (const [playerId, item] of Object.entries(rewardsByPlayer)) {
        this.#insertItem(playerId, item, false);
        this.db.prepare('UPDATE players SET thread_dust = thread_dust + ? WHERE id = ?').run(threadDust, playerId);
      }
      this.db.prepare('INSERT INTO world_progress (progress_key, amount) VALUES (?, 1) ON CONFLICT(progress_key) DO UPDATE SET amount = amount + 1').run(worldProgressKey);

      const areaUnlocks = [];
      if (Number.isInteger(areaUnlockNumber) && areaUnlockNumber > 1) {
        const ensureArea = this.db.prepare(`
          INSERT OR IGNORE INTO player_area_progression (
            player_id,
            current_area_number,
            highest_unlocked_area_number
          ) VALUES (?, 1, 1)
        `);
        const readArea = this.db.prepare('SELECT highest_unlocked_area_number FROM player_area_progression WHERE player_id = ?');
        const unlockArea = this.db.prepare(`
          UPDATE player_area_progression
          SET highest_unlocked_area_number = ?, updated_at = CURRENT_TIMESTAMP
          WHERE player_id = ? AND highest_unlocked_area_number < ?
        `);
        for (const participant of state.participants) {
          ensureArea.run(participant.playerId);
          const before = readArea.get(participant.playerId);
          const result = unlockArea.run(areaUnlockNumber, participant.playerId, areaUnlockNumber);
          if (result.changes === 1) {
            areaUnlocks.push({
              playerId: participant.playerId,
              previousHighestUnlockedAreaNumber: Number(before?.highest_unlocked_area_number || 1),
              areaNumber: areaUnlockNumber,
            });
          }
        }
      }

      const nextState = { ...state, version: state.version + 1 };
      const update = this.db.prepare('UPDATE dungeon_runs SET phase = ?, state_json = ?, version = ?, updated_at = ? WHERE id = ? AND version = ?').run(
        nextState.phase, JSON.stringify(nextState), nextState.version, new Date().toISOString(), nextState.id, state.version,
      );
      if (update.changes !== 1) {
        const error = new Error('Dungeon state changed before completion rewards could be committed. Refresh and retry.');
        error.code = 'stale_run_version';
        throw error;
      }

      this.#syncRunHealth(nextState, new Date().toISOString());
      if (nextState.ownerType === 'party') {
        this.db.prepare("UPDATE parties SET status = 'forming' WHERE id = ?").run(nextState.ownerId);
        this.db.prepare('UPDATE party_members SET ready = CASE WHEN player_id = (SELECT leader_player_id FROM parties WHERE id = ?) THEN 1 ELSE 0 END WHERE party_id = ?').run(nextState.ownerId, nextState.ownerId);
      }

      this.db.exec('COMMIT');
      return { applied: true, state: nextState, areaUnlocks };
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
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
    const result = this.db.prepare('INSERT OR IGNORE INTO purchase_grants (player_id, threaded_user_id, idempotency_key, threaded_transaction_id, item_instance_id) VALUES (?, ?, ?, ?, ?)').run(
      playerId, threadedUserId, idempotencyKey, threadedTransactionId, itemInstanceId,
    );
    return { grant: this.getPurchaseGrant(playerId, idempotencyKey), created: result.changes === 1 };
  }

  #insertItem(playerId, item, ignoreExisting) {
    const verb = ignoreExisting ? 'INSERT OR IGNORE' : 'INSERT';
    this.db.prepare(`${verb} INTO items (id, player_id, definition_id, name, slot, rarity, attack_bonus, effect_code, effect_json, visual_asset_id, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      item.id, playerId, item.definitionId, item.name, item.slot, item.rarity, item.attackBonus, item.effectCode, JSON.stringify(item.effect), item.visualAssetId || null, item.source,
    );
  }

  #decodeRunRow(row) {
    if (!row) return null;
    return { ...JSON.parse(row.state_json), version: row.version };
  }

  #syncRunHealth(state, updatedAt) {
    for (const participant of state.participants || []) {
      const player = this.db.prepare('SELECT max_health FROM players WHERE id = ?').get(participant.playerId);
      if (!player) throw new Error('Player not found while syncing Dungeon health.');
      const maxHealth = Math.max(1, Number(player.max_health || participant.maxHp || 1));
      const currentHealth = Math.max(0, Math.min(maxHealth, Math.floor(Number(participant.hp || 0))));
      this.db.prepare('UPDATE players SET current_health = ?, health_updated_at = ? WHERE id = ?').run(currentHealth, updatedAt, participant.playerId);
    }
  }

  #legacyPotionQuantity(playerId) {
    const row = this.db.prepare("SELECT quantity FROM player_consumables WHERE player_id = ? AND consumable_id = 'minor-health-potion'").get(playerId);
    return Math.max(0, Number(row?.quantity || 0));
  }

  #syncLegacyPotionProjection(playerId) {
    this.db.prepare("UPDATE players SET health_potions = COALESCE((SELECT quantity FROM player_consumables WHERE player_id = ? AND consumable_id = 'minor-health-potion'), 0) WHERE id = ?").run(playerId, playerId);
  }

  #releaseParty(partyId) {
    this.db.prepare("UPDATE parties SET status = 'forming' WHERE id = ?").run(partyId);
    this.db.prepare('UPDATE party_members SET ready = CASE WHEN player_id = (SELECT leader_player_id FROM parties WHERE id = ?) THEN 1 ELSE 0 END WHERE party_id = ?').run(partyId, partyId);
  }

  #decodePlayer(row) {
    const healthTimestamp = String(row.health_updated_at || '');
    const updatedAt = healthTimestamp ? new Date(healthTimestamp.includes('T') ? healthTimestamp : `${healthTimestamp.replace(' ', 'T')}Z`).getTime() : Date.now();
    const elapsedMinutes = Math.max(0, Math.floor((Date.now() - updatedAt) / 60000));
    const storedHealth = Number.isInteger(row.current_health) ? row.current_health : row.max_health;
    const activeRun = this.db.prepare("SELECT dr.state_json FROM dungeon_runs dr JOIN dungeon_run_participants rp ON rp.run_id = dr.id WHERE rp.player_id = ? AND dr.phase IN ('combat', 'event', 'upgrade', 'boss', 'between_encounter') ORDER BY dr.created_at DESC LIMIT 1").get(row.id);
    let activeHealth = null;
    if (activeRun?.state_json) {
      const state = JSON.parse(activeRun.state_json);
      activeHealth = state.participants?.find((participant) => participant.playerId === row.id)?.hp;
    }
    const minorPotion = this.db.prepare("SELECT quantity FROM player_consumables WHERE player_id = ? AND consumable_id = 'minor-health-potion'").get(row.id);
    const healthPotions = minorPotion ? Number(minorPotion.quantity || 0) : (row.health_potions ?? 1);
    const currentHealth = activeHealth == null
      ? Math.min(row.max_health, storedHealth + elapsedMinutes)
      : Math.max(0, Math.min(row.max_health, Number(activeHealth)));
    return { id: row.id, threadedUserId: row.threaded_user_id, displayName: row.display_name, baseAttack: row.base_attack, maxHealth: row.max_health, currentHealth, healthPotions, healthUpdatedAt: row.health_updated_at, threadDust: row.thread_dust, equippedItemId: row.equipped_item_id };
  }

  #decodeParty(row) {
    const members = this.db.prepare('SELECT pm.player_id, pm.ready, p.display_name FROM party_members pm JOIN players p ON p.id = pm.player_id WHERE pm.party_id = ? ORDER BY CASE WHEN pm.player_id = ? THEN 0 ELSE 1 END, pm.joined_at ASC').all(row.id, row.leader_player_id);
    return {
      id: row.id,
      leaderPlayerId: row.leader_player_id,
      joinCode: row.join_code,
      status: row.status,
      members: members.map((member) => ({ playerId: member.player_id, displayName: member.display_name, ready: Boolean(member.ready) })),
      createdAt: row.created_at,
    };
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
        current_health INTEGER NOT NULL DEFAULT 40,
        health_potions INTEGER NOT NULL DEFAULT 1,
        health_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        thread_dust INTEGER NOT NULL DEFAULT 0,
        equipped_item_id TEXT NULL
      );
      CREATE TABLE IF NOT EXISTS player_consumables (
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        consumable_id TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
        PRIMARY KEY (player_id, consumable_id)
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
        visual_asset_id TEXT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS parties (
        id TEXT PRIMARY KEY,
        leader_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        join_code TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK(status IN ('forming', 'in_run')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS party_members (
        party_id TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
        player_id TEXT NOT NULL UNIQUE REFERENCES players(id) ON DELETE CASCADE,
        ready INTEGER NOT NULL DEFAULT 0 CHECK(ready IN (0, 1)),
        joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (party_id, player_id)
      );
      CREATE TABLE IF NOT EXISTS dungeon_runs (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        dungeon_id TEXT NOT NULL,
        phase TEXT NOT NULL,
        state_json TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dungeon_run_participants (
        run_id TEXT NOT NULL REFERENCES dungeon_runs(id) ON DELETE CASCADE,
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        PRIMARY KEY (run_id, player_id)
      );
      CREATE INDEX IF NOT EXISTS idx_run_participants_player ON dungeon_run_participants(player_id);
      CREATE TABLE IF NOT EXISTS player_area_progression (
        player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
        current_area_number INTEGER NOT NULL DEFAULT 1 CHECK(current_area_number >= 1),
        highest_unlocked_area_number INTEGER NOT NULL DEFAULT 1 CHECK(highest_unlocked_area_number >= 1),
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK(current_area_number <= highest_unlocked_area_number)
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

    const runColumns = this.db.prepare('PRAGMA table_info(dungeon_runs)').all();
    if (!runColumns.some((column) => column.name === 'version')) {
      this.db.exec('ALTER TABLE dungeon_runs ADD COLUMN version INTEGER NOT NULL DEFAULT 0');
    }
    const playerColumns = this.db.prepare('PRAGMA table_info(players)').all();
    if (!playerColumns.some((column) => column.name === 'current_health')) this.db.exec('ALTER TABLE players ADD COLUMN current_health INTEGER NOT NULL DEFAULT 40');
    if (!playerColumns.some((column) => column.name === 'health_potions')) this.db.exec('ALTER TABLE players ADD COLUMN health_potions INTEGER NOT NULL DEFAULT 1');
    if (!playerColumns.some((column) => column.name === 'health_updated_at')) this.db.exec("ALTER TABLE players ADD COLUMN health_updated_at TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'");
    const itemColumns = this.db.prepare('PRAGMA table_info(items)').all();
    if (!itemColumns.some((column) => column.name === 'visual_asset_id')) this.db.exec('ALTER TABLE items ADD COLUMN visual_asset_id TEXT NULL');
    this.db.exec(`
      INSERT OR IGNORE INTO player_consumables (player_id, consumable_id, quantity)
      SELECT id, 'minor-health-potion', MAX(0, COALESCE(health_potions, 0))
      FROM players
      WHERE COALESCE(health_potions, 0) > 0;
    `);
  }
}
