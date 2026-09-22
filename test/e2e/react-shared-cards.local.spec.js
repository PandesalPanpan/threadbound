import { test, expect } from '@playwright/test';

async function login(page, slot) {
  await page.goto('/');
  await page.getByTestId(`local-login-${slot}`).click();
  await page.context().request.post('/api/party/leave');
  await page.goto('/game');
  await expect(page.getByTestId('stream-connection')).toHaveText(/LIVE/);
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

    // Reload both clients from the authoritative stream after the direct HTTP
    // commands. This also proves the replay is a durable shared projection,
    // not an actor-only response held in one browser.
    await owner.reload();
    await expect(owner.getByTestId('stream-connection')).toHaveText(/LIVE/);
    await observer.goto('/game');
    await expect(observer.getByTestId('stream-connection')).toHaveText(/LIVE/);
    const ownerHunt = owner.getByTestId('stream-hunt-rich-card').last();
    const huntCard = observer.getByTestId('stream-hunt-rich-card').last();
    await expect(ownerHunt).toHaveClass(/is-owner/);
    const inventoryCard = observer.getByTestId('stream-inventory-rich-card').last();
    const gamblingCard = observer.getByTestId('stream-gambling-rich-card').last();
    await expect(ownerHunt.getByTestId('shared-battle-surface')).toBeVisible();
    await expect(huntCard).toBeVisible();
    await expect(huntCard).toHaveClass(/is-observer/);
    await expect(huntCard.getByTestId('shared-battle-surface')).toBeVisible();
    expect(await ownerHunt.getByTestId('shared-battle-surface').getAttribute('data-replay-battle-id')).toBe(
      await huntCard.getByTestId('shared-battle-surface').getAttribute('data-replay-battle-id'),
    );
    await expect(inventoryCard).toBeVisible();
    await expect(inventoryCard).toHaveClass(/is-observer/);
    await expect(inventoryCard.locator('.stream-item-tile__actions')).toHaveCount(0);
    await expect(gamblingCard).toBeVisible();
    await expect(gamblingCard).toHaveClass(/is-observer/);
    await expect(gamblingCard).toContainText('Coinflip');
    await expect(gamblingCard).toContainText(/GOLD/);

    await observer.reload();
    await expect(observer.getByTestId('stream-hunt-rich-card').last()).toBeVisible();
    await expect(observer.getByTestId('stream-inventory-rich-card').last()).toBeVisible();
    await expect(observer.getByTestId('stream-gambling-rich-card').last()).toBeVisible();

    await command(owner, 'inventory');
    const ownerCard = owner.getByTestId('stream-inventory-rich-card').last();
    await expect(ownerCard).toBeVisible();
    await expect(ownerCard.getByRole('button', { name: /Heal/ })).toBeVisible();
  } finally {
    await ownerContext.request.post('/api/party/leave').catch(() => {});
    await observerContext.request.post('/api/party/leave').catch(() => {});
    await ownerContext.close();
    await observerContext.close();
  }
});

