import { selectActorBySpeed } from './AutomaticBattleInitiativePolicy.js';
import {
  mergeAutomaticBattleEffect,
  normalizeAutomaticBattleEffects,
  resolveAutomaticEffectTurnStart,
} from './AutomaticBattleEffectPolicy.js';
import {
  normalizeAutomaticBattleResistances,
  resolveAutomaticBattleEffectResistance,
} from './AutomaticBattleResistancePolicy.js';

const PLAYER_TEAM = 'players';
const ENEMY_TEAM = 'enemies';
const TEAM_NAMES = Object.freeze([PLAYER_TEAM, ENEMY_TEAM]);

function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function requireNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}

function normalizeTeam(value, fallback = null) {
  const raw = String(value || fallback || '').trim().toLowerCase();
  if (['player', 'players', 'party', 'ally', 'allies'].includes(raw)) return PLAYER_TEAM;
  if (['enemy', 'enemies', 'foe', 'foes', 'opponent', 'opponents'].includes(raw)) return ENEMY_TEAM;
  if (fallback) return normalizeTeam(fallback);
  throw new Error('Automatic battle combatants require a players or enemies team.');
}

function normalizeMana(value, label, maxMana) {
  const mana = requireNonNegativeInteger(value, label);
  if (mana > maxMana) throw new Error(`${label} cannot exceed maxMana.`);
  return mana;
}

function normalizeCombatant(combatant, index, team) {
  if (!combatant || typeof combatant !== 'object') {
    throw new Error(`Combatant ${index + 1} is required.`);
  }

  const id = String(combatant.id || '').trim();
  if (!id) throw new Error(`Combatant ${index + 1} requires an id.`);

  const maxHp = requirePositiveInteger(combatant.maxHp, `${id} maxHp`);
  const hp = requireNonNegativeInteger(combatant.hp ?? maxHp, `${id} hp`);
  if (hp > maxHp) throw new Error(`${id} hp cannot exceed maxHp.`);

  const maxMana = requireNonNegativeInteger(combatant.maxMana ?? 100, `${id} maxMana`);
  const mana = normalizeMana(combatant.mana ?? 0, `${id} mana`, maxMana);
  const skills = Array.isArray(combatant.skills)
    ? combatant.skills.map((skill) => (skill && typeof skill === 'object' ? { ...skill } : skill))
    : [];

  return {
    ...combatant,
    id,
    team,
    hp,
    maxHp,
    mana,
    maxMana,
    skills,
    effects: [...normalizeAutomaticBattleEffects(combatant.effects || [])],
    resistances: { ...normalizeAutomaticBattleResistances(combatant.resistances || {}) },
  };
}

function cloneCombatant(combatant) {
  return {
    ...combatant,
    skills: Array.isArray(combatant.skills) ? combatant.skills.map((skill) => ({ ...skill })) : [],
    effects: Array.isArray(combatant.effects) ? combatant.effects.map((effect) => ({ ...effect })) : [],
    resistances: { ...(combatant.resistances || {}) },
  };
}

function cloneCombatants(combatants) {
  return combatants.map(cloneCombatant);
}

function cloneTurn(turn) {
  return {
    ...turn,
    metadata: turn?.metadata ? {
      ...turn.metadata,
      effectEvents: Array.isArray(turn.metadata.effectEvents)
        ? turn.metadata.effectEvents.map((event) => ({ ...event }))
        : turn.metadata.effectEvents,
      effectApplications: Array.isArray(turn.metadata.effectApplications)
        ? turn.metadata.effectApplications.map((application) => ({ ...application }))
        : turn.metadata.effectApplications,
      damageEvents: Array.isArray(turn.metadata.damageEvents)
        ? turn.metadata.damageEvents.map((event) => ({ ...event }))
        : turn.metadata.damageEvents,
      healingEvents: Array.isArray(turn.metadata.healingEvents)
        ? turn.metadata.healingEvents.map((event) => ({ ...event }))
        : turn.metadata.healingEvents,
      manaEvents: Array.isArray(turn.metadata.manaEvents)
        ? turn.metadata.manaEvents.map((event) => ({ ...event }))
        : turn.metadata.manaEvents,
    } : turn?.metadata ?? null,
  };
}

