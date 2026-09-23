function requireBattleResult(result) {
  if (!result || typeof result !== 'object') throw new Error('Automatic battle read model requires a battle result.');
  if (!Array.isArray(result.combatants)) throw new Error('Automatic battle result requires combatants.');
  if (!Array.isArray(result.turns)) throw new Error('Automatic battle result requires turns.');
  return result;
}

function combatantLabel(combatant) {
  return String(combatant?.displayName || combatant?.name || combatant?.label || combatant?.id || 'Unknown');
}

function combatantById(result, id) {
  return result.combatants.find((combatant) => combatant.id === id) || null;
}

function inferInitialHp(result, combatant) {
  for (const turn of result.turns) {
    if (turn.actorId === combatant.id && Number.isFinite(Number(turn.actorHpBefore))) {
      return Number(turn.actorHpBefore);
    }
    if (turn.targetId === combatant.id && Number.isFinite(Number(turn.targetHpBefore))) {
      return Number(turn.targetHpBefore);
    }
  }
  return Number(combatant.hp);
}

function inferInitialMana(result, combatant) {
  const started = result.events?.find((event) => event.type === 'BattleStarted');
  const startedCombatant = started?.combatants?.find((entry) => entry.id === combatant.id);
  if (Number.isFinite(Number(startedCombatant?.mana))) return Number(startedCombatant.mana);
  for (const turn of result.turns) {
    if (turn.actorId === combatant.id && Number.isFinite(Number(turn.actorManaBefore))) {
      return Number(turn.actorManaBefore);
    }
  }
  return Number(combatant.mana ?? 0);
}

function hpProjection(result, combatant) {
  const initialHp = inferInitialHp(result, combatant);
  return Object.freeze({
    id: combatant.id,
    label: combatantLabel(combatant),
    initialHp,
    finalHp: Number(combatant.hp),
    maxHp: Number(combatant.maxHp),
    delta: Number(combatant.hp) - initialHp,
  });
}

function resourceProjection(result, combatant) {
  const initialMana = inferInitialMana(result, combatant);
  const finalMana = Number(combatant.mana ?? initialMana);
  return Object.freeze({
    id: combatant.id,
    label: combatantLabel(combatant),
    initialMana,
    finalMana,
    maxMana: Number(combatant.maxMana ?? 100),
    delta: finalMana - initialMana,
  });
}

function publicItemProjection(item) {
  if (!item || typeof item !== 'object') return null;
  return Object.freeze({
    id: item.id || null,
    name: item.name || null,
    slot: item.slot || null,
    rarity: item.rarity || 'common',
    visualAssetId: item.visualAssetId || null,
    attackBonus: Number(item.attackBonus || item.stats?.attackBonus || 0),
    defenseBonus: Number(item.defenseBonus || item.stats?.defenseBonus || 0),
    maxHpBonus: Number(item.maxHpBonus || item.stats?.maxHpBonus || 0),
    speedBonus: Number(item.speedBonus || item.stats?.speedBonus || 0),
    critChanceBonus: Number(item.critChanceBonus || item.stats?.critChanceBonus || 0),
  });
}

function combatantReplayProjection(result, combatant) {
  const skill = combatant.skills?.[0] || null;
  const equipment = combatant.equipment && typeof combatant.equipment === 'object'
    ? Object.fromEntries(Object.entries(combatant.equipment).map(([slot, item]) => [slot, publicItemProjection(item)]))
    : {};
  return Object.freeze({
    id: combatant.id,
    label: combatantLabel(combatant),
    team: combatant.team || null,
    visualAssetId: combatant.visualAssetId || null,
    hp: Object.freeze({ initial: inferInitialHp(result, combatant), final: Number(combatant.hp), max: Number(combatant.maxHp) }),
    mana: Object.freeze({ initial: inferInitialMana(result, combatant), final: Number(combatant.mana ?? 0), max: Number(combatant.maxMana ?? 100) }),
    stats: Object.freeze({
      attack: Number(combatant.attack || 0),
      defense: Number(combatant.defense || 0),
      speed: Number(combatant.speed || 0),
      critChance: Number(combatant.critChance || 0),
    }),
    signatureSkill: skill ? Object.freeze({
      id: String(skill.id || skill.skillId || ''),
      name: String(skill.name || skill.label || skill.id || 'Signature Skill'),
      description: String(skill.description || ''),
      manaCost: Number(skill.manaCost || 0),
    }) : null,
    equipment: Object.freeze(equipment),
    effects: Object.freeze((combatant.effects || []).map((effect) => Object.freeze({ ...effect }))),
  });
}

function projectPendingDecision(result) {
  const decision = result.pendingDecision;
  if (!decision) return null;
  const id = String(decision.id || '').trim();
  const scope = String(decision.scope || '').trim();
  const prompt = String(decision.prompt || '').trim();
  if (!id || !scope || !prompt || !Array.isArray(decision.actions) || decision.actions.length === 0) {
    throw new Error('Automatic battle pending decision is incomplete.');
  }

  return Object.freeze({
    id,
    scope,
    prompt,
    actions: Object.freeze(decision.actions.map((action) => Object.freeze({
      id: String(action?.id || '').trim(),
      label: String(action?.label || '').trim(),
    }))),
  });
}

