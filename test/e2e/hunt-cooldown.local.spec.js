import { test, expect } from '@playwright/test';

async function login(page, slot = 'a') {
  await page.goto('/');
  await page.getByTestId(`local-login-${slot}`).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
}

test('Hunt uses the server-owned short cooldown and reports exact next-ready state', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  try {
    await login(page);

    const firstResponse = await context.request.post('/api/hunt');
    expect(firstResponse.ok()).toBe(true);
    const first = await firstResponse.json();
    expect(first.hunt.cooldown.remainingSeconds).toBe(15);
    expect(first.hunt.cooldown.nextReadyAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    const secondResponse = await context.request.post('/api/hunt');
    expect(secondResponse.status()).toBe(409);
    const blocked = await secondResponse.json();
    expect(blocked.error).toBe('hunt_cooldown');
    expect(blocked.message).toMatch(/^Hunt is recharging\. Ready in \d+s \(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\)\.$/);
    expect(blocked.message).toContain(first.hunt.cooldown.nextReadyAt);

    const streamResponse = await context.request.get('/api/stream?limit=10');
    expect(streamResponse.ok()).toBe(true);
    const stream = await streamResponse.json();
    const huntEntries = (stream.entries || []).filter((entry) => entry.eventType === 'HuntResolved');
    expect(huntEntries).toHaveLength(1);
    expect(huntEntries[0].text).toContain(`Next Hunt — ${first.hunt.cooldown.nextReadyAt}`);
  } finally {
    await context.close();
  }
});