function cloneBattleEvent(event) {
  if (!event || typeof event !== 'object') return event;
  return {
    ...event,
    combatants: Array.isArray(event.combatants) ? cloneCombatants(event.combatants) : event.combatants,
    players: Array.isArray(event.players) ? cloneCombatants(event.players) : event.players,
    enemies: Array.isArray(event.enemies) ? cloneCombatants(event.enemies) : event.enemies,
    damageEvents: Array.isArray(event.damageEvents) ? event.damageEvents.map((item) => ({ ...item })) : event.damageEvents,
    healingEvents: Array.isArray(event.healingEvents) ? event.healingEvents.map((item) => ({ ...item })) : event.healingEvents,
  };
}

function normalizePriorTurns(priorTurns) {
  if (priorTurns == null) return [];
  if (!Array.isArray(priorTurns)) throw new Error('Automatic battle priorTurns must be an array.');
  return priorTurns.map((turn, index) => {
    if (!turn || typeof turn !== 'object') throw new Error(`Prior turn ${index + 1} must be an object.`);
    if (turn.turnNumber !== index + 1) {
      throw new Error('Automatic battle priorTurns must be contiguous from turn 1.');
    }
    return cloneTurn(turn);
  });
}

function clonePendingDecision(decision) {
  if (!decision) return null;
  return {
    ...decision,
    actions: Array.isArray(decision.actions) ? decision.actions.map((action) => ({ ...action })) : [],
  };
}

function normalizeStopSignal(signal) {
  if (!signal) return null;
  if (typeof signal !== 'object') {
    return { stopReason: String(signal), pendingDecision: null };
  }

  const stopReason = String(signal.reason || signal.stopReason || 'decision-point').trim();
  if (!stopReason) throw new Error('Automatic battle stop signal requires a reason.');
  return {
    stopReason,
    pendingDecision: clonePendingDecision(signal.pendingDecision || null),
  };
}

function defaultTargetSelector({ actor, combatants }) {
  return combatants.find((combatant) => combatant.hp > 0
    && combatant.id !== actor.id
    && (!actor.team || !combatant.team || combatant.team !== actor.team))?.id || null;
}

function livingCombatants(combatants) {
  return combatants.filter((combatant) => combatant.hp > 0);
}

function teamMembers(combatants, team) {
  return combatants.filter((combatant) => combatant.team === team);
}

function teamAlive(combatants, team) {
  return teamMembers(combatants, team).some((combatant) => combatant.hp > 0);
}

function firstId(combatants) {
  return combatants[0]?.id || null;
}

function battleOutcome(combatants, legacyMode) {
  const living = livingCombatants(combatants);
  if (legacyMode) {
    if (living.length > 1) return null;
    return {
      outcome: 'victory',
      winnerId: firstId(living),
      loserId: firstId(combatants.filter((combatant) => combatant.hp <= 0)),
      winnerIds: living.map((combatant) => combatant.id),
      loserIds: combatants.filter((combatant) => combatant.hp <= 0).map((combatant) => combatant.id),
      winnerTeam: null,
      loserTeam: null,
    };
  }

  const playersLiving = teamAlive(combatants, PLAYER_TEAM);
  const enemiesLiving = teamAlive(combatants, ENEMY_TEAM);
  if (playersLiving && enemiesLiving) return null;
  if (!playersLiving && !enemiesLiving) {
    return {
      outcome: 'draw',
      winnerId: null,
      loserId: null,
      winnerIds: [],
      loserIds: [],
      winnerTeam: null,
      loserTeam: null,
    };
  }

  const winnerTeam = playersLiving ? PLAYER_TEAM : ENEMY_TEAM;
  const loserTeam = playersLiving ? ENEMY_TEAM : PLAYER_TEAM;
  const winners = teamMembers(combatants, winnerTeam).filter((combatant) => combatant.hp > 0);
  const losers = teamMembers(combatants, loserTeam).filter((combatant) => combatant.hp <= 0);
  return {
    outcome: winnerTeam === PLAYER_TEAM ? 'victory' : 'defeat',
    winnerId: firstId(winners),
    loserId: firstId(losers),
    winnerIds: winners.map((combatant) => combatant.id),
    loserIds: losers.map((combatant) => combatant.id),
    winnerTeam,
    loserTeam,
  };
}

