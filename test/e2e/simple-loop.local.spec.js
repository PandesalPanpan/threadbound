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

test('slash-command replies scroll fully into view as their content grows', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 500 } });
  const page = await context.newPage();

  try {
    await login(page, 'a');
    await page.getByTestId('stream-message').fill('/help');
    await page.getByTestId('stream-send').click();

    const reply = page.getByTestId('stream-command-card');
    await expect(reply).toBeVisible();
    await expect(reply).toContainText('/dungeon');
    await expect.poll(async () => reply.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return Math.ceil(bounds.bottom) <= window.innerHeight;
    })).toBe(true);
  } finally {
    await context.close();
  }
});

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

    // The legacy tactical start button can remain in the DOM for migration compatibility.
    // The player-facing contract is the simple-loop action rendered by SimpleDungeonService.
    const startDungeon = leader.locator('.simple-loop-action[data-testid="stream-start-dungeon"]');
    await expect(startDungeon).toBeVisible({ timeout: 5000 });
    await startDungeon.click();

    await expect.poll(async () => (await dashboard(leaderContext)).activeRun?.id || null, { timeout: 5000 }).not.toBeNull();
    const leaderState = await dashboard(leaderContext);
    const partnerState = await dashboard(partnerContext);
    expect(leaderState.activeRun.id).toBe(partnerState.activeRun.id);
    expect(leaderState.activeRun.simpleCombat).toBe(true);
    expect(leaderState.activeRun.participants).toHaveLength(2);
    expect(leaderState.activeRun.enemy.maxHp).toBe(40);

    await partner.reload();
    const attack = partner.locator('.simple-loop-action[data-testid="stream-attack"]');
    await expect(attack).toBeVisible({ timeout: 5000 });
    const hpBefore = partnerState.activeRun.enemy.hp;
    await attack.click();
    await expect.poll(async () => (await dashboard(leaderContext)).activeRun?.enemy?.hp ?? -1, { timeout: 5000 }).not.toBe(hpBefore);

    const receipt = leader.getByTestId('stream-system-entry').filter({ hasText: /attacked Frayed Wisp/i }).last();
    await expect(receipt).toBeVisible({ timeout: 5000 });
    await expect(receipt.locator('.stream-app-badge')).toHaveText('APP');
    await expect(leader.getByTestId('stream-guard')).toHaveCount(0);
    await expect(partner.getByTestId('stream-interrupt')).toHaveCount(0);
    await expect(leader.getByText(/PRIVATE THREAD REPLY/i)).toHaveCount(0);
  } finally {
    await leaderContext.close();
    await partnerContext.close();
  }
});
