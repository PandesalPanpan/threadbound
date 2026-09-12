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

test('command results scroll fully into view as their content grows', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 500 } });
  const page = await context.newPage();

  try {
    await login(page, 'a');
    await expect(page.getByTestId('thread-dust').locator('..')).toContainText('Gold');
    await page.getByTestId('stream-message').fill('help');
    await page.getByTestId('stream-send').click();

    const reply = page.getByTestId('stream-command-card');
    await expect(reply).toBeVisible();
    await expect(reply).toContainText('dungeon');
    await page.getByTestId('stream-message').fill('hunt');
    await page.getByTestId('stream-send').click();
    const receipt = page.getByTestId('stream-system-entry').filter({ hasText: /Victory — .* defeated/i }).last();
    await expect(receipt).toBeVisible();
    await expect(receipt.getByTestId('stream-hunt-sprite')).toBeVisible();
    await expect(receipt.locator('.stream-hunt-chip.loss')).toContainText('HP');
    await expect(receipt.locator('.stream-hunt-chip.health')).toContainText('/40 HP');
    await expect(receipt.locator('.stream-hunt-chip.reward')).toContainText('Gold');
    await expect(receipt).not.toContainText(/\bDust\b/);
    await expect(page.locator('.simple-loop-action')).toHaveCount(2);
    await expect.poll(async () => page.getByTestId('adventure-stream-log').evaluate((element) => (
      Math.ceil(element.scrollHeight - element.scrollTop - element.clientHeight)
    ))).toBeLessThanOrEqual(1);

    // The first Hunt already creates recoverable attrition. Check the recovery
    // countdown before healing instead of issuing a second Hunt inside its cooldown.
    await page.getByTestId('stream-message').fill('rest');
    await page.getByTestId('stream-send').click();
    await expect(page.getByTestId('stream-command-card')).toContainText(/Next HP in \d+[sm]/);
    const firstCountdown = await page.locator('[data-simple-recovery-next]').textContent();
    await expect.poll(() => page.locator('[data-simple-recovery-next]').textContent(), { timeout: 3000 }).not.toBe(firstCountdown);

    await page.getByTestId('stream-message').fill('heal');
    await page.getByTestId('stream-send').click();
    await expect(page.getByTestId('stream-system-entry').filter({ hasText: /used a health potion/i }).last()).toBeVisible();
    await expect(page.getByTestId('stream-heal')).toHaveCount(0);

    await page.getByTestId('stream-message').fill('shop');
    await page.getByTestId('stream-send').click();
    await expect(page.getByRole('img', { name: 'Mara, field merchant' })).toBeVisible();
    await expect(page.getByTestId('stream-shop-single')).toContainText('Buy · 5 Gold');
    await expect(page.getByTestId('stream-shop-satchel')).toContainText('Buy · 12 Gold');
    await expect(page.getByTestId('stream-command-card').last()).not.toContainText(/\bDust\b/);

    // Migration adapters must not rewrite player-authored chat history.
    await page.getByTestId('stream-message').fill('Thread Dust is the old name');
    await page.getByTestId('stream-send').click();
    await expect(page.getByTestId('stream-chat-entry').last()).toContainText('Thread Dust is the old name');
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

    // Contextual buttons may prioritize Inventory once persistent gear exists. The
    // typed dungeon command is the stable parity contract and must remain available.
    await leader.getByTestId('stream-message').fill('dungeon');
    await leader.getByTestId('stream-send').click();

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