function finalizeResult({ combatants, turns, events, outcome, context, stopReason = null, pendingDecision = null, legacyMode }) {
  const resolution = outcome || battleOutcome(combatants, legacyMode);
  const players = teamMembers(combatants, PLAYER_TEAM);
  const enemies = teamMembers(combatants, ENEMY_TEAM);

  return {
    ...resolution,
    stopReason,
    pendingDecision: clonePendingDecision(pendingDecision),
    combatants: cloneCombatants(combatants),
    players: cloneCombatants(players),
    enemies: cloneCombatants(enemies),
    teams: {
      players: cloneCombatants(players),
      enemies: cloneCombatants(enemies),
    },
    turns: turns.map(cloneTurn),
    events: events.map(cloneBattleEvent),
    context,
  };
}

function applyTargetEffects(target, targetEffects = []) {
  if (targetEffects == null) return [];
  if (!Array.isArray(targetEffects)) throw new Error('Automatic battle targetEffects must be an array.');

  const applications = [];
  for (const incomingEffect of targetEffects) {
    const resolution = resolveAutomaticBattleEffectResistance({ target, effect: incomingEffect });
    if (resolution.applied) {
      target.effects = [...mergeAutomaticBattleEffect(target.effects, resolution.effect)];
    }
    applications.push({
      type: resolution.incomingEffect.type,
      resistanceLevel: resolution.resistanceLevel,
      applied: resolution.applied,
      blocked: resolution.blocked,
      incomingPotency: resolution.incomingEffect.potency,
      appliedPotency: resolution.effect?.potency ?? 0,
      potencyMultiplier: resolution.potencyMultiplier,
    });
  }
  return applications;
}

function normalizeBattleInput({ combatants, players, enemies } = {}) {
  const hasTeams = Array.isArray(players) || Array.isArray(enemies);
  if (hasTeams) {
    if (!Array.isArray(players) || !Array.isArray(enemies)) {
      throw new Error('Automatic battle requires both players and enemies arrays.');
    }
    if (players.length < 1 || players.length > 3 || enemies.length < 1 || enemies.length > 3) {
      throw new Error('Automatic battle supports 1 to 3 players and 1 to 3 enemies.');
    }
    return {
      legacyMode: false,
      combatants: [
        ...players.map((combatant, index) => normalizeCombatant(combatant, index, PLAYER_TEAM)),
        ...enemies.map((combatant, index) => normalizeCombatant(combatant, players.length + index, ENEMY_TEAM)),
      ],
    };
  }

  if (!Array.isArray(combatants) || combatants.length < 2 || combatants.length > 6) {
    throw new Error('Automatic battle requires 1 to 3 players and 1 to 3 enemies.');
  }

  const hasExplicitTeam = combatants.some((combatant) => combatant?.team || combatant?.side || combatant?.faction);
  if (hasExplicitTeam) {
    const normalized = combatants.map((combatant, index) => normalizeCombatant(combatant, index, normalizeTeam(combatant?.team || combatant?.side || combatant?.faction)));
    const playerCount = normalized.filter((combatant) => combatant.team === PLAYER_TEAM).length;
    const enemyCount = normalized.filter((combatant) => combatant.team === ENEMY_TEAM).length;
    if (playerCount < 1 || playerCount > 3 || enemyCount < 1 || enemyCount > 3) {
      throw new Error('Automatic battle supports 1 to 3 players and 1 to 3 enemies.');
    }
    return { legacyMode: false, combatants: normalized };
  }

  // The two-item shape is the compatibility contract for existing Hunt,
  // Adventure, Duel, and boss callers. The first combatant is still treated as
  // the player side for targeting, while preserving the historical "victory
  // for the surviving combatant" outcome semantics.
  if (combatants.length !== 2) {
    throw new Error('Automatic battle collections require explicit players and enemies arrays.');
  }
  return {
    legacyMode: true,
    combatants: combatants.map((combatant, index) => normalizeCombatant(combatant, index, index === 0 ? PLAYER_TEAM : ENEMY_TEAM)),
  };
}

