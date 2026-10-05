export const ARENA_FORMATION_RULES = Object.freeze({
  boardSize: 8,
  playerRows: Object.freeze([5, 6, 7]),
});

export function normalizePlayerArenaPosition(position, playerId = 'Player') {
  if (!position || !Number.isInteger(position.x) || !Number.isInteger(position.y)
    || position.x < 0 || position.x >= ARENA_FORMATION_RULES.boardSize
    || !ARENA_FORMATION_RULES.playerRows.includes(position.y)) {
    const error = new Error(`${playerId} must be placed on an open tile in the bottom three rows.`);
    error.code = 'invalid_arena_formation';
    throw error;
  }
  return Object.freeze({ x: position.x, y: position.y });
}

export function formationReadyForParticipants(readyByPlayer = {}, participants = []) {
  return participants.every((participant) => readyByPlayer[String(participant.playerId)] === true);
}
