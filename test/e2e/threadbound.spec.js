import { test, expect } from '@playwright/test';

test('Threaded login -> dungeon -> generated loot -> equip -> idempotent Honey spend', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Connect with Threaded' }).click();
  await expect(page.getByRole('heading', { name: 'Fake Threaded' })).toBeVisible();
  await page.getByRole('button', { name: 'Authorize Threadbound' }).click();

  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('threaded-user')).toContainText('E2E Weaver');
  await expect(page.getByTestId('honey-balance')).toHaveText('100');
  await expect(page.getByTestId('attack-power')).toHaveText('6');

  await page.getByTestId('start-dungeon').click();
  for (let index = 0; index < 6; index += 1) await page.getByTestId('attack').click();
  await expect(page.getByTestId('run-state')).toContainText('Phase: upgrade');

  await page.getByTestId('upgrade-sharpen').click();
  await expect(page.getByTestId('run-state')).toContainText('Phase: boss');
  for (let index = 0; index < 3; index += 1) await page.getByTestId('attack').click();

  await expect(page.getByTestId('inventory-item')).toHaveCount(1);
  await expect(page.getByTestId('thread-dust')).toHaveText('15');
  await expect(page.getByTestId('world-progress')).toHaveText('1');
  await expect(page.getByTestId('achievement')).toHaveCount(2);

  await page.getByRole('button', { name: 'Equip' }).first().click();
  const upgradedAttack = Number(await page.getByTestId('attack-power').textContent());
  expect(upgradedAttack).toBeGreaterThan(6);
  await expect(page.getByTestId('achievement')).toHaveCount(3);

  const key = 'e2e-retry-same-key';
  const first = await page.request.post('/api/honey/purchases/training-cache', { headers: { 'Idempotency-Key': key } });
  expect(first.status()).toBe(201);
  const firstBody = await first.json();
  expect(firstBody.grant_applied).toBe(true);
  expect(firstBody.wallet.balance).toBe(75);

  const retry = await page.request.post('/api/honey/purchases/training-cache', { headers: { 'Idempotency-Key': key } });
  expect(retry.status()).toBe(200);
  const retryBody = await retry.json();
  expect(retryBody.grant_applied).toBe(false);
  expect(retryBody.threaded_transaction_id).toBe(firstBody.threaded_transaction_id);
  expect(retryBody.wallet.balance).toBe(75);

  await page.reload();
  await expect(page.getByTestId('honey-balance')).toHaveText('75');
  await expect(page.getByTestId('inventory-item')).toHaveCount(2);

  await page.getByTestId('start-dungeon').click();
  await expect(page.getByTestId('run-state')).toContainText('Phase: combat');
  await expect(page.getByTestId('attack-power')).not.toHaveText('6');
});
