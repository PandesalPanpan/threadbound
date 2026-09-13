import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Connect with Threaded' }).click();
  await expect(page.getByRole('heading', { name: 'Fake Threaded' })).toBeVisible();
  await page.getByRole('button', { name: 'Authorize Threadbound' }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
}

async function dashboard(context) {
  const response = await context.request.get('/api/dashboard');
  expect(response.ok()).toBe(true);
  return response.json();
}

test('expected Sell protection is a 409 conflict and cannot convert Honey gear into Gold', async ({ page, context }) => {
  await login(page);
  const purchaseResponse = await context.request.post('/api/honey/purchases/training-cache', {
    headers: { 'Idempotency-Key': 'sell-conflict-honey-grant' },
  });
  expect(purchaseResponse.ok()).toBe(true);
  const purchase = await purchaseResponse.json();
  const itemId = purchase.item.id;

  const before = await dashboard(context);
  const goldBefore = before.character.gold;
  expect(before.inventory.some((item) => item.id === itemId)).toBe(true);

  // /salvage remains the migration transport alias, but it executes canonical Sell rules.
  const blocked = await context.request.post(`/api/items/${itemId}/salvage`);
  expect(blocked.status()).toBe(409);
  const payload = await blocked.json();
  expect(payload.error).toBe('honey_item_cannot_be_sold');
  expect(payload.message).toContain('cannot be sold for Gold');

  const after = await dashboard(context);
  expect(after.inventory.some((item) => item.id === itemId)).toBe(true);
  expect(after.character.gold).toBe(goldBefore);
});