function outcomeLabel(result, viewerId) {
  if (result.outcome === 'paused') return 'Paused';
  if (result.outcome === 'draw') return 'Draw';
  if (result.outcome !== 'victory') return String(result.outcome || 'Battle').replace(/^./, (character) => character.toUpperCase());
  if (!viewerId) return 'Victory';
  if (result.winnerId === viewerId) return 'Victory';
  if (result.loserId === viewerId) return 'Defeat';
  return 'Victory';
}

function headlineFor(result, viewerId, pendingDecision = null) {
  const winner = combatantById(result, result.winnerId);
  const loser = combatantById(result, result.loserId);
  const label = outcomeLabel(result, viewerId);

  if (result.outcome === 'victory' && winner && loser) {
    if (viewerId === result.winnerId) return `${label} · Defeated ${combatantLabel(loser)}`;
    if (viewerId === result.loserId) return `${label} · Defeated by ${combatantLabel(winner)}`;
    return `${label} · ${combatantLabel(winner)} defeated ${combatantLabel(loser)}`;
  }
  if (result.outcome === 'paused') {
    return `${label} · ${pendingDecision?.prompt || String(result.stopReason || 'Decision point')}`;
  }
  if (result.outcome === 'draw') return `${label} · ${result.turns.length} turns`;
  return label;
}

function mainReceiptText(result, viewerId, hp, pendingDecision = null) {
  const headline = headlineFor(result, viewerId, pendingDecision);
  const viewer = viewerId ? hp.find((entry) => entry.id === viewerId) : null;
  const hpText = viewer
    ? ` · HP ${viewer.initialHp} → ${viewer.finalHp}/${viewer.maxHp}`
    : '';
  return `${headline}${hpText} · ${result.turns.length} turn${result.turns.length === 1 ? '' : 's'}`;
}

function effectEvents(metadata = {}, result = null) {
  const events = [];
  for (const event of metadata.effectEvents || []) {
    if (event.damage > 0) {
      events.push(Object.freeze({
        kind: 'effect-damage',
        effect: event.type,
        damage: Number(event.damage),
        stacks: event.stacks == null ? null : Number(event.stacks),
      }));
    }
    if (event.expired) {
      events.push(Object.freeze({ kind: 'effect-expired', effect: event.type }));
    }
  }
  for (const application of metadata.effectApplications || []) {
    events.push(Object.freeze({
      kind: application.blocked ? 'effect-blocked' : 'effect-applied',
      effect: application.type,
      ...(application.targetId ? {
        targetId: application.targetId,
        targetLabel: combatantLabel(combatantById(result, application.targetId)),
      } : {}),
      resistanceLevel: application.resistanceLevel,
      incomingPotency: Number(application.incomingPotency || 0),
      appliedPotency: Number(application.appliedPotency || 0),
      blocked: Boolean(application.blocked),
    }));
  }
  return events;
}

function turnSummary({ turn, actorLabel, targetLabel, consecutiveAction, events }) {
  const pieces = [];
  if (consecutiveAction) pieces.push(`${actorLabel} gained an extra action from Speed.`);

  if (turn.effectDamage > 0) pieces.push(`${actorLabel} took ${turn.effectDamage} effect damage.`);

  if (turn.targetId && turn.targetDamage > 0) {
    const critical = Boolean(turn.metadata?.critical);
    const action = turn.metadata?.actionType === 'skill'
      ? ` cast ${String(turn.metadata.skillName || turn.metadata.skillId || 'a skill')} on`
      : `${critical ? ' critically' : ''} hit`;
    pieces.push(`${actorLabel}${action} ${targetLabel} for ${turn.targetDamage} damage.`);
  } else if (turn.targetId && turn.targetDamage === 0) {
    pieces.push(`${actorLabel} acted against ${targetLabel}.`);
  }

  if (turn.selfHealing > 0) pieces.push(`${actorLabel} healed ${turn.selfHealing} HP.`);
  if (turn.selfDamage > 0) pieces.push(`${actorLabel} spent ${turn.selfDamage} HP.`);
  if (turn.actorManaBefore != null && turn.actorManaAfter != null && turn.actorManaBefore !== turn.actorManaAfter) {
    const delta = Number(turn.actorManaAfter) - Number(turn.actorManaBefore);
    pieces.push(`${delta >= 0 ? '+' : ''}${delta} Mana.`);
  }
  if (!turn.targetId && turn.effectDamage > 0 && turn.actorHpAfter <= 0) pieces.push(`${actorLabel} was defeated by an effect.`);

  for (const event of events) {
    const recipient = event.targetLabel || targetLabel || actorLabel;
    if (event.kind === 'effect-applied') pieces.push(`${recipient} received ${event.effect}.`);
    if (event.kind === 'effect-blocked') pieces.push(`${recipient} resisted ${event.effect} (${event.resistanceLevel}).`);
  }

  return pieces.join(' ') || `${actorLabel} completed a turn.`;
}

