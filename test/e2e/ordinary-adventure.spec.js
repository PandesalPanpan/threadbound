import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function login(page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Connect with Threaded' }).click();
  await expect(page.getByRole('heading', { name: 'Fake Threaded' })).toBeVisible();
  await page.getByRole('button', { name: 'Authorize Threadbound' }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
}

test('ordinary Adventure resolves from the mobile Adventure Stream with authoritative rewards and cooldown', async ({ page, context }) => {
  await login(page);

  const beforeResponse = await context.request.get('/api/dashboard');
  expect(beforeResponse.ok()).toBe(true);
  const before = await beforeResponse.json();
  expect(before.character.currentHealth).toBeGreaterThan(0);
  const areaResponse = await context.request.get('/api/areas');
  expect(areaResponse.ok()).toBe(true);
  const currentArea = (await areaResponse.json()).area.currentArea;

  const adventureResponse = page.waitForResponse((response) => response.url().endsWith('/api/adventure') && response.request().method() === 'POST');
  await page.getByTestId('stream-message').fill('adventure');
  await page.getByTestId('stream-send').click();
  expect((await adventureResponse).ok()).toBe(true);

  const streamResponse = await context.request.get('/api/stream?limit=20');
  expect(streamResponse.ok()).toBe(true);
  const stream = await streamResponse.json();
  const event = stream.entries.find((entry) => entry.eventType === 'AdventureResolved');
  expect(event).toBeTruthy();
  expect(event.metadata.areaId).toBe(currentArea.id);
  expect(event.metadata.areaNumber).toBe(currentArea.number);
  expect(event.metadata.areaName).toBe(currentArea.name);
  expect(event.metadata.enemyId).toBeTruthy();
  expect(event.metadata.enemyName).toBeTruthy();
  expect(event.metadata.victory).toBe(true);
  expect(event.metadata.gold).toBeGreaterThan(0);
  expect(event.metadata.experienceGained).toBeGreaterThan(0);
  expect(event.metadata.adventureCooldownSeconds).toBeGreaterThan(0);
  expect(event.metadata.nextAdventureReadyAt).toMatch(/Z$/);

  const receipt = page.locator('[data-testid="adventure-stream-log"] .stream-entry-system').filter({ hasText: `Adventured in ${currentArea.name}` }).last();
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText(event.metadata.enemyName);
  await expect(receipt).toContainText(`${event.metadata.remainingHp}/${event.metadata.maxHp} HP`);
  await expect(receipt).toContainText(`+${event.metadata.experienceGained} XP`);
  await expect(receipt).toContainText(`+${event.metadata.gold} Gold`);
  await expect(receipt).toContainText('Next Adventure');

  const afterResponse = await context.request.get('/api/dashboard');
  expect(afterResponse.ok()).toBe(true);
  const after = await afterResponse.json();
  expect(after.character.currentHealth).toBeLessThanOrEqual(before.character.currentHealth);

  const repeatResponsePromise = page.waitForResponse((response) => response.url().endsWith('/api/adventure') && response.request().method() === 'POST');
  await page.getByTestId('stream-message').fill('adventure');
  await page.getByTestId('stream-send').click();
  const repeatResponse = await repeatResponsePromise;
  expect(repeatResponse.status()).toBe(409);
  const blocked = await repeatResponse.json();
  expect(blocked.error).toBe('adventure_cooldown');
  expect(blocked.message).toMatch(/^Adventure is recharging\. Ready in \d+s \(.+Z\)\.$/);

  await expect(page.getByTestId('stream-message')).toBeVisible();
  await expect(page.getByTestId('stream-message')).toBeEditable();
  await expect(page.locator('body')).not.toContainText('Guard to protect');
});