test('owner and spectator share the same Blackjack table and public Dungeon replay', async ({ browser }) => {
  const ownerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const observerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const owner = await ownerContext.newPage();
  const observer = await observerContext.newPage();

  try {
    await login(owner, 'a');
    await login(observer, 'b');
    await ownerContext.request.post('/api/party/leave');
    await observerContext.request.post('/api/party/leave');

    // Local profiles start with no carried Gold. The Hunt is authoritative setup
    // for the wager and also gives both viewers a public shared combat surface.
    const hunt = await ownerContext.request.post('/api/hunt');
    expect(hunt.ok()).toBe(true);

    let blackjack = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await ownerContext.request.post('/api/gambling/blackjack', {
        headers: { 'Idempotency-Key': `react-shared-blackjack-deal-${attempt}-0001` },
        data: { wager: 1 },
      });
      expect(response.ok()).toBe(true);
      blackjack = await response.json();
      if (blackjack.blackjack?.round?.status === 'active') break;
    }
    expect(blackjack?.blackjack?.round?.status).toBe('active');
    const roundId = blackjack.blackjack.round.id;

    // The command is intentionally issued through the owner context request
    // helper. Reload the spectator once so this assertion is deterministic even
    // if its WebSocket handshake was still in flight when the receipt broadcast.
    await observer.reload();

    const ownerTable = owner.getByTestId('stream-gambling-rich-card').last();
    const observerTable = observer.getByTestId('stream-gambling-rich-card').last();
    await expect(ownerTable.getByTestId('shared-blackjack-active')).toBeVisible();
    await expect(observerTable.getByTestId('shared-blackjack-active')).toBeVisible();
    await expect(ownerTable).toHaveClass(/is-owner/);
    await expect(observerTable).toHaveClass(/is-observer/);
    await expect(ownerTable.getByTestId('shared-blackjack-hit')).toBeVisible();
    await expect(ownerTable.getByTestId('shared-blackjack-stand')).toBeVisible();
    await expect(observerTable.getByTestId('shared-blackjack-hit')).toHaveCount(0);
    await expect(observerTable.getByTestId('shared-blackjack-stand')).toHaveCount(0);
    await expect(observerTable.getByTestId('shared-blackjack-dealer-card-hidden-0')).toBeVisible();
    await expect(observerTable.locator('[data-card-code]')).toHaveCount(3);
    expect(await ownerTable.getByTestId('shared-blackjack-active').getAttribute('data-round-id')).toBe(roundId);

    const cardsBefore = await ownerTable.locator('[data-testid^="shared-blackjack-player-card-"]').count();
    await ownerTable.getByTestId('shared-blackjack-hit').click();
    await expect.poll(async () => observer.getByTestId('stream-gambling-rich-card').last().getByTestId(/shared-blackjack-(active|result)/).count()).toBe(1);
    const updatedOwnerTable = owner.getByTestId('stream-gambling-rich-card').last();
    const updatedObserverTable = observer.getByTestId('stream-gambling-rich-card').last();
    await expect(updatedOwnerTable.locator('[data-testid^="shared-blackjack-player-card-"]')).toHaveCount(cardsBefore + 1);
    await expect(updatedObserverTable.locator('[data-testid^="shared-blackjack-player-card-"]')).toHaveCount(cardsBefore + 1);
    expect(await updatedOwnerTable.locator('[data-card-code]').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-card-code')))).toEqual(
      await updatedObserverTable.locator('[data-card-code]').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-card-code'))),
    );
    await expect(updatedObserverTable.getByTestId('shared-blackjack-dealer-card-hidden-0')).toHaveCount((await updatedObserverTable.getByTestId('shared-blackjack-active').count()) ? 1 : 0);

    if (await updatedOwnerTable.getByTestId('shared-blackjack-active').count()) {
      await updatedOwnerTable.getByTestId('shared-blackjack-stand').click();
      await expect(owner.getByTestId('stream-gambling-rich-card').last().getByTestId('shared-blackjack-result')).toBeVisible();
      await expect(observer.getByTestId('stream-gambling-rich-card').last().getByTestId('shared-blackjack-result')).toBeVisible();
      await expect(observer.getByTestId('stream-gambling-rich-card').last().getByTestId('shared-blackjack-dealer-card-hidden-0')).toHaveCount(0);
    }

    await command(owner, 'status');
    await expect(owner.getByTestId('stream-player-status').last()).toHaveClass(/is-owner/);
    await expect(observer.getByTestId('stream-player-status').last()).toHaveClass(/is-observer/);
    await expect(observer.getByTestId('stream-player-status').last()).toContainText('Local Weaver A');

    await command(owner, 'inventory');
    const ownerInventory = owner.getByTestId('stream-inventory-rich-card').last();
    const observerInventory = observer.getByTestId('stream-inventory-rich-card').last();
    await expect(ownerInventory).toHaveClass(/is-owner/);
    await expect(observerInventory).toHaveClass(/is-observer/);
    await expect(ownerInventory.getByRole('button', { name: /Heal/ })).toBeVisible();
    await expect(observerInventory.getByRole('button', { name: /Heal/ })).toHaveCount(0);

    await command(owner, 'shop');
    const ownerShop = owner.getByTestId('stream-shop-rich-card').last();
    const observerShop = observer.getByTestId('stream-shop-rich-card').last();
    await expect(ownerShop).toHaveClass(/is-owner/);
    await expect(observerShop).toHaveClass(/is-observer/);
    await expect(ownerShop.getByTestId('stream-shop-item').first()).toBeVisible();
    await expect(observerShop.getByTestId('stream-shop-item').first()).toBeVisible();
    const ownerShopItem = ownerShop.getByTestId('stream-shop-item').first();
    const observerShopItem = observerShop.getByTestId('stream-shop-item').first();
    const ownerInspectButton = ownerShopItem.getByRole('button', { name: /Inspect/ });
    const observerInspectButton = observerShopItem.getByRole('button', { name: /Inspect/ });
    await ownerInspectButton.focus();
    await expect(ownerInspectButton).toHaveAttribute('aria-expanded', 'false');
    await expect(ownerShopItem.getByRole('tooltip')).toBeVisible();
    await observerInspectButton.focus();
    await expect(observerShopItem.getByRole('tooltip')).toBeVisible();
    await ownerShop.getByTestId('stream-shop-item').first().click();
    await expect(ownerShop.locator('.stream-item-tile__actions')).toHaveCount(1);
    await expect(observerShop.locator('.stream-item-tile__actions')).toHaveCount(0);

    const startDungeon = await ownerContext.request.post('/api/dungeons/frayed-hollow/start-shared');
    expect(startDungeon.ok()).toBe(true);
    const startPayload = await startDungeon.json();
    expect(startPayload.battleReplay).toBeTruthy();
    const ownerDungeon = owner.getByTestId('stream-dungeon-rich-card').last();
    const observerDungeon = observer.getByTestId('stream-dungeon-rich-card').last();
    await expect(ownerDungeon.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete', { timeout: 20000 });
    await expect(observerDungeon.getByTestId('shared-battle-surface')).toHaveAttribute('data-replay-state', 'complete', { timeout: 20000 });
    await expect(ownerDungeon.getByTestId('stream-run-continue')).toBeVisible();
    await expect(ownerDungeon.getByTestId('stream-run-potion')).toBeVisible();
    await expect(ownerDungeon.getByTestId('stream-run-retreat')).toBeVisible();
    await expect(observerDungeon.getByTestId('stream-run-continue')).toHaveCount(0);
    await expect(observerDungeon.getByTestId('stream-run-potion')).toHaveCount(0);
    await expect(observerDungeon.getByTestId('stream-run-retreat')).toHaveCount(0);
    await expect(owner.getByTestId('stream-context-continue')).toHaveCount(0);
    await expect(owner.getByTestId('stream-context-status')).toBeVisible();
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
