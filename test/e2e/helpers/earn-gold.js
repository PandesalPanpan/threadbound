import { expect } from '@playwright/test';

async function dashboard(context) {
  const response = await context.request.get('/api/dashboard');
  expect(response.ok()).toBe(true);
  return response.json();
}

export async function earnGoldWithWelcomeQuest(context, minimum = 8) {
  let state = await dashboard(context);
  if (state.character.gold >= minimum) return state;

  const boardResponse = await context.request.get('/api/quests');
  expect(boardResponse.ok()).toBe(true);
  const board = await boardResponse.json();
  const quest = board.quests.find((candidate) => candidate.id === 'welcome-to-bellbloom');
  expect(quest).toMatchObject({ state: 'available', title: 'Welcome to Bellbloom' });

  const acceptResponse = await context.request.post(`/api/quests/${quest.id}/accept`);
  expect(acceptResponse.ok()).toBe(true);

  const npcId = quest.objectives.find((objective) => objective.type === 'speak')?.targetId;
  expect(npcId).toBeTruthy();
  const interactionResponse = await context.request.post(`/api/towns/${quest.townId}/npcs/${npcId}/interact`);
  expect(interactionResponse.ok()).toBe(true);

  const refreshedBoardResponse = await context.request.get('/api/quests');
  expect(refreshedBoardResponse.ok()).toBe(true);
  const refreshedBoard = await refreshedBoardResponse.json();
  const completedQuest = refreshedBoard.quests.find((candidate) => candidate.id === quest.id);
  expect(completedQuest).toMatchObject({ state: 'claimable' });

  const claimResponse = await context.request.post(`/api/quests/${quest.id}/claim`);
  expect(claimResponse.ok()).toBe(true);

  state = await dashboard(context);
  expect(state.character.gold).toBeGreaterThanOrEqual(minimum);
  return state;
}