function normalizeSkill(skill, index) {
  if (!skill || typeof skill !== 'object') return null;
  const id = String(skill.id || skill.skillId || skill.name || `skill-${index + 1}`).trim();
  const cost = requireNonNegativeInteger(skill.manaCost ?? skill.cost ?? 100, `${id} manaCost`);
  return { ...skill, id, manaCost: cost };
}

function readySkill(actor) {
  const skills = Array.isArray(actor.skills) ? actor.skills : [];
  return skills.map(normalizeSkill).find((skill) => skill && actor.mana >= skill.manaCost) || null;
}

function positiveDelta(value, label) {
  return requireNonNegativeInteger(value ?? 0, label);
}

function damageEntries(action, primaryTarget) {
  const entries = [{ targetId: primaryTarget.id, damage: positiveDelta(action.targetDamage ?? 0, 'Automatic battle targetDamage') }];
  const additional = action.targetDamages;
  if (Array.isArray(additional)) {
    for (const entry of additional) {
      if (!entry || typeof entry !== 'object') continue;
      const targetId = String(entry.targetId || entry.id || '').trim();
      if (!targetId || targetId === primaryTarget.id) continue;
      entries.push({ targetId, damage: positiveDelta(entry.damage ?? entry.targetDamage ?? 0, `Automatic battle damage for ${targetId}`) });
    }
  } else if (additional && typeof additional === 'object') {
    for (const [targetId, damage] of Object.entries(additional)) {
      if (targetId === primaryTarget.id) continue;
      entries.push({ targetId, damage: positiveDelta(damage, `Automatic battle damage for ${targetId}`) });
    }
  }
  return entries;
}

function healingEntries(action, actor) {
  const entries = [{ targetId: actor.id, healing: positiveDelta(action.selfHealing ?? 0, 'Automatic battle selfHealing') }];
  const additional = action.allyHealing || action.healing;
  if (Array.isArray(additional)) {
    for (const entry of additional) {
      if (!entry || typeof entry !== 'object') continue;
      const targetId = String(entry.targetId || entry.id || '').trim();
      if (!targetId || targetId === actor.id) continue;
      entries.push({ targetId, healing: positiveDelta(entry.healing ?? entry.amount ?? 0, `Automatic battle healing for ${targetId}`) });
    }
  } else if (additional && typeof additional === 'object') {
    for (const [targetId, healing] of Object.entries(additional)) {
      if (targetId === actor.id) continue;
      entries.push({ targetId, healing: positiveDelta(healing, `Automatic battle healing for ${targetId}`) });
    }
  }
  return entries;
}

function manaEntries(action, actor) {
  const additional = action.allyMana || action.manaRestore;
  if (!Array.isArray(additional)) return [];
  return additional.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const targetId = String(entry.targetId || entry.id || '').trim();
    if (!targetId || targetId === actor.id) return [];
    return [{ targetId, amount: positiveDelta(entry.amount ?? entry.mana ?? 0, `Automatic battle Mana restore for ${targetId}`) }];
  });
}

/**
 * Activity-agnostic automatic battle loop.
 *
 * The simulator owns authoritative battle lifecycle state: HP and Mana
 * mutation, deterministic Speed initiative, dead-target retargeting, skill
 * thresholds, terminal team resolution, turn history, event projections,
 * constrained periodic effect ticks, resistance-aware effect application, and
 * optional sparse phase pausing. Stat formulas, RNG, effect vocabulary,
 * initiative frequency, skill formulas, and boss decision triggers remain
 * domain policies so Hunt, Adventure, Duel, and party-vs-party battles reuse
 * one lifecycle.
 */
