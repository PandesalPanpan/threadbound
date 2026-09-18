import { projectAutomaticBattleResult } from './AutomaticBattleReadModel.js';
import { resolveAutomaticBattleSkill } from '../domain/AutomaticBattleSkillPolicy.js';
import { simulateAutomaticBattle } from '../domain/AutomaticBattleSimulator.js';
import { createEquipmentAwareAutomaticBasicAttackResolver } from '../domain/EquipmentBattleEffectPolicy.js';
import { BATTLE_FIGMA_VISUAL_ASSET_IDS } from '../content/VisualAssetCatalog.js';

const FIGMA_FILE_KEY = 'xfAbc94dv0LxhxhC9q9BhK';

function skill(id, name, description) {
  return Object.freeze({ id, name, label: name, manaCost: 100, description });
}

const BATTLE_SKILLS = Object.freeze({
  threadsong: skill('threadsong', 'Threadsong', 'Pulse the enemy line and restore Mana to allies.'),
  thornwake: skill('thornwake', 'Thornwake', 'Root the enemy line with a poisonous thread.'),
  'shield-break': skill('shield-break', 'Shield Break', 'Drive a heavy stitch through the front line.'),
  'ember-burst': skill('ember-burst', 'Ember Burst', 'Splash fire across the enemy line.'),
  'mire-song': skill('mire-song', 'Mire Song', 'Leave poison singing in the target thread.'),
  'shadow-lunge': skill('shadow-lunge', 'Shadow Lunge', 'Cut across the threadline before it can settle.'),
});

function unit({ id, name, visualAssetId, team, hp, attack, defense, speed, mana, skillId, manaGain = 12, critChance = 0.05 }) {
  return {
    id,
    name,
    displayName: name,
    team,
    visualAssetId,
    hp,
    maxHp: hp,
    attack,
    defense,
    speed,
    critChance,
    mana,
    maxMana: 100,
    manaGain,
    skills: skillId ? [BATTLE_SKILLS[skillId]] : [],
    tags: ['figma-battle-simulation', team],
  };
}

function canonicalRoster(playerId, playerName) {
  return {
    players: [
      unit({ id: 'battle:bramble-druid', name: 'Bramble Druid', visualAssetId: BATTLE_FIGMA_VISUAL_ASSET_IDS['bramble-druid'], team: 'players', hp: 100, attack: 15, defense: 5, speed: 9, mana: 41, skillId: 'thornwake' }),
      unit({ id: `battle:rune-bard:${playerId}`, name: 'Rune Bard', visualAssetId: BATTLE_FIGMA_VISUAL_ASSET_IDS['rune-bard'], team: 'players', hp: 100, attack: 17, defense: 3, speed: 11, mana: 72, skillId: 'threadsong' }),
      unit({ id: 'battle:iron-vanguard', name: 'Iron Vanguard', visualAssetId: BATTLE_FIGMA_VISUAL_ASSET_IDS['iron-vanguard'], team: 'players', hp: 100, attack: 13, defense: 8, speed: 7, mana: 29, skillId: 'shield-break' }),
    ],
    enemies: [
      unit({ id: 'battle:cinder-imp', name: 'Cinder Imp', visualAssetId: BATTLE_FIGMA_VISUAL_ASSET_IDS['cinder-imp'], team: 'enemies', hp: 100, attack: 12, defense: 2, speed: 10, mana: 36, skillId: 'ember-burst' }),
      unit({ id: 'battle:rot-toad', name: 'Rot Toad', visualAssetId: BATTLE_FIGMA_VISUAL_ASSET_IDS['rot-toad'], team: 'enemies', hp: 100, attack: 11, defense: 4, speed: 8, mana: 58, skillId: 'mire-song' }),
      unit({ id: 'battle:gloom-hound', name: 'Gloom Hound', visualAssetId: BATTLE_FIGMA_VISUAL_ASSET_IDS['gloom-hound'], team: 'enemies', hp: 100, attack: 14, defense: 3, speed: 9, mana: 81, skillId: 'shadow-lunge' }),
    ],
    playerName,
  };
}

/**
 * Coordinates the non-mutating Figma battle concept preview. All combat facts
 * still come from AutomaticBattleSimulator; this service only chooses a
 * server-owned roster and projects the result for the React presentation.
 */
export class BattleSimulationService {
  constructor({ gameService, random = () => 0.91 } = {}) {
    if (!gameService || typeof gameService.dashboard !== 'function') throw new Error('BattleSimulationService requires GameService.');
    if (typeof random !== 'function') throw new Error('BattleSimulationService random source must be a function.');
    this.gameService = gameService;
    this.random = random;
  }

  preview(playerId) {
    const dashboard = this.gameService.dashboard(playerId);
    const roster = canonicalRoster(playerId, dashboard.character.displayName);
    const battle = simulateAutomaticBattle(
      {
        resolveAction: createEquipmentAwareAutomaticBasicAttackResolver({ random: this.random }),
        resolveSkill: resolveAutomaticBattleSkill,
        maxTurns: 120,
      },
      {
        players: roster.players,
        enemies: roster.enemies,
        context: {
          activity: 'battle-simulation',
          ownerPlayerId: playerId,
          figmaFileKey: FIGMA_FILE_KEY,
          referenceNodes: ['91:2', '115:3', '115:199', '127:2', '115:395', '115:601'],
        },
      },
    );
    const viewerId = roster.players[1].id;
    const projected = projectAutomaticBattleResult(battle, { viewerId });
    return {
      mode: 'automatic-battle-simulation',
      authoritative: true,
      replayable: true,
      battleId: `battle-simulation:${playerId}`,
      owner: { playerId, displayName: dashboard.character.displayName },
      figma: {
        fileKey: FIGMA_FILE_KEY,
        pageNodeId: '91:2',
        referenceNodes: ['115:3', '115:199', '127:2', '115:395', '115:601'],
        assetNodes: {
          'bramble-druid': '112:7',
          'iron-vanguard': '112:12',
          'rune-bard': '112:17',
          'cinder-imp': '112:22',
          'rot-toad': '112:27',
          'gloom-hound': '112:32',
        },
      },
      receipt: projected.receipt,
      details: projected.details,
      battle,
    };
  }
}
