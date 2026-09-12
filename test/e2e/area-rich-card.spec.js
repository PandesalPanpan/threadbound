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

async function openArea(page) {
  await page.getByTestId('stream-message').fill('area');
  await page.getByTestId('stream-send').click();
  const card = page.getByTestId('stream-command-card');
  await expect(card).toHaveAttribute('data-rich-card-kind', 'area');
  await expect(card).toHaveAttribute('data-area-rich-card', 'true');
  return card;
}

function areaProjection(currentAreaNumber) {
  return {
    area: {
      currentArea: { id: `area-${currentAreaNumber}`, number: currentAreaNumber, name: `Area ${currentAreaNumber}` },
      highestUnlockedArea: { id: 'area-3', number: 3, name: 'Area 3' },
      currentAreaNumber,
      highestUnlockedAreaNumber: 3,
      areas: [1, 2, 3].map((number) => ({
        id: `area-${number}`,
        number,
        name: `Area ${number}`,
        current: number === currentAreaNumber,
        unlocked: true,
      })),
    },
  };
}

test('Area rich card keeps travel in the Adventure Stream and only offers authoritative unlocked Areas', async ({ page, context }) => {
  await login(page);

  const areaResponse = await context.request.get('/api/areas');
  expect(areaResponse.ok()).toBe(true);
  const initial = await areaResponse.json();
  expect(initial.area.currentArea.name).toBe('Area 1');
  expect(initial.area.highestUnlockedArea.name).toBe('Area 1');
  expect(initial.area.areas).toHaveLength(1);

  const card = await openArea(page);
  await expect(card.getByTestId('area-current')).toHaveText('Area 1');
  await expect(card.getByTestId('area-highest-unlocked')).toHaveText('Area 1');
  await expect(card.getByTestId('area-row-1')).toContainText('You are here now.');
  await expect(card.getByTestId('area-travel-1')).toHaveText('Current');
  await expect(card.getByTestId('area-travel-1')).toBeDisabled();
  await expect(card.getByTestId('area-row-2')).toHaveCount(0);
  await expect(card).not.toContainText(/Thread Dust|Relic Pouch|Temper/);

  const bypass = await context.request.post('/api/areas/2/travel');
  expect(bypass.status()).toBe(409);
  expect(await bypass.json()).toMatchObject({ error: 'area_locked' });

  const after = await context.request.get('/api/areas');
  expect(after.ok()).toBe(true);
  expect((await after.json()).area.currentArea.name).toBe('Area 1');

  const metrics = await page.evaluate(() => {
    const cardElement = document.querySelector('[data-testid="stream-command-card"]');
    const dismiss = cardElement?.querySelector('[data-rich-card-dismiss="true"]');
    const current = cardElement?.querySelector('[data-testid="area-travel-1"]');
    const nav = document.querySelector('.threadbound-topnav');
    const cardRect = cardElement?.getBoundingClientRect();
    const dismissRect = dismiss?.getBoundingClientRect();
    const currentRect = current?.getBoundingClientRect();
    const navRect = nav?.getBoundingClientRect();
    return {
      width: cardElement?.scrollWidth || 0,
      cardTop: cardRect?.top || 0,
      navBottom: navRect?.bottom || 0,
      dismissHeight: dismissRect?.height || 0,
      dismissWidth: dismissRect?.width || 0,
      currentHeight: currentRect?.height || 0,
    };
  });
  expect(metrics.width).toBeLessThanOrEqual(390);
  expect(metrics.cardTop).toBeGreaterThanOrEqual(metrics.navBottom);
  expect(metrics.dismissHeight).toBeGreaterThanOrEqual(44);
  expect(metrics.dismissWidth).toBeGreaterThanOrEqual(44);
  expect(metrics.currentHeight).toBeGreaterThanOrEqual(44);

  mkdirSync(REVIEW_DIR, { recursive: true });
  await page.screenshot({ path: `${REVIEW_DIR}/area-rich-card-mobile.png`, fullPage: true });
});

test('Area rich card keeps every previously unlocked Area selectable while revisiting older locations', async ({ page }) => {
  let currentAreaNumber = 3;
  const travels = [];

  await page.route('**/api/areas', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(areaProjection(currentAreaNumber)) });
  });
  await page.route(/\/api\/areas\/(\d+)\/travel$/, async (route) => {
    const target = Number(new URL(route.request().url()).pathname.split('/').at(-2));
    travels.push(target);
    currentAreaNumber = target;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(areaProjection(currentAreaNumber)) });
  });

  await login(page);
  const card = await openArea(page);
  await expect(card.getByTestId('area-current')).toHaveText('Area 3');
  await expect(card.getByTestId('area-highest-unlocked')).toHaveText('Area 3');
  await expect(card.getByTestId('area-travel-1')).toBeEnabled();
  await expect(card.getByTestId('area-travel-2')).toBeEnabled();
  await expect(card.getByTestId('area-travel-3')).toBeDisabled();

  await card.getByTestId('area-travel-1').click();
  await expect(card.getByTestId('area-current')).toHaveText('Area 1');
  await expect(card.getByTestId('area-highest-unlocked')).toHaveText('Area 3');
  await expect(card.getByTestId('area-travel-2')).toBeEnabled();
  await expect(card.getByTestId('area-travel-3')).toBeEnabled();

  await card.getByTestId('area-travel-2').click();
  await expect(card.getByTestId('area-current')).toHaveText('Area 2');
  await expect(card.getByTestId('area-highest-unlocked')).toHaveText('Area 3');

  await card.getByTestId('area-travel-3').click();
  await expect(card.getByTestId('area-current')).toHaveText('Area 3');
  expect(travels).toEqual([1, 2, 3]);
});
