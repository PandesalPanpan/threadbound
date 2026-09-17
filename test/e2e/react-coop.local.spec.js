import { test, expect } from '@playwright/test';

async function login(page, slot) {
  await page.goto('/');
  await page.getByTestId(`local-login-${slot}`).click();
  await page.goto('/game');
  await expect(page.getByTestId('stream-connection')).toHaveText(/LIVE/);
}

async function dashboard(context) {
  const response = await context.request.get('/api/dashboard');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function command(page, value) {
  const composer = page.getByTestId('stream-message');
  await composer.fill(value);
  await composer.press('Enter');
}

test('React co-op party updates the other Adventure Stream through realtime state', async ({ browser }) => {
  const contextA = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const contextB = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await login(pageA, 'a');
    await login(pageB, 'b');
    const bPlayerId = (await dashboard(contextB)).character.id;
    await contextA.request.post('/api/party/leave');
    await contextB.request.post('/api/party/leave');

    await command(pageA, 'party');
    const partyA = pageA.getByTestId('stream-command-card');
    await partyA.getByRole('button', { name: 'Create Party' }).click();
    await expect(partyA.getByRole('button', { name: 'Leave Party' })).toBeVisible();
    const created = await dashboard(contextA);
    expect(created.party?.joinCode).toBeTruthy();

    await command(pageB, 'party');
    const partyB = pageB.getByTestId('stream-command-card');
    await partyB.getByTestId('party-join-code').fill(created.party.joinCode);
    await partyB.getByRole('button', { name: 'Join' }).click();
    await expect(partyB.getByRole('button', { name: 'Leave Party' })).toBeVisible();

    await expect.poll(async () => {
      const state = await dashboard(contextA);
      return state.party?.members?.some((member) => member.playerId === bPlayerId) || false;
    }, { timeout: 7000 }).toBe(true);
    const memberB = partyA.getByTestId(`party-member-${bPlayerId}`);
    await expect.poll(async () => memberB.count(), { timeout: 7000 }).toBe(1);
    await expect(memberB).toContainText('Local Weaver B');

    await partyB.getByRole('button', { name: 'Ready Up' }).click();
    await expect.poll(async () => {
      const state = await dashboard(contextA);
      return state.party?.members?.find((member) => member.playerId === bPlayerId)?.ready || false;
    }, { timeout: 7000 }).toBe(true);
    await expect(memberB).toContainText('Ready');
  } finally {
    await contextA.request.post('/api/party/leave').catch(() => {});
    await contextB.request.post('/api/party/leave').catch(() => {});
    await contextA.close();
    await contextB.close();
  }
});