function projectTurn(result, turn, previousTurn) {
  const actor = combatantById(result, turn.actorId);
  const target = turn.targetId ? combatantById(result, turn.targetId) : null;
  const actorLabel = combatantLabel(actor || { id: turn.actorId });
  const targetLabel = target ? combatantLabel(target) : null;
  const consecutiveAction = Boolean(previousTurn && previousTurn.actorId === turn.actorId);
  const events = effectEvents(turn.metadata, result);

  return Object.freeze({
    turnNumber: Number(turn.turnNumber),
    actor: Object.freeze({ id: turn.actorId, label: actorLabel }),
    target: target ? Object.freeze({ id: turn.targetId, label: targetLabel }) : null,
    consecutiveAction,
    critical: Boolean(turn.metadata?.critical),
    damage: Number(turn.targetDamage || 0),
    healing: Number(turn.selfHealing || 0),
    selfDamage: Number(turn.selfDamage || 0),
    lifestealHealing: Number(turn.lifestealHealing || 0),
    effectDamage: Number(turn.effectDamage || 0),
    damageEvents: Object.freeze((turn.metadata?.damageEvents || []).map((event) => Object.freeze({ ...event }))),
    healingEvents: Object.freeze((turn.metadata?.healingEvents || []).map((event) => Object.freeze({ ...event }))),
    manaEvents: Object.freeze((turn.metadata?.manaEvents || []).map((event) => Object.freeze({ ...event }))),
    effectEvents: Object.freeze(effectEvents(turn.metadata, result)),
    actionType: turn.metadata?.actionType || null,
    skillId: turn.metadata?.skillId || null,
    skillName: turn.metadata?.skillName || null,
    actorMana: Object.freeze({
      before: Number(turn.actorManaBefore ?? turn.metadata?.manaBefore ?? 0),
      after: Number(turn.actorManaAfter ?? turn.metadata?.manaAfter ?? turn.actorManaBefore ?? 0),
    }),
    actorHp: Object.freeze({
      before: Number(turn.actorHpBefore),
      afterEffects: Number(turn.actorHpAfterEffects ?? turn.actorHpBefore),
      after: Number(turn.actorHpAfter),
    }),
    targetHp: target ? Object.freeze({ before: Number(turn.targetHpBefore), after: Number(turn.targetHpAfter) }) : null,
    events: Object.freeze(events),
    summary: turnSummary({ turn, actorLabel, targetLabel, consecutiveAction, events }),
  });
}

/**
 * Presentation/read-model projection for authoritative automatic battle results.
 * It never reruns combat formulas. The concise receipt is suitable for the
 * Adventure Stream; detailed turns and sparse boss decisions are projected from
 * authoritative battle output rather than becoming browser-owned game rules.
 */
export function projectAutomaticBattleResult(result, { viewerId = null } = {}) {
  requireBattleResult(result);
  const hp = Object.freeze(result.combatants.map((combatant) => hpProjection(result, combatant)));
  const mana = Object.freeze(result.combatants.map((combatant) => resourceProjection(result, combatant)));
  const turns = Object.freeze(result.turns.map((turn, index) => projectTurn(result, turn, result.turns[index - 1] || null)));
  const pendingDecision = projectPendingDecision(result);
  const events = Object.freeze((result.events || []).map((event) => Object.freeze({
    type: String(event.type || ''),
    turnNumber: event.turnNumber == null ? null : Number(event.turnNumber),
    actorId: event.actorId || event.combatantId || null,
    targetId: event.targetId || null,
    skillId: event.skillId || null,
    skillName: event.skillName || null,
    damage: event.damage == null ? null : Number(event.damage),
    healing: event.healing == null ? null : Number(event.healing),
    manaBefore: event.manaBefore == null ? null : Number(event.manaBefore),
    manaAfter: event.manaAfter == null ? null : Number(event.manaAfter),
  })));
  const receipt = Object.freeze({
    kind: 'automatic-battle-result',
    outcome: result.outcome,
    outcomeLabel: outcomeLabel(result, viewerId),
    headline: headlineFor(result, viewerId, pendingDecision),
    text: mainReceiptText(result, viewerId, hp, pendingDecision),
    winnerId: result.winnerId || null,
    loserId: result.loserId || null,
    turnCount: turns.length,
    hp,
    mana,
    pendingDecision,
    detailsAvailable: turns.length > 0,
  });

  return Object.freeze({
    receipt,
    details: Object.freeze({
      outcome: result.outcome,
      stopReason: result.stopReason || null,
      pendingDecision,
      turnCount: turns.length,
      turns,
      events,
      teams: Object.freeze({
        players: Object.freeze((result.players || result.teams?.players || result.combatants.filter((combatant) => combatant.team === 'players')).map((combatant) => Object.freeze({ id: combatant.id, label: combatantLabel(combatant) }))),
        enemies: Object.freeze((result.enemies || result.teams?.enemies || result.combatants.filter((combatant) => combatant.team === 'enemies')).map((combatant) => Object.freeze({ id: combatant.id, label: combatantLabel(combatant) }))),
      }),
      combatants: Object.freeze(result.combatants.map((combatant) => combatantReplayProjection(result, combatant))),
    }),
  });
}
