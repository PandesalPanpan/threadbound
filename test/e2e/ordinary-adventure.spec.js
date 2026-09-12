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

test('ordinary Adventure resolves from the mobile Adventure Stream using the authoritative current Area', async ({ page, context }) => {
  await login(page);

  const beforeResponse = await context.request.get('/api/dashboard');
  expect(beforeResponse.ok()).toBe(true);
  const before = await beforeResponse.json();
  expect(before.character.currentHealth).toBeGreaterThan(0);

  const adventureResponse = page.waitForResponse((response) => response.url().endsWith('/api/adventure') && response.request().method() === 'POST');
  await page.getByTestId('stream-message').fill('adventure');
  await page.getByTestId('stream-send').click();
  expect((await adventureResponse).ok()).toBe(true);

  const receipt = page.locator('[data-testid="adventure-stream-log"] .stream-entry-system').filter({ hasText: 'Adventured in Area 1' }).last();
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText('Thread Wolf');
  await expect(receipt).toContainText(/\d+\/\d+ HP/);

  const afterResponse = await context.request.get('/api/dashboard');
  expect(afterResponse.ok()).toBe(true);
  const after = await afterResponse.json();
  expect(after.character.currentHealth).toBeLessThanOrEqual(before.character.currentHealth);

  const streamResponse = await context.request.get('/api/stream?limit=20');
  expect(streamResponse.ok()).toBe(true);
  const stream = await streamResponse.json();
  const event = stream.entries.find((entry) => entry.eventType === 'AdventureResolved');
  expect(event).toBeTruthy();
  expect(event.metadata).toMatchObject({
    areaId: 'area-1',
    areaNumber: 1,
    enemyId: 'thread-wolf',
    gold: 0,
    experienceGained: 0,
  });

  await expect(page.getByTestId('stream-message')).toBeVisible();
  await expect(page.getByTestId('stream-message')).toBeEditable();
  await expect(page.locator('body')).not.toContainText('Guard to protect');
});
