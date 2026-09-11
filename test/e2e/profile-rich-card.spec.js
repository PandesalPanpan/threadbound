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

async function dashboard(context) {
  const response = await context.request.get('/api/dashboard');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function openProfile(page) {
  await page.getByTestId('stream-message').fill('profile');
  await page.getByTestId('stream-send').click();
  const card = page.getByTestId('stream-command-card');
  await expect(card).toHaveAttribute('data-rich-card-kind', 'profile');
  await expect(card).toHaveAttribute('data-profile-rich-card', 'true');
  return card;
}

test('Profile rich card summarizes progression, resources, stats, loadout, Area and achievements in chat', async ({ page, context }) => {
  await login(page);
  const state = await dashboard(context);
  const card = await openProfile(page);

  await expect(card.getByTestId('profile-name')).toHaveText(state.character.displayName);
  await expect(card.getByTestId('profile-xp')).toContainText(`Level ${state.character.level}`);
  await expect(card.getByTestId('profile-gold')).toHaveText(String(state.character.gold));
  await expect(card.getByTestId('profile-banked-gold')).toHaveText('0');
  await expect(card.getByTestId('profile-area')).toHaveText('Not established');
  await expect(card.getByTestId('profile-achievement-count')).toHaveText(String(state.achievements.length));

  await expect(card.getByTestId('profile-stat-attack')).toHaveText(String(state.character.attack));
  await expect(card.getByTestId('profile-stat-defense')).toHaveText(String(state.character.defense));
  await expect(card.getByTestId('profile-stat-max-hp')).toHaveText(String(state.character.maxHp));
  await expect(card.getByTestId('profile-stat-speed')).toHaveText(String(state.character.speed));
  await expect(card.getByTestId('profile-stat-crit')).toHaveText(`${state.character.critChancePercent}%`);

  for (const slot of ['weapon', 'helmet', 'armor', 'boots', 'accessory']) {
    const expected = state.character.equipment[slot]?.name || 'Empty';
    await expect(card.getByTestId(`profile-slot-${slot}`)).toContainText(expected);
  }

  await expect(card.getByRole('img', { name: state.character.displayName })).toBeVisible();
  await expect(card).not.toContainText(/Thread Dust|Relic Pouch|Temper/);
  const metrics = await card.evaluate((element) => {
    const dismiss = element.querySelector('[data-rich-card-dismiss="true"]');
    const rect = dismiss?.getBoundingClientRect();
    return { width: element.scrollWidth, dismissHeight: rect?.height || 0, dismissWidth: rect?.width || 0 };
  });
  expect(metrics.width).toBeLessThanOrEqual(390);
  expect(metrics.dismissHeight).toBeGreaterThanOrEqual(44);
  expect(metrics.dismissWidth).toBeGreaterThanOrEqual(44);

  mkdirSync(REVIEW_DIR, { recursive: true });
  await page.screenshot({ path: `${REVIEW_DIR}/profile-rich-card-mobile.png`, fullPage: true });
});
