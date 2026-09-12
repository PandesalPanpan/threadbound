export const AUTOMATIC_BATTLE_DECISION_ACTIONS = Object.freeze({
  continue: Object.freeze({ id: 'continue', label: 'Continue' }),
  heal: Object.freeze({ id: 'heal', label: 'Heal' }),
  'use-item': Object.freeze({ id: 'use-item', label: 'Use Item' }),
  coordinate: Object.freeze({ id: 'coordinate', label: 'Coordinate' }),
});

export const AUTOMATIC_BATTLE_DECISION_RULES = Object.freeze({
  maxDecisionPoints: 3,
  maxActionsPerDecision: 3,
  scopes: Object.freeze(['player', 'party']),
  maxPromptLength: 160,
});

function requireId(value, label) {
  const id = String(value || '').trim();
  if (!id) throw new Error(`${label} requires an id.`);
  return id;
}

function normalizePrompt(value, label) {
  const prompt = String(value || '').trim();
  if (!prompt) throw new Error(`${label} requires a prompt.`);
  if (prompt.length > AUTOMATIC_BATTLE_DECISION_RULES.maxPromptLength) {
    throw new Error(`${label} prompt exceeds ${AUTOMATIC_BATTLE_DECISION_RULES.maxPromptLength} characters.`);
  }
  return prompt;
}

function normalizeScope(value, label) {
  const scope = String(value || 'party').trim().toLowerCase();
  if (!AUTOMATIC_BATTLE_DECISION_RULES.scopes.includes(scope)) {
    throw new Error(`${label} scope must be player or party.`);
  }
  return scope;
}

function normalizeAfterTurn(value, label) {
  if (value == null) return null;
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} afterTurn must be a positive integer.`);
  return value;
}

function normalizeBossHpRatio(value, label) {
  if (value == null) return null;
  const ratio = Number(value);
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1) {
    throw new Error(`${label} bossHpRatioAtOrBelow must be greater than 0 and at most 1.`);
  }
  return ratio;
}

function normalizeActions(actions, label) {
  if (!Array.isArray(actions) || actions.length === 0) {
    throw new Error(`${label} requires at least one action.`);
  }
  if (actions.length > AUTOMATIC_BATTLE_DECISION_RULES.maxActionsPerDecision) {
    throw new Error(`${label} may expose at most ${AUTOMATIC_BATTLE_DECISION_RULES.maxActionsPerDecision} actions.`);
  }

  const normalized = actions.map((action) => {
    const id = typeof action === 'string' ? action : action?.id;
    const canonical = AUTOMATIC_BATTLE_DECISION_ACTIONS[String(id || '').trim()];
    if (!canonical) throw new Error(`${label} contains unsupported decision action: ${String(id || '')}.`);
    return canonical;
  });

  if (new Set(normalized.map((action) => action.id)).size !== normalized.length) {
    throw new Error(`${label} decision actions must be unique.`);
  }
  return Object.freeze(normalized);
}

export function normalizeSparseBossDecisionPoint(point, index = 0) {
  if (!point || typeof point !== 'object') throw new Error(`Boss decision ${index + 1} is required.`);
  const label = `Boss decision ${index + 1}`;
  const afterTurn = normalizeAfterTurn(point.afterTurn, label);
  const bossHpRatioAtOrBelow = normalizeBossHpRatio(point.bossHpRatioAtOrBelow, label);
  if (afterTurn == null && bossHpRatioAtOrBelow == null) {
    throw new Error(`${label} requires afterTurn and/or bossHpRatioAtOrBelow.`);
  }

  return Object.freeze({
    id: requireId(point.id, label),
    scope: normalizeScope(point.scope, label),
    prompt: normalizePrompt(point.prompt, label),
    actions: normalizeActions(point.actions, label),
    afterTurn,
    bossHpRatioAtOrBelow,
  });
}

export function normalizeSparseBossDecisionPoints(points = []) {
  if (!Array.isArray(points)) throw new Error('Boss decisions must be an array.');
  if (points.length > AUTOMATIC_BATTLE_DECISION_RULES.maxDecisionPoints) {
    throw new Error(`Boss battles may define at most ${AUTOMATIC_BATTLE_DECISION_RULES.maxDecisionPoints} sparse decision points.`);
  }
  const normalized = points.map(normalizeSparseBossDecisionPoint);
  if (new Set(normalized.map((point) => point.id)).size !== normalized.length) {
    throw new Error('Boss decision ids must be unique.');
  }
  return Object.freeze(normalized);
}

function resolvedDecisionIds(context) {
  const ids = context?.resolvedDecisionIds;
  if (ids == null) return new Set();
  if (!Array.isArray(ids)) throw new Error('resolvedDecisionIds must be an array when provided.');
  return new Set(ids.map((id) => String(id || '').trim()).filter(Boolean));
}

function projectPendingDecision(point) {
  return Object.freeze({
    id: point.id,
    scope: point.scope,
    prompt: point.prompt,
    actions: Object.freeze(point.actions.map((action) => Object.freeze({ ...action }))),
  });
}

/**
 * Creates a bounded, declarative pause policy for major progression-boss phases.
 *
 * The policy does not execute Heal, Use Item, or coordination mechanics. It only
 * decides when an automatic phase should pause and exposes a constrained choice
 * contract for an application service to coordinate/persist later. Resolved ids
 * supplied by that service suppress already-completed decisions on continuation.
 */
export function createSparseBossDecisionPolicy({ bossId, decisions = [], activity = 'boss-phase' } = {}) {
  const canonicalBossId = requireId(bossId, 'Sparse boss decision policy');
  const canonicalActivity = requireId(activity, 'Sparse boss decision policy activity');
  const points = normalizeSparseBossDecisionPoints(decisions);

  return ({ turnNumber, combatants, context } = {}) => {
    if (String(context?.activity || '') !== canonicalActivity) return null;
    if (!Number.isInteger(turnNumber) || turnNumber <= 0) throw new Error('Boss decision policy requires a positive turnNumber.');
    if (!Array.isArray(combatants)) throw new Error('Boss decision policy requires combatants.');

    const boss = combatants.find((combatant) => combatant?.id === canonicalBossId);
    if (!boss) throw new Error(`Boss decision policy could not find boss combatant ${canonicalBossId}.`);
    const maxHp = Number(boss.maxHp);
    const hp = Number(boss.hp);
    if (!Number.isFinite(maxHp) || maxHp <= 0 || !Number.isFinite(hp) || hp < 0) {
      throw new Error('Boss decision policy requires valid boss HP state.');
    }

    const resolved = resolvedDecisionIds(context);
    for (const point of points) {
      if (resolved.has(point.id)) continue;
      const turnReady = point.afterTurn == null || turnNumber >= point.afterTurn;
      const hpReady = point.bossHpRatioAtOrBelow == null || (hp / maxHp) <= point.bossHpRatioAtOrBelow;
      if (!turnReady || !hpReady) continue;

      return Object.freeze({
        reason: 'boss-decision',
        pendingDecision: projectPendingDecision(point),
      });
    }
    return null;
  };
}
