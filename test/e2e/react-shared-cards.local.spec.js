import { test, expect } from '@playwright/test';

async function login(page, slot) {
  await page.goto('/');
  await page.getByTestId(`local-login-${slot}`).click();
  await page.context().request.post('/api/party/leave');
  await page.goto('/game');
}

async function command(page, value) {
  const input = page.getByTestId('stream-message');
  await input.fill(value);
  await input.press('Enter');
}

test('shared Hunt, Inventory, and Gambling cards survive reload and stay read-only for observers', async ({ browser }) => {
  const ownerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const observerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const owner = await ownerContext.newPage();
  const observer = await observerContext.newPage();

  try {
    await login(owner, 'a');
    await login(observer, 'b');
    await ownerContext.request.post('/api/party/leave');
    await observerContext.request.post('/api/party/leave');

    const huntResponse = await ownerContext.request.post('/api/hunt');
    expect(huntResponse.ok()).toBe(true);
    const huntPayload = await huntResponse.json();
    expect(huntPayload.hunt.battleReplay).toBeDefined();

    const inventoryResponse = await ownerContext.request.post('/api/stream/inventory-view');
    expect(inventoryResponse.ok()).toBe(true);

    const ownerDashboard = await ownerContext.request.get('/api/dashboard');
    expect(ownerDashboard.ok()).toBe(true);
    const ownerState = await ownerDashboard.json();
    expect(ownerState.character.gold).toBeGreaterThan(0);
    const gamblingResponse = await ownerContext.request.post('/api/gambling/coinflip', {
      headers: { 'Idempotency-Key': 'react-shared-cards-coinflip-0001' },
      data: { wager: 1, choice: 'heads' },
    });
    expect(gamblingResponse.ok()).toBe(true);

    await observer.goto('/game');
    const huntCard = observer.getByTestId('stream-hunt-rich-card').last();
    const inventoryCard = observer.getByTestId('stream-inventory-rich-card').last();
    const gamblingCard = observer.getByTestId('stream-gambling-rich-card').last();
    await expect(huntCard).toBeVisible();
    await expect(huntCard).toHaveClass(/is-observer/);
    await expect(huntCard.getByRole('button', { name: 'Watch battle' })).toBeVisible();
    await expect(inventoryCard).toBeVisible();
    await expect(inventoryCard).toHaveClass(/is-observer/);
    await expect(inventoryCard.locator('button, input, select, textarea')).toHaveCount(0);
    await expect(gamblingCard).toBeVisible();
    await expect(gamblingCard).toHaveClass(/is-observer/);
    await expect(gamblingCard).toContainText('Coinflip');
    await expect(gamblingCard).toContainText(/GOLD/);

    await observer.reload();
    await expect(observer.getByTestId('stream-hunt-rich-card').last()).toBeVisible();
    await expect(observer.getByTestId('stream-inventory-rich-card').last()).toBeVisible();
    await expect(observer.getByTestId('stream-gambling-rich-card').last()).toBeVisible();

    await command(owner, 'inventory');
    const ownerCard = owner.getByTestId('inventory-rich-card');
    await expect(ownerCard).toBeVisible();
    await expect(ownerCard.locator('button')).not.toHaveCount(0);
  } finally {
    await ownerContext.request.post('/api/party/leave').catch(() => {});
    await observerContext.request.post('/api/party/leave').catch(() => {});
    await ownerContext.close();
    await observerContext.close();
  }
});

test('shared gambling cards make win, loss, and push net Gold states semantic', async ({ page }) => {
  await page.addInitScript(() => { window.__THREADBOUND_FAST_TEST__ = true; });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('local-login-d').click();

  const now = Date.now();
  const entries = [
    {
      id: 'shared-gambling-win',
      kind: 'system',
      eventType: 'CoinflipPlayed',
      actorPlayerId: 'other-player',
      actorName: 'THREADBOUND',
      createdAt: new Date(now - 3000).toISOString(),
      metadata: { playerId: 'other-player', playerName: 'Peter', carriedGold: 20, flip: { wager: 5, payoutGold: 10, choice: 'heads', result: 'heads', outcome: 'win' } },
    },
    {
      id: 'shared-gambling-loss',
      kind: 'system',
      eventType: 'SlotsPlayed',
      actorPlayerId: 'other-player',
      actorName: 'THREADBOUND',
      createdAt: new Date(now - 2000).toISOString(),
      metadata: { playerId: 'other-player', playerName: 'Peter', carriedGold: 15, spin: { wager: 5, payoutGold: 0, reels: ['thread', 'ash', 'moon'], outcome: 'loss' } },
    },
    {
      id: 'shared-gambling-push',
      kind: 'system',
      eventType: 'BlackjackPlayed',
      actorPlayerId: 'other-player',
      actorName: 'THREADBOUND',
      createdAt: new Date(now - 1000).toISOString(),
      metadata: { playerId: 'other-player', playerName: 'Peter', carriedGold: 15, round: { status: 'resolved', wager: 5, payoutGold: 5, playerScore: 20, dealerScore: 20, outcome: 'push' } },
    },
  ];
  await page.route('**/api/stream*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ entries, hasMore: false, nextBefore: null }),
  }));
  await page.goto('/game');

  const cards = page.getByTestId('stream-gambling-rich-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0).locator('.stream-outcome-banner')).toHaveClass(/is-win/);
  await expect(cards.nth(0)).toContainText('+5 GOLD');
  await expect(cards.nth(0)).toContainText('Peter won');
  await expect(cards.nth(1).locator('.stream-outcome-banner')).toHaveClass(/is-loss/);
  await expect(cards.nth(1)).toContainText('−5 GOLD');
  await expect(cards.nth(1)).toContainText('Peter lost');
  await expect(cards.nth(2).locator('.stream-outcome-banner')).toHaveClass(/is-push/);
  await expect(cards.nth(2)).toContainText('±0 GOLD');
  await expect(cards.nth(2)).toContainText('Push');

  await page.reload();
  await expect(page.getByTestId('stream-gambling-rich-card')).toHaveCount(3);
  await expect(page.getByTestId('stream-gambling-rich-card').nth(0).locator('.stream-outcome-banner')).toHaveClass(/is-win/);
});
