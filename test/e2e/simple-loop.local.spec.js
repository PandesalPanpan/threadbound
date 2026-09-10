import { test, expect } from '@playwright/test';

const NAMES = { a: 'Local Weaver A', b: 'Local Weaver B' };

async function login(page, slot) {
  await page.goto('/');
  await page.getByTestId(`local-login-${slot}`).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('threaded-user')).toHaveText(NAMES[slot]);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
}

async function dashboard(context) {
  const response = await context.request.get('/api/dashboard');
  expect(response.ok()).toBe(true);
  return response.json();
}

test('party members share the same hard attack-only dungeon and live stream', async ({ browser }) => {
  const leaderContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const partnerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const leader = await leaderContext.newPage();
  const partner = await partnerContext.newPage();

  try {
    await login(leader, 'a');
    await login(partner, 'b');

    const created = await leaderContext.request.post('/api/party/create');
    expect(created.ok()).toBe(true);
    const code = (await created.json()).party.joinCode;
    const joined = await partnerContext.request.post('/api/party/join', { data: { joinCode: code } });
    expect(joined.ok()).toBe(true);
    const ready = await partnerContext.request.post('/api/party/ready', { data: { ready: true } });
    expect(ready.ok()).toBe(true);

    await leader.reload();
    await partner.reload();
    await expect(leader.getByTestId('stream-start-dungeon')).toBeVisible({ timeout: 5000 });
    await leader.getByTestId('stream-start-dungeon').click();

    await expect.poll(async () => (await dashboard(leaderContext)).activeRun?.id || null, { timeout: 5000 }).not.toBeNull();
    const leaderState = await dashboard(leaderContext);
    const partnerState = await dashboard(partnerContext);
    expect(leaderState.activeRun.id).toBe(partnerState.activeRun.id);
    expect(leaderState.activeRun.simpleCombat).toBe(true);
    expect(leaderState.activeRun.participants).toHaveLength(2);
    expect(leaderState.activeRun.enemy.maxHp).toBe(40);

    await partner.reload();
    await expect(partner.getByTestId('stream-attack')).toBeVisible({ timeout: 5000 });
    const hpBefore = partnerState.activeRun.enemy.hp;
    await partner.getByTestId('stream-attack').click();
    await expect.poll(async () => (await dashboard(leaderContext)).activeRun?.enemy?.hp ?? -1, { timeout: 5000 }).not.toBe(hpBefore);

    const receipt = leader.getByTestId('stream-system-entry').filter({ hasText: /attacked Frayed Wisp/i }).last();
    await expect(receipt).toBeVisible({ timeout: 5000 });
    await expect(leader.getByTestId('stream-guard')).toHaveCount(0);
    await expect(partner.getByTestId('stream-interrupt')).toHaveCount(0);
  } finally {
    await leaderContext.close();
    await partnerContext.close();
  }
});
