import { randomUUID } from 'node:crypto';
import { Character } from '../domain/Character.js';
import { publicCombatSkills } from '../domain/CombatSkillCatalog.js';
import { AdventureRun as DungeonRun, DUNGEONS, RUN_UPGRADES } from '../domain/AdventureRun.js';
import { resolveNormalDeathPenalty } from '../domain/DeathPenaltyPolicy.js';
import { DUNGEON_REWARD_RULES, projectDungeonRisk } from '../domain/DungeonRiskPolicy.js';
import { resolveDungeonPotionAction } from '../domain/HealingPolicy.js';
import { ItemGenerator } from '../domain/ItemGenerator.js';
import { progressionForExperience } from '../domain/LevelProgressionPolicy.js';
import { Party } from '../domain/Party.js';
import { publicRelicAttunements, relicProgression } from '../domain/RelicProgressionPolicy.js';
import { BATTLE_FIGMA_VISUAL_ASSET_IDS, resolveVisualAssetId } from '../content/VisualAssetCatalog.js';
import { SQLiteBankRepository } from '../infrastructure/SQLiteBankRepository.js';
import { SQLiteEquipmentRepository } from '../infrastructure/SQLiteEquipmentRepository.js';
import { SQLiteFightBuffRepository } from '../infrastructure/SQLiteFightBuffRepository.js';
import { SQLitePlayerProgressionRepository } from '../infrastructure/SQLitePlayerProgressionRepository.js';

