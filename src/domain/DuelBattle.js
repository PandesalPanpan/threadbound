import { simulateArenaCombat } from './ArenaCombatEngine.js';
import { prepareAutomaticBattleCombatant } from './AutomaticBattleSkillCatalog.js';
import { BATTLE_FIGMA_VISUAL_ASSET_IDS, resolveVisualAssetId } from '../content/VisualAssetCatalog.js';

function combatant(value, label) {
  if (!value || typeof value !== 'object') throw new Error(`Duel requires ${label}.`);
  const id = String(value.id || '').trim();
  const name = String(value.displayName || value.name || '').trim();
  if (!id) throw new Error(`Duel ${label} requires an id.`);
  if (!name) throw new Error(`Duel ${label} requires a name.`);
  const stats = value.stats || value;
  const maxHp = Math.max(1, Math.floor(Number(stats.maxHp || value.maxHp || 0)));
  if (!Number.isFinite(maxHp) || maxHp < 1) throw new Error(`Duel ${label} requires positive Max HP.`);
  // A weapon family's allowlisted signature skill takes precedence. Unarmed
  // Guild Hall rivals share the same fallback as a new unarmed player so the
  // starter duel remains a fair stat check rather than an arbitrary enemy-only
  // skill advantage.
  const defaultSkill = 'threadsong';
  const family = value.weaponFamily
    || value.equipment?.weapon?.weaponFamily
    || value.equipment?.weapon?.family
    || value.equippedItem?.weaponFamily
    || value.equippedItem?.family;
  const visualAssetId = value.visualAssetId
    || resolveVisualAssetId({ id, spriteVariant: value.spriteVariant }, 'character')
    || (label === 'challenger' ? BATTLE_FIGMA_VISUAL_ASSET_IDS['rune-bard'] : BATTLE_FIGMA_VISUAL_ASSET_IDS['bramble-druid']);
  return prepareAutomaticBattleCombatant({
    id,
    name,
    displayName: name,
    hp: maxHp,
    maxHp,
    attack: Math.max(1, Math.floor(Number(stats.attack || value.attack || 1))),
    defense: Math.max(0, Math.floor(Number(stats.defense || value.defense || 0))),
    speed: Math.max(1, Math.floor(Number(stats.speed || value.speed || 1))),
    critChance: Math.max(0, Math.min(1, Number(stats.critChance || value.critChance || 0))),
    equipment: value.equipment || {},
    equippedItem: value.equippedItem || value.equipment?.weapon || null,
    weaponFamily: family || null,
    skillCode: value.skillCode || value.signatureSkillId || null,
    skills: value.skills || [],
    visualAssetId,
    resistances: value.resistances || {},
    tags: ['adventurer', label],
  }, { defaultSkill });
}

/**
 * Canonical Duel battle policy.
 *
 * Duel is a stat-check activity: both adventurers enter at full projected HP,
 * the shared automatic battle engine owns all turns, Speed, Crit, equipment
 * effects and resistance handling, and the battle does not mutate either
 * combatant's normal Hunt/Adventure health or economy state.
 */
export function resolveDuelBattle({ challenger, opponent, duelId = null, random = Math.random } = {}) {
  const left = combatant(challenger, 'challenger');
  const right = combatant(opponent, 'opponent');
  if (left.id === right.id) {
    const error = new Error('You cannot Duel yourself.');
    error.code = 'duel_self_target';
    throw error;
  }

  const battle = simulateArenaCombat({
    players: [left],
    enemies: [right],
    context: { activity: 'duel', battleId: duelId || null, challengerId: left.id, opponentId: right.id },
  });

  const outcome = battle.outcome === 'draw'
    ? 'draw'
    : battle.winnerId === left.id
      ? 'win'
      : 'loss';

  return Object.freeze({
    outcome,
    challengerId: left.id,
    opponentId: right.id,
    winnerId: battle.winnerId || null,
    loserId: battle.loserId || null,
    battle,
  });
}
