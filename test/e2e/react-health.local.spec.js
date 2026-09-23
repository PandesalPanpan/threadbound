import { test, expect } from '@playwright/test';

async function login(page, slot) {
  await page.goto('/');
  await page.getByTestId(`local-login-${slot}`).click();
  await page.context().request.post('/api/party/leave');
}

async function dashboard(context) {
  const response = await context.request.get('/api/dashboard');
  expect(response.ok()).toBe(true);
  return response.json();
}

test('Hunt and Dungeon share the same persistent HP across entry, damage, exit, and the next Hunt', async ({ page }) => {
  await login(page, 'h');
  const firstHuntResponse = await page.context().request.post('/api/hunt');
  expect(firstHuntResponse.ok()).toBe(true);
  const firstHunt = await firstHuntResponse.json();
  expect(firstHunt.hunt.startingHp).toBe(40);
  expect(firstHunt.hunt.remainingHp).toBeLessThan(40);
  expect(firstHunt.hunt.remainingHp).toBeGreaterThan(0);

  const entryHealth = firstHunt.hunt.remainingHp;
  const startResponse = await page.context().request.post('/api/dungeons/frayed-hollow/start-shared');
  expect(startResponse.ok()).toBe(true);
  const started = await startResponse.json();
  expect(started.battleReplay.players[0].startingHp).toBe(entryHealth);
  expect(started.run.participants[0].hp).toBe(started.battleReplay.players[0].endingHp);

  const active = await dashboard(page.context());
  const activeParticipant = active.activeRun.participants.find((participant) => participant.playerId === active.character.id);
  expect(active.character.currentHealth).toBe(activeParticipant.hp);
  expect(active.character.healthRecovery).toEqual({ nextHealthInSeconds: 0, fullHealthInSeconds: 0 });

  const runId = started.run.id;
  const retreatResponse = await page.context().request.post(`/api/runs/${encodeURIComponent(runId)}/retreat`);
  expect(retreatResponse.ok()).toBe(true);
  const retreated = await retreatResponse.json();
  const exitHealth = retreated.run.viewer.hp;
  const afterExit = await dashboard(page.context());
  expect(afterExit.activeRun).toBeNull();
  expect(afterExit.character.currentHealth).toBe(exitHealth);

  const nextHuntResponse = await page.context().request.post('/api/hunt');
  expect(nextHuntResponse.ok()).toBe(true);
  const nextHunt = await nextHuntResponse.json();
  expect(nextHunt.hunt.startingHp).toBe(exitHealth);
});

test('Dungeon potion uses the shared Minor inventory with a fixed bounded heal and persistent checkpoint', async ({ page }) => {
  await login(page, 'j');
  const first = await page.context().request.post('/api/hunt');
  expect(first.ok()).toBe(true);
  const second = await page.context().request.post('/api/hunt');
  expect(second.ok()).toBe(true);

  const startedResponse = await page.context().request.post('/api/dungeons/frayed-hollow/start-shared');
  expect(startedResponse.ok()).toBe(true);
  const started = await startedResponse.json();
  expect(started.run.phase).toBe('between_encounter');
  const pausedHp = started.run.participants[0].hp;
  const maxHp = started.run.participants[0].maxHp;
  expect(pausedHp).toBeGreaterThan(0);
  expect(pausedHp).toBeLessThan(maxHp);
  const beforePotionDashboard = await dashboard(page.context());
  const beforePotionQuantity = beforePotionDashboard.character.potions.find((candidate) => candidate.id === 'minor-health-potion').quantity;
  expect(beforePotionQuantity).toBeGreaterThan(0);

  try {
    const potionResponse = await page.context().request.post(`/api/runs/${encodeURIComponent(started.run.id)}/potion`, { data: { potion: 'minor' } });
    expect(potionResponse.ok()).toBe(true);
    const potion = await potionResponse.json();
    expect(potion.recovery.potionId).toBe('minor-health-potion');
    expect(potion.recovery.potionHeal).toBe(8);
    expect(potion.recovery.healed).toBe(Math.min(8, maxHp - pausedHp));

    const current = await dashboard(page.context());
    const participant = current.activeRun.participants.find((candidate) => candidate.playerId === current.character.id);
    expect(current.character.currentHealth).toBe(participant.hp);
    expect(current.character.healthPotions).toBe(beforePotionQuantity - 1);
    expect(current.character.potions.find((candidate) => candidate.id === 'minor-health-potion').quantity).toBe(beforePotionQuantity - 1);
  } finally {
    const retreat = await page.context().request.post(`/api/runs/${encodeURIComponent(started.run.id)}/retreat`);
    expect(retreat.ok()).toBe(true);
  }
});