function healthRecovery(row, now = Date.now()) {
  if (row.currentHealth >= row.maxHealth) return { nextHealthInSeconds: 0, fullHealthInSeconds: 0 };
  const value = String(row.healthUpdatedAt || '');
  const timestamp = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`).getTime();
  const elapsedSeconds = Number.isFinite(timestamp) ? Math.max(0, Math.floor((now - timestamp) / 1000)) : 0;
  const nextHealthInSeconds = Math.max(1, 60 - (elapsedSeconds % 60));
  return { nextHealthInSeconds, fullHealthInSeconds: nextHealthInSeconds + Math.max(0, row.maxHealth - row.currentHealth - 1) * 60 };
}

const SIMPLE_AUTO_TURN_CAP = 120;
const SIMPLE_PLAYER_VISUALS = Object.freeze([
  BATTLE_FIGMA_VISUAL_ASSET_IDS['bramble-druid'],
  BATTLE_FIGMA_VISUAL_ASSET_IDS['rune-bard'],
  BATTLE_FIGMA_VISUAL_ASSET_IDS['iron-vanguard'],
]);

function stableIndex(value, length) {
  if (!length) return 0;
  let hash = 2166136261;
  for (const character of String(value || 'threadbound')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

function playerVisualAssetId(playerId) {
  return SIMPLE_PLAYER_VISUALS[stableIndex(playerId, SIMPLE_PLAYER_VISUALS.length)] || resolveVisualAssetId({ id: playerId }, 'character');
}

function participantProjection(repository, participant) {
  const player = repository.getPlayer(participant.playerId);
  return {
    id: participant.playerId,
    playerId: participant.playerId,
    displayName: player?.displayName || 'Weaver',
    visualAssetId: playerVisualAssetId(participant.playerId),
    hp: Number(participant.hp || 0),
    maxHp: Number(participant.maxHp || 1),
  };
}

function publicItemProjection(item) {
  if (!item) return null;
  return {
    id: item.id || null,
    name: item.name || null,
    slot: item.slot || null,
    rarity: item.rarity || 'common',
    attackBonus: Number(item.attackBonus || 0),
    defenseBonus: Number(item.defenseBonus || 0),
    effect: item.effect ? {
      code: item.effect.code || item.effectCode || null,
      name: item.effect.name || null,
      description: item.effect.description || null,
    } : null,
    visualAssetId: item.visualAssetId || null,
  };
}

function simpleBattleBeat({ repository, before, outcome, actorId }) {
  const defeated = outcome.events.find((event) => event.type === 'EnemyDefeated') || null;
  const damageEvent = outcome.events.find((event) => event.type === 'EnemyDamaged') || null;
  const playerDamage = outcome.events.find((event) => event.type === 'PlayerDamaged') || null;
  const beforeActor = before.participants.find((participant) => participant.playerId === actorId);
  const afterActor = outcome.state.participants.find((participant) => participant.playerId === actorId);
  const beforeEnemy = before.enemy || null;
  const afterEnemy = outcome.state.enemy || null;
  const enemy = afterEnemy || {
    id: defeated?.enemyId || beforeEnemy?.id || 'enemy',
    name: defeated?.enemyName || beforeEnemy?.name || 'Enemy',
    visualAssetId: defeated?.visualAssetId || beforeEnemy?.visualAssetId || null,
    hp: 0,
    maxHp: beforeEnemy?.maxHp || 1,
    isBoss: Boolean(defeated?.isBoss || beforeEnemy?.isBoss),
  };
  const actor = participantProjection(repository, afterActor || beforeActor || { playerId: actorId, hp: 0, maxHp: 1 });
  const damage = Number(outcome.damage || damageEvent?.damage || 0);
  const retaliation = Number(outcome.retaliation || playerDamage?.damage || 0);
  const critical = Boolean(outcome.critical || outcome.events.some((event) => event.type === 'CriticalStrikeLanded'));
  const defeatedName = defeated?.enemyName || beforeEnemy?.name || enemy.name;
  const summary = defeated
    ? `${actor.displayName} defeated ${defeatedName}${damage ? ` for ${damage} damage` : ''}.`
    : `${actor.displayName} hit ${enemy.name} for ${damage} damage${critical ? ' · Critical' : ''}${retaliation ? ` · −${retaliation} HP` : ''}.`;

  return {
    index: 0,
    actorId,
    actorName: actor.displayName,
    actorVisualAssetId: actor.visualAssetId,
    targetId: enemy.id,
    targetName: enemy.name,
    targetVisualAssetId: resolveVisualAssetId(enemy, enemy.isBoss ? 'boss' : 'mob') || enemy.visualAssetId || null,
    targetIsBoss: Boolean(enemy.isBoss),
    targetHpBefore: Number(beforeEnemy?.hp || 0),
    targetHpAfter: Number(afterEnemy?.hp ?? (defeated ? 0 : beforeEnemy?.hp || 0)),
    targetMaxHp: Number(beforeEnemy?.maxHp || enemy.maxHp || 1),
    damage,
    retaliation,
    retaliationActorId: retaliation ? enemy.id : null,
    retaliationActorName: retaliation ? enemy.name : null,
    retaliationActorVisualAssetId: retaliation ? resolveVisualAssetId(enemy, enemy.isBoss ? 'boss' : 'mob') : null,
    retaliationTargetId: playerDamage?.playerId || null,
    retaliationTargetName: playerDamage ? participantProjection(repository, before.participants.find((participant) => participant.playerId === playerDamage.playerId) || {}).displayName : null,
    retaliationTargetVisualAssetId: playerDamage ? playerVisualAssetId(playerDamage.playerId) : null,
    retaliationActorHpBefore: retaliation ? Number(afterEnemy?.hp ?? beforeEnemy?.hp ?? 0) : null,
    retaliationActorHpAfter: retaliation ? Number(afterEnemy?.hp ?? beforeEnemy?.hp ?? 0) : null,
    retaliationTargetHpBefore: playerDamage ? Number(before.participants.find((participant) => participant.playerId === playerDamage.playerId)?.hp || 0) : null,
    retaliationTargetHpAfter: playerDamage ? Number(outcome.state.participants.find((participant) => participant.playerId === playerDamage.playerId)?.hp || 0) : null,
    actorHpBefore: Number(beforeActor?.hp || actor.hp),
    actorHpAfter: Number(afterActor?.hp ?? actor.hp),
    critical,
    defeated: Boolean(defeated),
    phase: outcome.state.phase,
    events: outcome.events.map((event) => event.type),
    summary,
    participants: outcome.state.participants.map((participant) => participantProjection(repository, participant)),
  };
}

function simpleBattleReplay({ repository, initial, final, beats, runId, actorPlayerId }) {
  const firstEnemy = initial.enemy || beats[0]?.target || null;
  const lastEnemy = beats.at(-1) || null;
  const initialParticipants = initial.participants.map((participant) => participantProjection(repository, participant));
  const finalParticipants = final.participants.map((participant) => participantProjection(repository, participant));
  const enemy = {
    id: firstEnemy?.id || lastEnemy?.targetId || 'enemy',
    name: firstEnemy?.name || lastEnemy?.targetName || 'Enemy',
    visualAssetId: resolveVisualAssetId(firstEnemy || {}, firstEnemy?.isBoss ? 'boss' : 'mob') || firstEnemy?.visualAssetId || lastEnemy?.targetVisualAssetId || null,
    isBoss: Boolean(firstEnemy?.isBoss || lastEnemy?.targetIsBoss),
    startingHp: Number(firstEnemy?.hp || lastEnemy?.targetHpBefore || 0),
    endingHp: Number(final.enemy?.hp ?? lastEnemy?.targetHpAfter ?? 0),
    maxHp: Number(firstEnemy?.maxHp || lastEnemy?.targetMaxHp || 1),
  };

  return {
    version: 1,
    kind: 'simple-dungeon-battle',
    battleId: `dungeon:${runId}:room:${Number(initial.encounterIndex || 0)}`,
    runId,
    actorPlayerId,
    roomIndex: Number(initial.encounterIndex || 0),
    status: final.phase === 'failed' ? 'defeat' : final.phase === 'complete' ? 'victory' : 'room_clear',
    startedAt: null,
    players: initialParticipants.map((participant) => ({
      ...participant,
      startingHp: participant.hp,
      endingHp: finalParticipants.find((candidate) => candidate.id === participant.id)?.hp ?? participant.hp,
    })),
    enemy,
    beats: beats.map((beat, index) => ({ ...beat, index })),
    finalPhase: final.phase,
    nextEncounter: final.nextEncounter ? {
      id: final.nextEncounter.enemy?.id || null,
      name: final.nextEncounter.enemy?.name || null,
      visualAssetId: resolveVisualAssetId(final.nextEncounter.enemy || {}, final.nextEncounter.enemy?.isBoss ? 'boss' : 'mob') || final.nextEncounter.enemy?.visualAssetId || null,
      hp: final.nextEncounter.enemy?.hp ?? null,
      maxHp: final.nextEncounter.enemy?.maxHp ?? null,
      isBoss: Boolean(final.nextEncounter.enemy?.isBoss),
    } : null,
    rewards: [],
  };
}

export class GameService {
  constructor({ repository, eventBus, arcManifestService = null, progressionRepository = null, equipmentRepository = null, fightBuffRepository = null, bankRepository = null, itemGenerator = new ItemGenerator(), idFactory = randomUUID }) {
    this.repository = repository;
    this.eventBus = eventBus;
    this.arcManifestService = arcManifestService;
    this.progressionRepository = progressionRepository || new SQLitePlayerProgressionRepository({ database: repository.db });
    this.equipmentRepository = equipmentRepository || new SQLiteEquipmentRepository({ database: repository.db });
    this.fightBuffRepository = fightBuffRepository || new SQLiteFightBuffRepository({ database: repository.db });
    this.bankRepository = bankRepository || new SQLiteBankRepository({ database: repository.db });
    this.itemGenerator = itemGenerator;
    this.idFactory = idFactory;
  }

  ensurePlayer(identityProfile) {
    return this.repository.getOrCreatePlayer({
      threadedUserId: identityProfile.id,
      displayName: identityProfile.name || identityProfile.username || `Weaver ${identityProfile.id}`,
    });
  }

  dashboard(playerId) {
    const row = this.repository.getPlayer(playerId);
    if (!row) throw new Error('Player not found.');
    const loadout = this.equipmentRepository.getLoadout(playerId);
    const equippedItem = loadout.weapon;
    const character = new Character({ ...row, equippedItem, equipment: loadout });
    const stats = character.stats;
    const progression = progressionForExperience(this.progressionRepository.get(playerId).experience);
    const party = this.repository.getPartyForPlayer(playerId);
    const activeRun = this.repository.getActiveRun(playerId);
    const generatedDungeons = this.arcManifestService?.runtimeDungeons() || [];
    const allDungeons = [...Object.values(DUNGEONS), ...generatedDungeons];
    const decorateItem = (item) => item ? { ...item, progression: relicProgression(item) } : null;
    const equipment = Object.fromEntries(Object.entries(loadout).map(([slot, item]) => [slot, decorateItem(item)]));
    const activeFightBuffs = this.fightBuffRepository.listActive(playerId).map((buff) => ({
      code: buff.code,
      name: buff.name,
      description: buff.description,
      sourceRecipeId: buff.sourceRecipeId,
      remainingFights: buff.remainingFights,
    }));

    return {
      character: {
        id: character.id,
        displayName: character.displayName,
        visualAssetId: playerVisualAssetId(playerId),
        baseAttack: character.baseAttack,
        stats,
        attack: stats.attack,
        defense: stats.defense,
        maxHp: stats.maxHp,
        speed: stats.speed,
        critChance: stats.critChance,
        critChancePercent: stats.critChancePercent,
        // Compatibility aliases while older Hunt/dungeon/presentation callers migrate.
        attackPower: stats.attack,
        maxHealth: stats.maxHp,
        currentHealth: row.currentHealth,
        healthPotions: row.healthPotions,
        healthRecovery: healthRecovery(row),
        gold: character.gold,
        experience: progression.experience,
        xp: progression.experience,
        level: progression.level,
        levelProgression: progression,
        // Compatibility alias until the persisted thread_dust column and older callers migrate.
        threadDust: character.threadDust,
        // Canonical five-slot loadout. `equippedItem` remains a temporary Weapon alias for
        // legacy combat/presentation callers while the strangler migration continues.
        equipment,
        equippedItem: equipment.weapon,
      },
      activeFightBuffs,
      party: party ? this.#decorateParty(party, playerId) : null,
      inventory: this.repository.listItems(playerId).map(decorateItem),
      activeRun: activeRun ? this.#decorateRun(activeRun, playerId) : null,
      achievements: this.repository.listAchievements(playerId),
      world: this.repository.getWorldState(),
      dungeons: allDungeons.map(({ id, name, recommendedPlayers, minPlayers, maxPlayers, arcId, arcTitle, sourceManifestRevision }) => ({ id, name, recommendedPlayers, minPlayers, maxPlayers, arcId: arcId || 'arc-1', arcTitle: arcTitle || 'The First Unraveling', sourceManifestRevision: sourceManifestRevision || null })),
      runUpgrades: Object.values(RUN_UPGRADES),
      combatSkills: publicCombatSkills(),
      relicAttunements: publicRelicAttunements(),
    };
  }

  startDungeon(playerId, dungeonId) {
    if (this.repository.getActiveRun(playerId)) throw new Error('Finish or fail the active run before starting another.');
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const dungeonDefinition = DUNGEONS[dungeonId] || this.arcManifestService?.resolveDungeon(dungeonId);
    if (!dungeonDefinition) throw new Error(`Unknown dungeon: ${dungeonId}`);

    const storedParty = this.repository.getPartyForPlayer(playerId);
    let participantPlayers;
    let ownerType;
    let ownerId;

    if (storedParty) {
      const party = new Party(storedParty);
      if (!party.canStart(playerId)) throw new Error('Only the ready party leader can start a dungeon.');
      participantPlayers = party.participantIds().map((participantId) => {
        if (this.repository.getActiveRun(participantId)) throw new Error('A party member is already in an active dungeon.');
        const participant = this.repository.getPlayer(participantId);
        if (!participant) throw new Error('Party member was not found.');
        return participant;
      });
      ownerType = 'party';
      ownerId = party.id;
    } else {
      participantPlayers = [player];
      ownerType = 'player';
      ownerId = player.id;
    }

    const run = DungeonRun.start({
      id: this.idFactory(),
      ownerType,
      ownerId,
      startedByPlayerId: playerId,
      participants: participantPlayers.map((participant) => ({ playerId: participant.id, maxHealth: participant.maxHealth })),
      dungeonId,
      dungeonDefinition,
    });
    const persisted = this.repository.createRun(run.toJSON());
    const actor = persisted.participants.find((participant) => participant.playerId === playerId);
    this.eventBus.publish({
      type: 'DungeonStarted',
      playerId,
      participantIds: persisted.participants.map((participant) => participant.playerId),
      runId: persisted.id,
      dungeonId,
      ownerType,
      ownerId,
      simpleCombat: Boolean(persisted.simpleCombat),
      dungeonName: persisted.dungeonDefinition?.name || null,
      recommendedAttack: persisted.dungeonDefinition?.recommendedAttack || null,
      enemyId: persisted.enemy?.id || null,
      enemyName: persisted.enemy?.name || null,
      enemyVisualAssetId: persisted.enemy?.visualAssetId || null,
      enemyHp: persisted.enemy?.hp ?? null,
      enemyMaxHp: persisted.enemy?.maxHp ?? null,
      actorHp: actor?.hp ?? null,
      actorMaxHp: actor?.maxHp ?? null,
      phase: persisted.phase,
    });
    return this.#decorateRun(persisted, playerId);
  }

  attack(playerId, runId) {
    const { run, character, equipped } = this.#combatContext(playerId, runId);
    if (run.state.simpleCombat && run.state.sharedSurface) return this.resolveSimpleEncounter(playerId, runId);
    const outcome = run.attack({
      playerId,
      attackPower: character.attackPower,
      equipmentEffect: equipped?.effectCode ?? 'none',
      attunementCode: equipped?.effect?.attunementCode ?? null,
    });
    return this.#persistCombatOutcome(playerId, run, outcome, 'attack');
  }

  resolveSimpleEncounter(playerId, runId, { recovery = null } = {}) {
    const { run } = this.#combatContext(playerId, runId);
    if (!run.state.simpleCombat) return this.attack(playerId, runId);
    if (!['combat', 'boss'].includes(run.state.phase)) {
      return {
        run: this.#decorateRun(run.toJSON(), playerId),
        battleReplay: null,
      };
    }

    const initial = run.toJSON();
    const baseVersion = Number.isInteger(initial.version) ? initial.version : 0;
    const beats = [];
    const events = [];
    let totalDamage = 0;
    let totalRetaliation = 0;
    let lastOutcome = null;
    let actorCursor = 0;

    for (let turn = 0; turn < SIMPLE_AUTO_TURN_CAP && ['combat', 'boss'].includes(run.state.phase); turn += 1) {
      const alive = run.state.participants.filter((participant) => participant.hp > 0);
      if (!alive.length) break;
      const actor = alive[actorCursor % alive.length];
      actorCursor += 1;
      const player = this.repository.getPlayer(actor.playerId);
      if (!player) throw new Error('Player not found.');
      const equipment = this.equipmentRepository.getLoadout(actor.playerId);
      const equipped = equipment.weapon;
      const character = new Character({ ...player, equippedItem: equipped, equipment });
      const before = run.toJSON();

      // The persisted run is versioned once for the public command. Advancing the
      // in-memory version between beats keeps deterministic critical-strike policy
      // varied without pretending these internal beats were separate commands.
      run.state.version = baseVersion + turn;
      const outcome = run.attack({
        playerId: actor.playerId,
        attackPower: character.attackPower,
        equipmentEffect: equipped?.effectCode ?? 'none',
        attunementCode: equipped?.effect?.attunementCode ?? null,
      });
      lastOutcome = outcome;
      totalDamage += Number(outcome.damage || 0);
      totalRetaliation += Number(outcome.retaliation || 0);
      beats.push(simpleBattleBeat({ repository: this.repository, before, outcome, actorId: actor.playerId }));
      events.push(...outcome.events);

      if (outcome.state.phase === 'failed' || !['combat', 'boss'].includes(outcome.state.phase)) break;
    }

    if (!lastOutcome) throw new Error('The simple Dungeon encounter could not resolve.');
    if (['combat', 'boss'].includes(run.state.phase)) {
      const error = new Error('The simple Dungeon encounter exceeded its safe auto-resolve limit.');
      error.code = 'simple_dungeon_auto_turn_cap';
      throw error;
    }

    run.state.version = baseVersion;
    const final = run.toJSON();
  const battleReplay = simpleBattleReplay({
      repository: this.repository,
      initial,
      final,
      beats,
      runId,
      actorPlayerId: playerId,
  });
  battleReplay.recovery = recovery ? structuredClone(recovery) : null;

    return this.#persistCombatOutcome(playerId, run, {
      ...lastOutcome,
      state: final,
      events,
      damage: totalDamage,
      retaliation: totalRetaliation,
      battleReplay,
      simpleCombat: true,
    }, 'auto-attack');
  }

  continueDungeon(playerId, runId) {
    const { run, state } = this.#simpleDecisionContext(playerId, runId);
    const outcome = run.continueEncounter({ playerId });
    outcome.state = this.repository.saveRun(outcome.state);
    this.eventBus.publishAll(outcome.events.map((event) => ({
      ...event,
      playerId,
      participantIds: outcome.state.participants.map((participant) => participant.playerId),
      silentStream: Boolean(state.sharedSurface),
    })));
    if (!state.sharedSurface) {
      const decoratedRun = this.#decorateRun(outcome.state, playerId);
      return { run: decoratedRun, state: decoratedRun, battleReplay: null, continued: true, previousPhase: state.phase };
    }
    const resolved = this.resolveSimpleEncounter(playerId, runId);
    return { ...resolved, continued: true, previousPhase: state.phase };
  }

  useDungeonPotion(playerId, runId) {
    const { run } = this.#simpleDecisionContext(playerId, runId);
    const participant = run.participant(playerId);
    const player = this.repository.getPlayer(playerId);
    const plan = resolveDungeonPotionAction({
      activeRun: run.state,
      currentHealth: participant.hp,
      maxHealth: participant.maxHp,
      healthPotions: player.healthPotions,
    });
    const outcome = run.usePotionBetweenEncounters({ playerId, healed: plan.healed });
    const persisted = this.repository.saveRunWithPotion(outcome.state, playerId);
    outcome.state = persisted.state;
    const event = {
      ...outcome.events[0],
      healthPotions: persisted.healthPotions,
      participantIds: outcome.state.participants.map((candidate) => candidate.playerId),
    };
    this.eventBus.publish({ ...event, silentStream: Boolean(run.state.sharedSurface) });
    const recovery = { ...plan, healthPotions: persisted.healthPotions };
    if (!run.state.sharedSurface) {
      const decoratedRun = this.#decorateRun(outcome.state, playerId);
      return { run: decoratedRun, state: decoratedRun, battleReplay: null, recovery };
    }
    const resolved = this.resolveSimpleEncounter(playerId, runId, { recovery });
    return {
      ...resolved,
      recovery,
    };
  }

  retreatDungeon(playerId, runId) {
    const { run } = this.#simpleDecisionContext(playerId, runId);
    const outcome = run.retreat({ playerId });
    outcome.state = this.repository.saveRun(outcome.state);
    this.eventBus.publishAll(outcome.events.map((event) => ({
      ...event,
      playerId,
      participantIds: outcome.state.participants.map((participant) => participant.playerId),
    })));
    return { run: this.#decorateRun(outcome.state, playerId), retreated: true };
  }

  guard(playerId, runId) {
    const { run, equipped } = this.#combatContext(playerId, runId);
    return this.#persistCombatOutcome(playerId, run, run.guard({ playerId, attunementCode: equipped?.effect?.attunementCode ?? null }), 'guard');
  }

  interrupt(playerId, runId) {
    const { run, equipped } = this.#combatContext(playerId, runId);
    return this.#persistCombatOutcome(playerId, run, run.interrupt({ playerId, attunementCode: equipped?.effect?.attunementCode ?? null }), 'interrupt');
  }

  mend(playerId, runId, targetPlayerId) {
    const { run, equipped } = this.#combatContext(playerId, runId);
    return this.#persistCombatOutcome(playerId, run, run.mend({ playerId, targetPlayerId, attunementCode: equipped?.effect?.attunementCode ?? null }), 'mend');
  }

  revive(playerId, runId, targetPlayerId) {
    const { run, equipped } = this.#combatContext(playerId, runId);
    return this.#persistCombatOutcome(playerId, run, run.revive({ playerId, targetPlayerId, attunementCode: equipped?.effect?.attunementCode ?? null }), 'revive');
  }

  useSkill(playerId, runId, skillId) {
    const { run, character, equipped } = this.#combatContext(playerId, runId);
    const outcome = run.useSkill({ playerId, skillId, attackPower: character.attackPower, attunementCode: equipped?.effect?.attunementCode ?? null });
    return this.#persistCombatOutcome(playerId, run, outcome, 'skill');
  }

  chooseRunEvent(playerId, runId, choiceId) {
    const runState = this.repository.getRun(runId);
    if (!runState) throw new Error('Run not found.');
    const run = new DungeonRun(runState);
    if (!run.hasParticipant(playerId)) throw new Error('Run not found.');
    if (runState.ownerType === 'party') {
      const party = this.repository.getParty(runState.ownerId);
      if (!party || party.leaderPlayerId !== playerId) throw new Error('Only the party leader can choose the shared run event.');
    }
    const outcome = run.chooseRunEvent(choiceId);
    outcome.state = this.repository.saveRun(outcome.state);
    this.eventBus.publishAll(outcome.events.map((event) => ({ ...event, playerId, participantIds: outcome.state.participants.map((participant) => participant.playerId) })));
    return this.#decorateRun(outcome.state, playerId);
  }

  chooseUpgrade(playerId, runId, upgradeId) {
    const runState = this.repository.getRun(runId);
    if (!runState) throw new Error('Run not found.');
    const run = new DungeonRun(runState);
    if (!run.hasParticipant(playerId)) throw new Error('Run not found.');
    if (runState.ownerType === 'party') {
      const party = this.repository.getParty(runState.ownerId);
      if (!party || party.leaderPlayerId !== playerId) throw new Error('Only the party leader can choose the shared run upgrade.');
    }
    const outcome = run.chooseUpgrade(upgradeId);
    outcome.state = this.repository.saveRun(outcome.state);
    this.eventBus.publishAll(outcome.events.map((event) => ({ ...event, playerId })));
    return this.#decorateRun(outcome.state, playerId);
  }

  equipItem(playerId, itemId) {
    const item = this.repository.getItem(itemId);
    if (!item || item.playerId !== playerId) throw new Error('Item not found.');
    const equipped = this.equipmentRepository.equip(playerId, itemId);
    this.eventBus.publish({ type: 'ItemEquipped', playerId, itemId, slot: equipped.slot });
    return this.dashboard(playerId);
  }

  #combatContext(playerId, runId) {
    const runState = this.repository.getRun(runId);
    if (!runState) throw new Error('Run not found.');
    const run = new DungeonRun(runState);
    if (!run.hasParticipant(playerId)) throw new Error('Run not found.');
    const player = this.repository.getPlayer(playerId);
    const equipment = this.equipmentRepository.getLoadout(playerId);
    const equipped = equipment.weapon;
    return { run, player, equipped, character: new Character({ ...player, equippedItem: equipped, equipment }) };
  }

  #simpleDecisionContext(playerId, runId) {
    const state = this.repository.getRun(runId);
    if (!state) throw new Error('Run not found.');
    if (state.simpleCombat !== true) {
      const error = new Error('This decision is only available for a simple Dungeon run.');
      error.code = 'simple_dungeon_decision_only';
      throw error;
    }
    const run = new DungeonRun(state);
    if (!run.hasParticipant(playerId)) throw new Error('Run not found.');
    return { run, state };
  }

  #publishResolvedAction(playerId, action, outcome) {
    const state = outcome.state;
    const actor = state.participants.find((participant) => participant.playerId === playerId) || null;
    const lastEvent = (type) => [...outcome.events].reverse().find((event) => event.type === type) || null;
    const replay = outcome.battleReplay || null;
    const damaged = lastEvent('PlayerDamaged');
    const damagedTarget = damaged ? state.participants.find((participant) => participant.playerId === damaged.playerId) || null : null;
    const defeated = lastEvent('EnemyDefeated');
    const healed = lastEvent('PlayerHealed');
    const revived = lastEvent('PlayerRevived');
    const interrupted = lastEvent('EnemyInterrupted');
    const combo = lastEvent('SkillComboTriggered');
    const protectedAlly = lastEvent('PlayerProtected');
    const bossPhaseChanged = lastEvent('BossPhaseChanged');
    const relicTrigger = lastEvent('RelicAttunementTriggered');
    const prevented = protectedAlly
      ? Number(protectedAlly.prevented || 0)
      : damaged
        ? Math.max(0, Number(damaged.rawDamage || 0) - Number(damaged.damage || 0))
        : 0;

    this.eventBus.publish({
      type: 'CombatActionResolved',
      playerId,
      participantIds: state.participants.map((participant) => participant.playerId),
      runId: state.id,
      dungeonId: state.dungeonId,
      action,
      autoResolved: Boolean(replay),
      battleReplay: replay ? structuredClone(replay) : null,
      recovery: outcome.recovery ? structuredClone(outcome.recovery) : replay?.recovery ? structuredClone(replay.recovery) : null,
      rewards: outcome.rewards ? outcome.rewards.map((entry) => ({ playerId: entry.playerId, item: publicItemProjection(entry.item) })) : replay?.rewards ? structuredClone(replay.rewards) : [],
      skillId: outcome.skillId || null,
      combo: combo?.combo || null,
      comboBonus: Number(combo?.bonusDamage || 0),
      damage: Number(outcome.damage || 0),
      retaliation: Number(outcome.retaliation || damaged?.damage || 0),
      prevented,
      healed: Number(outcome.healed || healed?.amount || 0),
      restoredHp: Number(outcome.restoredHp || revived?.restoredHp || 0),
      targetPlayerId: healed?.targetPlayerId || revived?.targetPlayerId || damaged?.playerId || null,
      protectedPlayerId: protectedAlly?.targetPlayerId || null,
      protectionRawDamage: Number(protectedAlly?.rawDamage || 0),
      relicAttunement: relicTrigger ? {
        code: relicTrigger.attunementCode,
        name: relicTrigger.attunementName,
        effect: relicTrigger.effect,
        amount: Number(relicTrigger.amount || 0),
      } : null,
      actorHp: actor?.hp ?? null,
      actorMaxHp: actor?.maxHp ?? null,
      actorFocus: actor?.focus ?? null,
      actorMaxFocus: actor?.maxFocus ?? null,
      actorSkillCooldowns: actor?.skillCooldowns ? structuredClone(actor.skillCooldowns) : {},
      targetHp: damagedTarget?.hp ?? null,
      targetMaxHp: damagedTarget?.maxHp ?? null,
      enemyId: state.enemy?.id || defeated?.enemyId || replay?.enemy?.id || null,
      enemyName: state.enemy?.name || defeated?.enemyName || replay?.enemy?.name || null,
      enemyVisualAssetId: state.enemy?.visualAssetId || defeated?.visualAssetId || replay?.enemy?.visualAssetId || null,
      enemyHp: state.enemy?.hp ?? replay?.enemy?.endingHp ?? null,
      enemyMaxHp: state.enemy?.maxHp ?? replay?.enemy?.maxHp ?? null,
      enemyStatuses: state.enemy?.statuses ? structuredClone(state.enemy.statuses) : {},
      bossBattlePhase: state.enemy?.isBoss ? Number(state.enemy.battlePhase || 1) : null,
      bossPhaseName: state.enemy?.isBoss ? state.enemy.phaseName || null : null,
      bossPhaseChanged: bossPhaseChanged ? {
        fromBattlePhase: bossPhaseChanged.fromBattlePhase,
        battlePhase: bossPhaseChanged.battlePhase,
        phaseName: bossPhaseChanged.phaseName,
      } : null,
      runEvent: state.runEvent ? structuredClone(state.runEvent) : null,
      defeatedEnemyId: defeated?.enemyId || null,
      defeatedEnemyName: defeated?.enemyName || null,
      defeatedEnemyVisualAssetId: defeated?.visualAssetId || null,
      defeatedBoss: Boolean(defeated?.isBoss),
      roomCleared: Boolean(lastEvent('DungeonRoomCleared') || replay?.status === 'room_clear'),
      nextEnemyId: state.nextEncounter?.enemy?.id || replay?.nextEncounter?.id || null,
      nextEnemyName: state.nextEncounter?.enemy?.name || replay?.nextEncounter?.name || null,
      nextEnemyVisualAssetId: state.nextEncounter?.enemy?.visualAssetId || replay?.nextEncounter?.visualAssetId || null,
      nextEnemyHp: state.nextEncounter?.enemy?.hp ?? replay?.nextEncounter?.hp ?? null,
      nextEnemyMaxHp: state.nextEncounter?.enemy?.maxHp ?? replay?.nextEncounter?.maxHp ?? null,
      nextEnemyIsBoss: Boolean(state.nextEncounter?.enemy?.isBoss || replay?.nextEncounter?.isBoss),
      interruptedIntentId: interrupted?.intentId || null,
      enemyIntent: state.enemyIntent ? structuredClone(state.enemyIntent) : null,
      phase: state.phase,
      encounterIndex: state.encounterIndex,
    });
  }

  #persistCombatOutcome(playerId, run, outcome, action) {
    if (outcome.state.phase === 'failed') {
      const penaltiesByPlayer = Object.fromEntries((outcome.state.participants || []).map((participant) => {
        const balance = this.bankRepository.getBalance(participant.playerId);
        return [participant.playerId, resolveNormalDeathPenalty({ carriedGold: balance.carriedGold })];
      }));
      const failed = this.repository.saveFailedRunWithPenalty(outcome.state, penaltiesByPlayer);
      outcome.state = failed.state;
      outcome.events = outcome.events.map((event) => event.type === 'DungeonFailed'
        ? {
            ...event,
            deathPenalties: failed.penalties,
            goldLost: failed.penalties[playerId]?.goldLost || 0,
            carriedGold: failed.penalties[playerId]?.carriedGoldAfter ?? null,
            bankedGold: failed.penalties[playerId]?.bankedGold ?? null,
          }
        : event);
    } else {
      outcome.state = this.repository.saveRun(outcome.state);
    }
    let rewards = null;
    if (outcome.state.phase === 'complete' && !outcome.state.rewardsGranted) {
      const rewardsByPlayer = {};
      const rewardItemIds = {};
      for (const participant of outcome.state.participants) {
        const reward = this.arcManifestService?.generateReward(outcome.state.dungeonId) || this.itemGenerator.generateReward({ source: outcome.state.dungeonId });
        rewardsByPlayer[participant.playerId] = reward;
        rewardItemIds[participant.playerId] = reward.id;
      }

      const completedRun = new DungeonRun(outcome.state);
      completedRun.markRewards(rewardItemIds);
      const generatedArcId = outcome.state.dungeonDefinition?.arcId;
      const configuredUnlock = Number(outcome.state.dungeonDefinition?.unlocksAreaNumber);
      const areaUnlockNumber = outcome.state.dungeonDefinition?.progressionAdventure && Number.isInteger(configuredUnlock) && configuredUnlock > 1
        ? configuredUnlock
        : null;
      const completion = this.repository.completeRunWithRewards(completedRun.toJSON(), rewardsByPlayer, {
        threadDust: DUNGEON_REWARD_RULES.completionGold,
        worldProgressKey: generatedArcId ? `arc:${generatedArcId}:${outcome.state.dungeonId}:clears` : 'arc-1-frayed-hollow-clears',
        areaUnlockNumber,
      });

      outcome.state = completion.state;
      if (completion.applied) {
        rewards = Object.entries(rewardsByPlayer).map(([participantId, item]) => ({ playerId: participantId, item }));
        if (outcome.battleReplay) {
          outcome.battleReplay.rewards = rewards.map((entry) => ({ playerId: entry.playerId, item: publicItemProjection(entry.item) }));
          outcome.battleReplay.areaUnlocks = (completion.areaUnlocks || []).map((unlock) => ({
            playerId: unlock.playerId,
            areaNumber: unlock.areaNumber,
          }));
        }
        const participantIds = completion.state.participants.map((participant) => participant.playerId);
        for (const participant of completion.state.participants) {
          this.eventBus.publish({
            type: 'DungeonCompleted',
            silentStream: Boolean(outcome.battleReplay),
            playerId: participant.playerId,
            participantIds,
            runId: completion.state.id,
            dungeonId: completion.state.dungeonId,
          });
          this.eventBus.publish({ type: 'ItemGenerated', silentStream: Boolean(outcome.battleReplay), playerId: participant.playerId, itemId: rewardItemIds[participant.playerId], source: completion.state.dungeonId });
        }
        for (const unlock of completion.areaUnlocks || []) {
          this.eventBus.publish({
            type: 'AreaUnlocked',
            silentStream: Boolean(outcome.battleReplay),
            playerId: unlock.playerId,
            participantIds,
            runId: completion.state.id,
            dungeonId: completion.state.dungeonId,
            areaNumber: unlock.areaNumber,
          });
        }
      }
    }

    if (outcome.battleReplay && !rewards) outcome.battleReplay.rewards = [];
    const eventsForStream = outcome.battleReplay
      ? outcome.events.map((event) => ({ ...event, silentStream: true }))
      : outcome.events;
    this.eventBus.publishAll(eventsForStream);
    outcome.rewards = rewards;
    this.#publishResolvedAction(playerId, action, outcome);

    const decoratedRun = this.#decorateRun(outcome.state, playerId);
    return {
      ...outcome,
      state: decoratedRun,
      run: decoratedRun,
      rewards,
      reward: rewards?.find((entry) => entry.playerId === playerId)?.item ?? null,
    };
  }

  #decorateParty(party, viewerPlayerId) {
    const model = new Party(party);
    return {
      ...party,
      isLeader: party.leaderPlayerId === viewerPlayerId,
      allReady: model.allReady,
      canStart: model.canStart(viewerPlayerId),
    };
  }

  #decorateRun(runState, viewerPlayerId) {
    const participants = runState.participants.map((participant) => ({
      ...participant,
      displayName: this.repository.getPlayer(participant.playerId)?.displayName || 'Unknown Weaver',
      visualAssetId: playerVisualAssetId(participant.playerId),
    }));
    return {
      ...runState,
      participants,
      viewer: participants.find((participant) => participant.playerId === viewerPlayerId) || null,
      enemy: runState.enemy ? {
        ...runState.enemy,
        visualAssetId: resolveVisualAssetId(runState.enemy, runState.enemy.isBoss ? 'boss' : 'mob'),
      } : null,
      risk: projectDungeonRisk({ carriedGold: this.bankRepository.getBalance(viewerPlayerId).carriedGold }),
      isLeader: runState.ownerType === 'player'
        ? runState.startedByPlayerId === viewerPlayerId
        : this.repository.getParty(runState.ownerId)?.leaderPlayerId === viewerPlayerId,
    };
  }
}