export class AutomaticBattleSimulator {
  constructor({
    resolveAction,
    resolveSkill = null,
    selectActor = selectActorBySpeed,
    selectTarget = defaultTargetSelector,
    shouldStop = null,
    maxTurns = 200,
  } = {}) {
    if (typeof resolveAction !== 'function') {
      throw new Error('AutomaticBattleSimulator requires a resolveAction domain policy.');
    }
    if (resolveSkill !== null && typeof resolveSkill !== 'function') throw new Error('resolveSkill must be a function when provided.');
    if (typeof selectActor !== 'function') throw new Error('selectActor must be a function.');
    if (typeof selectTarget !== 'function') throw new Error('selectTarget must be a function.');
    if (shouldStop !== null && typeof shouldStop !== 'function') throw new Error('shouldStop must be a function when provided.');

    this.resolveAction = resolveAction;
    this.resolveSkill = resolveSkill;
    this.selectActor = selectActor;
    this.selectTarget = selectTarget;
    this.shouldStop = shouldStop;
    this.maxTurns = requirePositiveInteger(maxTurns, 'maxTurns');
  }

  simulate({ combatants, players, enemies, context = null, priorTurns = [] } = {}) {
    const input = normalizeBattleInput({ combatants, players, enemies });
    const state = input.combatants;
    if (new Set(state.map((combatant) => combatant.id)).size !== state.length) {
      throw new Error('Automatic battle combatant ids must be unique.');
    }

    const turns = normalizePriorTurns(priorTurns);
    const events = [];
    const appendEvent = (type, payload = {}, { snapshot = false } = {}) => {
      const event = {
        type,
        ...payload,
      };
      if (snapshot) {
        event.combatants = cloneCombatants(state);
        event.players = cloneCombatants(teamMembers(state, PLAYER_TEAM));
        event.enemies = cloneCombatants(teamMembers(state, ENEMY_TEAM));
      }
      events.push(event);
    };

    appendEvent('BattleStarted', {
      turnNumber: turns.length,
      resumed: turns.length > 0,
      context,
    }, { snapshot: true });

    const terminal = battleOutcome(state, input.legacyMode);
    if (terminal) {
      appendEvent('BattleCompleted', { ...terminal, turnNumber: turns.length }, { snapshot: true });
      return finalizeResult({ combatants: state, turns, events, outcome: terminal, context, legacyMode: input.legacyMode });
    }

    for (let turnNumber = turns.length + 1; turnNumber <= this.maxTurns; turnNumber += 1) {
      const beforeTurn = battleOutcome(state, input.legacyMode);
      if (beforeTurn) {
        appendEvent('BattleCompleted', { ...beforeTurn, turnNumber: turnNumber - 1 }, { snapshot: true });
        return finalizeResult({ combatants: state, turns, events, outcome: beforeTurn, context, legacyMode: input.legacyMode });
      }

      const actorId = this.selectActor({
        turnNumber,
        combatants: cloneCombatants(state),
        players: cloneCombatants(teamMembers(state, PLAYER_TEAM)),
        enemies: cloneCombatants(teamMembers(state, ENEMY_TEAM)),
        turns: turns.map(cloneTurn),
        context,
      });
      const actor = state.find((combatant) => combatant.id === actorId && combatant.hp > 0);
      if (!actor) throw new Error(`Turn ${turnNumber} selected an invalid or defeated actor.`);

      const actorHpBefore = actor.hp;
      const actorManaBefore = actor.mana;
      const effectStart = resolveAutomaticEffectTurnStart(actor);
      actor.hp = Math.max(0, actor.hp - effectStart.periodicDamage);
      actor.effects = [...effectStart.remainingEffects];
      appendEvent('TurnStarted', {
        turnNumber,
        actorId: actor.id,
        actorHpBefore,
        actorManaBefore,
        effectDamage: effectStart.periodicDamage,
        effectEvents: effectStart.events.map((event) => ({ ...event })),
      });

      if (effectStart.periodicDamage > 0 || effectStart.events.length > 0) {
        appendEvent('EffectTickResolved', {
          turnNumber,
          actorId: actor.id,
          damage: effectStart.periodicDamage,
          actorHpBefore,
          actorHpAfter: actor.hp,
          effectEvents: effectStart.events.map((event) => ({ ...event })),
        });
      }

      if (actor.hp <= 0) {
        const effectTurn = {
          turnNumber,
          actorId: actor.id,
          targetId: null,
          targetDamage: 0,
          selfHealing: 0,
          effectDamage: effectStart.periodicDamage,
          actorHpBefore,
          actorHpAfterEffects: actor.hp,
          actorHpAfter: actor.hp,
          actorManaBefore,
          actorManaAfter: actor.mana,
          targetHpBefore: null,
          targetHpAfter: null,
          metadata: {
            kind: 'effect-tick',
            effectEvents: effectStart.events.map((event) => ({ ...event })),
            effectApplications: [],
            damageEvents: [],
            healingEvents: [],
            manaEvents: [],
          },
        };
        turns.push(effectTurn);
        appendEvent('CombatantDefeated', {
          turnNumber,
          combatantId: actor.id,
          cause: 'effect',
        });
        const effectOutcome = battleOutcome(state, input.legacyMode);
        appendEvent('BattleCompleted', { ...effectOutcome, turnNumber }, { snapshot: true });
        return finalizeResult({ combatants: state, turns, events, outcome: effectOutcome, context, legacyMode: input.legacyMode });
      }

      let targetId = this.selectTarget({
        turnNumber,
        actor: cloneCombatant(actor),
        combatants: cloneCombatants(state),
        players: cloneCombatants(teamMembers(state, PLAYER_TEAM)),
        enemies: cloneCombatants(teamMembers(state, ENEMY_TEAM)),
        turns: turns.map(cloneTurn),
        context,
      });
      let target = state.find((combatant) => combatant.id === targetId
        && combatant.id !== actor.id
        && combatant.hp > 0
        && (!actor.team || !combatant.team || combatant.team !== actor.team));
      if (!target) {
        const requestedTargetId = targetId;
        targetId = defaultTargetSelector({ actor, combatants: state });
        target = state.find((combatant) => combatant.id === targetId && combatant.hp > 0);
        if (requestedTargetId && requestedTargetId !== targetId) {
          appendEvent('TargetRetargeted', {
            turnNumber,
            actorId: actor.id,
            requestedTargetId,
            targetId,
            reason: 'invalid-or-defeated-target',
          });
        }
      }
      if (!target) throw new Error(`Turn ${turnNumber} selected an invalid or defeated target.`);

      appendEvent('TargetSelected', {
        turnNumber,
        actorId: actor.id,
        targetId: target.id,
      });

      const skill = readySkill(actor);
      const actionType = skill ? 'skill' : 'basic-attack';
      if (skill) {
        appendEvent('SkillCastStarted', {
          turnNumber,
          actorId: actor.id,
          targetId: target.id,
          skillId: skill.id,
          skillName: String(skill.name || skill.label || skill.id),
          manaCost: skill.manaCost,
        });
      } else {
        appendEvent('BasicAttackStarted', {
          turnNumber,
          actorId: actor.id,
          targetId: target.id,
        });
      }

      const resolver = skill && this.resolveSkill ? this.resolveSkill : this.resolveAction;
      const action = resolver({
        turnNumber,
        actionType,
        skill: skill ? { ...skill } : null,
        actor: cloneCombatant(actor),
        target: cloneCombatant(target),
        combatants: cloneCombatants(state),
        players: cloneCombatants(teamMembers(state, PLAYER_TEAM)),
        enemies: cloneCombatants(teamMembers(state, ENEMY_TEAM)),
        turns: turns.map(cloneTurn),
        context,
      });
      if (!action || typeof action !== 'object') throw new Error(`Turn ${turnNumber} action policy must return an object.`);

      const targetHpBefore = target.hp;
      const actorHpAfterEffects = actor.hp;
      const actionManaCost = positiveDelta(action.manaCost ?? (skill ? skill.manaCost : 0), `Turn ${turnNumber} manaCost`);
      const defaultManaGain = skill ? 0 : positiveDelta(actor.manaGain ?? actor.manaPerAttack ?? 12, `${actor.id} manaGain`);
      const actionManaGain = positiveDelta(action.manaGain ?? defaultManaGain, `Turn ${turnNumber} manaGain`);
      if (actionManaCost > actor.mana) throw new Error(`Turn ${turnNumber} cannot spend more Mana than the actor has.`);
      actor.mana = Math.min(actor.maxMana, actor.mana - actionManaCost + actionManaGain);

      const damageEvents = [];
      for (const entry of damageEntries(action, target)) {
        const damagedTarget = state.find((combatant) => combatant.id === entry.targetId
          && combatant.hp > 0
          && combatant.id !== actor.id
          && (!actor.team || !combatant.team || combatant.team !== actor.team));
        if (!damagedTarget || entry.damage <= 0) continue;
        const hpBefore = damagedTarget.hp;
        damagedTarget.hp = Math.max(0, damagedTarget.hp - entry.damage);
        const damageEvent = {
          actorId: actor.id,
          targetId: damagedTarget.id,
          damage: entry.damage,
          targetHpBefore: hpBefore,
          targetHpAfter: damagedTarget.hp,
          critical: Boolean(action.metadata?.critical),
        };
        damageEvents.push(damageEvent);
        appendEvent('DamageDealt', { turnNumber, ...damageEvent });
        if (damagedTarget.hp <= 0) {
          appendEvent('CombatantDefeated', {
            turnNumber,
            combatantId: damagedTarget.id,
            cause: actionType,
          });
        }
      }

      const healingEvents = [];
      for (const entry of healingEntries(action, actor)) {
        const healed = state.find((combatant) => combatant.id === entry.targetId
          && combatant.hp > 0
          && combatant.team === actor.team);
        if (!healed || entry.healing <= 0) continue;
        const hpBefore = healed.hp;
        healed.hp = Math.min(healed.maxHp, healed.hp + entry.healing);
        const actualHealing = healed.hp - hpBefore;
        if (actualHealing <= 0) continue;
        const healingEvent = {
          actorId: actor.id,
          targetId: healed.id,
          healing: actualHealing,
          targetHpBefore: hpBefore,
          targetHpAfter: healed.hp,
        };
        healingEvents.push(healingEvent);
        appendEvent('HealingApplied', { turnNumber, ...healingEvent });
      }

      const manaEvents = [{
        combatantId: actor.id,
        manaBefore: actorManaBefore,
        manaAfter: actor.mana,
        delta: actor.mana - actorManaBefore,
        reason: actionManaCost > 0 ? 'skill-cast' : 'basic-attack',
      }];
      for (const entry of manaEntries(action, actor)) {
        const recipient = state.find((combatant) => combatant.id === entry.targetId
          && combatant.hp > 0
          && combatant.team === actor.team);
        if (!recipient || entry.amount <= 0) continue;
        const manaBefore = recipient.mana;
        recipient.mana = Math.min(recipient.maxMana, recipient.mana + entry.amount);
        const actualGain = recipient.mana - manaBefore;
        if (actualGain <= 0) continue;
        const manaEvent = {
          combatantId: recipient.id,
          manaBefore,
          manaAfter: recipient.mana,
          delta: actualGain,
          reason: 'skill-effect',
        };
        manaEvents.push(manaEvent);
        appendEvent('ManaChanged', { turnNumber, ...manaEvent });
      }

      const effectApplications = applyTargetEffects(target, action.targetEffects ?? []);
      const turn = {
        turnNumber,
        actorId: actor.id,
        targetId: target.id,
        targetDamage: damageEvents.find((event) => event.targetId === target.id)?.damage || 0,
        selfHealing: healingEvents.find((event) => event.targetId === actor.id)?.healing || 0,
        effectDamage: effectStart.periodicDamage,
        actorHpBefore,
        actorHpAfterEffects,
        actorHpAfter: actor.hp,
        actorManaBefore,
        actorManaAfter: actor.mana,
        targetHpBefore,
        targetHpAfter: state.find((combatant) => combatant.id === target.id)?.hp ?? target.hp,
        metadata: {
          ...(action.metadata ?? {}),
          kind: actionType === 'skill' ? 'skill' : action.metadata?.kind || 'basic-attack',
          actionType,
          skillId: skill?.id || action.skillId || null,
          manaCost: actionManaCost,
          manaGain: actionManaGain,
          manaBefore: actorManaBefore,
          manaAfter: actor.mana,
          effectEvents: effectStart.events.map((event) => ({ ...event })),
          effectApplications,
          damageEvents: damageEvents.map((event) => ({ ...event })),
          healingEvents: healingEvents.map((event) => ({ ...event })),
          manaEvents: manaEvents.map((event) => ({ ...event })),
        },
      };
      turns.push(turn);

      if (actionManaCost > 0) {
        appendEvent('ManaChanged', {
          turnNumber,
          combatantId: actor.id,
          manaBefore: actorManaBefore,
          manaAfter: actor.mana,
          delta: actor.mana - actorManaBefore,
          reason: 'skill-cast',
        });
      } else if (actionManaGain > 0) {
        appendEvent('ManaChanged', {
          turnNumber,
          combatantId: actor.id,
          manaBefore: actorManaBefore,
          manaAfter: actor.mana,
          delta: actor.mana - actorManaBefore,
          reason: 'basic-attack',
        });
      }
      if (skill) {
        appendEvent('SkillCast', {
          turnNumber,
          actorId: actor.id,
          targetId: target.id,
          skillId: skill.id,
          skillName: String(skill.name || skill.label || skill.id),
          manaBefore: actorManaBefore,
          manaAfter: actor.mana,
        });
      } else {
        const firstSkill = normalizeSkill(actor.skills?.[0], 0);
        if (firstSkill && actor.mana >= firstSkill.manaCost && actorManaBefore < firstSkill.manaCost) {
          appendEvent('SkillReady', {
            turnNumber,
            combatantId: actor.id,
            skillId: firstSkill.id,
            mana: actor.mana,
          });
        }
      }
      appendEvent('TurnResolved', {
        turnNumber,
        actorId: actor.id,
        targetId: target.id,
        actionType,
        skillId: skill?.id || action.skillId || null,
        damageEvents,
        healingEvents,
      }, { snapshot: true });

      const afterAction = battleOutcome(state, input.legacyMode);
      if (afterAction) {
        appendEvent('BattleCompleted', { ...afterAction, turnNumber }, { snapshot: true });
        return finalizeResult({ combatants: state, turns, events, outcome: afterAction, context, legacyMode: input.legacyMode });
      }

      if (this.shouldStop) {
        const stopSignal = normalizeStopSignal(this.shouldStop({
          turnNumber,
          combatants: cloneCombatants(state),
          players: cloneCombatants(teamMembers(state, PLAYER_TEAM)),
          enemies: cloneCombatants(teamMembers(state, ENEMY_TEAM)),
          turns: turns.map(cloneTurn),
          lastTurn: cloneTurn(turn),
          context,
        }));
        if (stopSignal) {
          appendEvent('BattlePaused', {
            turnNumber,
            stopReason: stopSignal.stopReason,
            pendingDecision: clonePendingDecision(stopSignal.pendingDecision),
          });
          return finalizeResult({
            combatants: state,
            turns,
            events,
            outcome: { outcome: 'paused', winnerId: null, loserId: null, winnerIds: [], loserIds: [], winnerTeam: null, loserTeam: null },
            context,
            stopReason: stopSignal.stopReason,
            pendingDecision: stopSignal.pendingDecision,
            legacyMode: input.legacyMode,
          });
        }
      }
    }

    const draw = { outcome: 'draw', winnerId: null, loserId: null, winnerIds: [], loserIds: [], winnerTeam: null, loserTeam: null };
    appendEvent('BattleCompleted', { ...draw, turnNumber: this.maxTurns, stopReason: 'max-turns' }, { snapshot: true });
    return finalizeResult({ combatants: state, turns, events, outcome: draw, context, stopReason: 'max-turns', legacyMode: input.legacyMode });
  }
}

export function simulateAutomaticBattle(options, battle) {
  return new AutomaticBattleSimulator(options).simulate(battle);
}

export const AUTOMATIC_BATTLE_TEAMS = Object.freeze({
  players: PLAYER_TEAM,
  enemies: ENEMY_TEAM,
  names: TEAM_NAMES,
});
