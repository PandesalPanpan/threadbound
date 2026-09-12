function progressionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requiredHumanCount(definition) {
  const configured = Number(definition?.requiredHumanPlayers);
  if (Number.isInteger(configured) && configured > 0) return configured;
  return 2;
}

function isSimulatedPlayer(player) {
  return Boolean(player?.isSimulated || player?.simulated || player?.kind === 'simulated' || player?.playerType === 'simulated');
}

/**
 * Authoritative entry policy for progression Adventures/bosses.
 *
 * Major progression challenges require both human players by default. A content
 * definition may intentionally configure another positive requiredHumanPlayers
 * value, but callers cannot silently downgrade the default at the presentation
 * boundary. Unlock rewards remain outside this policy and belong to M5-07.
 */
export function requireProgressionAdventureParty({ definition, party, startedByPlayerId, players = [] } = {}) {
  const requiredHumans = requiredHumanCount(definition);
  if (!party) {
    throw progressionError('progression_party_required', `This progression Adventure requires ${requiredHumans} ready human players.`);
  }
  if (party.status !== 'forming') {
    throw progressionError('progression_party_unavailable', 'The party must be forming before starting a progression Adventure.');
  }
  if (party.leaderPlayerId !== startedByPlayerId) {
    throw progressionError('progression_leader_required', 'Only the ready party leader can start a progression Adventure.');
  }
  if (!party.allReady) {
    throw progressionError('progression_party_not_ready', 'Both human players must be ready before starting the progression Adventure.');
  }

  const participantIds = party.participantIds();
  if (participantIds.length !== requiredHumans || new Set(participantIds).size !== requiredHumans) {
    throw progressionError('progression_party_size', `This progression Adventure requires exactly ${requiredHumans} human players.`);
  }
  if (players.length !== requiredHumans || players.some((player) => !player)) {
    throw progressionError('progression_party_missing_player', 'Every progression Adventure participant must resolve to a persisted player.');
  }
  if (players.some(isSimulatedPlayer)) {
    throw progressionError('progression_humans_required', 'Simulated adventurers cannot satisfy a human progression requirement.');
  }

  return Object.freeze({
    requiredHumanPlayers: requiredHumans,
    participantIds: Object.freeze([...participantIds]),
  });
}

export function progressionAdventureRequirement({ definition, party } = {}) {
  const requiredHumanPlayers = requiredHumanCount(definition);
  const participantIds = party?.participantIds?.() || [];
  return Object.freeze({
    requiredHumanPlayers,
    participantCount: participantIds.length,
    satisfied: Boolean(
      party
      && party.status === 'forming'
      && party.allReady
      && participantIds.length === requiredHumanPlayers
      && new Set(participantIds).size === requiredHumanPlayers
    ),
  });
}
