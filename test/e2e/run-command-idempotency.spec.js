import { test, expect } from '@playwright/test';

async function loginWithThreaded(page) {
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

test('PX-48 browser run command carries a durable key and a lost-response retry cannot apply twice', async ({ page, context }) => {
  await loginWithThreaded(page);
  await page.getByTestId('stream-start-dungeon').click();
  await expect.poll(async () => (await dashboard(context)).activeRun?.id || null, { timeout: 5000 }).not.toBeNull();

  const before = await dashboard(context);
  const runId = before.activeRun.id;
  const attackPath = `/api/runs/${encodeURIComponent(runId)}/attack`;

  const requestPromise = page.waitForRequest((request) => request.method() === 'POST' && new URL(request.url()).pathname === attackPath);
  const responsePromise = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === attackPath);
  await page.getByTestId('stream-attack').click();
  const browserRequest = await requestPromise;
  const firstResponse = await responsePromise;
  expect(firstResponse.ok()).toBe(true);
  expect(firstResponse.headers()['idempotency-replayed']).toBe('false');

  const idempotencyKey = browserRequest.headers()['idempotency-key'];
  expect(idempotencyKey).toMatch(/^run-[0-9a-f-]{36}$/i);
  const firstPayload = await firstResponse.json();
  const afterFirst = await dashboard(context);
  expect(afterFirst.activeRun.version).toBeGreaterThan(before.activeRun.version);

  // Treat the first response as if the client never received it. Retrying the identical
  // mutation with the captured key must replay the stored response and leave run version alone.
  const retry = await context.request.post(attackPath, { headers: { 'Idempotency-Key': idempotencyKey } });
  expect(retry.status()).toBe(200);
  expect(retry.headers()['idempotency-replayed']).toBe('true');
  expect(await retry.json()).toEqual(firstPayload);
  const afterRetry = await dashboard(context);
  expect(afterRetry.activeRun.version).toBe(afterFirst.activeRun.version);

  const mismatch = await context.request.post(`/api/runs/${encodeURIComponent(runId)}/guard`, { headers: { 'Idempotency-Key': idempotencyKey } });
  expect(mismatch.status()).toBe(409);
  expect(await mismatch.json()).toMatchObject({ error: 'run_command_replay_mismatch' });
});
