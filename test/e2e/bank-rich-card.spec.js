import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const REVIEW_DIR = 'ux-review';
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function login(page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Connect with Threaded' }).click();
  await expect(page.getByRole('heading', { name: 'Fake Threaded' })).toBeVisible();
  await page.getByRole('button', { name: 'Authorize Threadbound' }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
}

async function shop(context) {
  const response = await context.request.get('/api/shop');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function dashboard(context) {
  const response = await context.request.get('/api/dashboard');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function earnGold(context) {
  const before = await dashboard(context);
  expect((await context.request.post('/api/hunt')).ok()).toBe(true);
  const after = await dashboard(context);
  expect(after.character.gold).toBeGreaterThan(before.character.gold);
  return after;
}

async function openBank(page) {
  await page.getByTestId('stream-message').fill('bank');
  await page.getByTestId('stream-send').click();
  const card = page.getByTestId('stream-command-card');
  await expect(card).toHaveAttribute('data-rich-card-kind', 'bank');
  await expect(card).toHaveAttribute('data-bank-rich-card', 'true');
  return card;
}

test('Bank rich card moves Gold atomically between carried and protected balances and records the action in chat', async ({ page, context }) => {
  await login(page);
  await earnGold(context);
  const before = (await shop(context)).bank;
  const depositAmount = Math.min(10, before.carriedGold);
  const withdrawalAmount = Math.min(4, depositAmount);
  expect(depositAmount).toBeGreaterThan(0);
  const card = await openBank(page);
  await expect(card.getByTestId('bank-carried-gold')).toHaveText(`${before.carriedGold} Gold`);
  await expect(card.getByTestId('bank-banked-gold')).toHaveText(`${before.bankedGold} Gold`);

  await card.getByTestId('bank-amount').fill(String(depositAmount));
  await card.getByTestId('bank-deposit').click();
  await expect.poll(async () => (await shop(context)).bank.bankedGold).toBe(before.bankedGold + depositAmount);
  let balance = (await shop(context)).bank;
  expect(balance.carriedGold).toBe(before.carriedGold - depositAmount);
  await expect(page.getByTestId('adventure-stream-log')).toContainText(`Deposited ${depositAmount} Gold into the Bank`);

  const refreshed = await openBank(page);
  await refreshed.getByTestId('bank-amount').fill(String(withdrawalAmount));
  await refreshed.getByTestId('bank-withdraw').click();
  await expect.poll(async () => (await shop(context)).bank.bankedGold).toBe(before.bankedGold + depositAmount - withdrawalAmount);
  balance = (await shop(context)).bank;
  expect(balance.carriedGold).toBe(before.carriedGold - depositAmount + withdrawalAmount);
  await expect(page.getByTestId('adventure-stream-log')).toContainText(`Withdrew ${withdrawalAmount} Gold from the Bank`);

  const finalCard = await openBank(page);
  await expect(finalCard).not.toContainText(/Thread Dust|Honey/);
  const metrics = await finalCard.evaluate((element) => ({ width: element.scrollWidth, buttons: [...element.querySelectorAll('button')].map((button) => button.getBoundingClientRect().height) }));
  expect(metrics.width).toBeLessThanOrEqual(390);
  for (const height of metrics.buttons) expect(height).toBeGreaterThanOrEqual(44);

  mkdirSync(REVIEW_DIR, { recursive: true });
  await page.screenshot({ path: `${REVIEW_DIR}/bank-rich-card-mobile.png`, fullPage: true });
});
