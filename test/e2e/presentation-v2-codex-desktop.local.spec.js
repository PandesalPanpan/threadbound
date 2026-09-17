import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const REVIEW_DIR = 'test-results/presentation-v2';

test.use({ viewport: { width: 1440, height: 960 }, hasTouch: false, isMobile: false });

test('desktop Codex workspace keeps category rail, directory, and article in one read-only surface', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('local-login-a').click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  await page.getByTestId('nav-codex').click();
  await expect(page.getByTestId('codex-status')).not.toHaveText('Loading…');

  await expect(page.getByRole('heading', { name: 'Codex', exact: true })).toBeVisible();
  await expect(page.getByTestId('codex-search')).toBeVisible();
  await expect(page.locator('#codex-category-rail')).toBeVisible();
  await expect(page.locator('#codex-list')).toBeVisible();
  await expect(page.getByTestId('codex-detail')).toBeVisible();
  await expect(page.locator('.codex-rail-item')).toHaveCount(7);
  await expect(page.locator('.codex-list .codex-list-note')).toContainText('history records');
  await expect(page.locator('.wiki-article-body')).toBeVisible();

  const columns = await page.locator('.codex-layout').evaluate((element) => {
    const boxes = [...element.children].map((child) => {
      const rect = child.getBoundingClientRect();
      return { left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) };
    });
    return boxes;
  });
  expect(columns).toHaveLength(3);
  expect(columns[0].width).toBeGreaterThanOrEqual(200);
  expect(columns[1].width).toBeGreaterThanOrEqual(340);
  expect(columns[2].width).toBeGreaterThanOrEqual(700);
  expect(columns[0].height).toBe(700);

  await page.getByTestId('codex-rail-lore').click();
  await expect(page.getByTestId('codex-rail-lore')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-testid="codex-entry"][data-category="lore"]').first()).toBeVisible();
  await expect(page.getByTestId('codex-detail-title')).toBeVisible();

  mkdirSync(REVIEW_DIR, { recursive: true });
  await page.waitForTimeout(180);
  await page.screenshot({ path: `${REVIEW_DIR}/codex-desktop-1440x960.png`, fullPage: false });
});
