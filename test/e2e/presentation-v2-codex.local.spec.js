import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const REVIEW_DIR = 'test-results/presentation-v2';

async function login(page) {
  await page.goto('/');
  await page.getByTestId('local-login-a').click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
}

async function screenshot(page, name) {
  mkdirSync(REVIEW_DIR, { recursive: true });
  await page.waitForTimeout(180);
  await page.screenshot({ path: `${REVIEW_DIR}/${name}.png`, fullPage: false });
}

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('mobile Codex directory and article preserve authoritative records in the Figma hierarchy', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-codex').click();
  await expect(page).toHaveURL(/\/codex(?:#|$)/);
  await expect(page.getByRole('heading', { name: 'Codex', exact: true })).toBeVisible();
  await expect(page.getByText('Everything the world has revealed so far.')).toBeVisible();
  await expect(page.getByTestId('codex-search')).toBeVisible();

  for (const category of ['all', 'items', 'enemies', 'bosses', 'lore', 'more', 'achievements', 'history']) {
    await expect(page.getByTestId(`codex-tab-${category}`)).toBeVisible();
  }
  await expect(page.getByTestId('codex-count-items')).toContainText('Items');
  await expect(page.getByTestId('codex-count-history')).toContainText('History');

  const entries = page.getByTestId('codex-entry');
  await expect(entries.first()).toBeVisible();
  await expect(entries.first().locator('.entry-icon')).toBeVisible();
  await expect(entries.first().locator('.entry-meta')).toBeVisible();
  await expect(entries.first().locator('.entry-chevron')).toHaveText('›');
  await screenshot(page, 'codex-directory-390x844');

  await page.getByTestId('codex-tab-more').click();
  await expect(page.locator('#codex-tabs')).toHaveClass(/more-open/);

  await page.getByTestId('codex-entry').first().click();
  await expect(page.locator('.wiki-breadcrumbs')).toBeVisible();
  await expect(page.getByTestId('codex-detail-title')).toBeVisible();
  await expect(page.locator('.wiki-infobox')).toContainText('RECORD');
  await expect(page.locator('.wiki-contents')).toContainText('1 Overview');
  await expect(page.locator('#codex-overview')).toBeVisible();
  await expect(page.locator('#codex-related')).toBeVisible();
  await expect(page.locator('#codex-history')).toBeVisible();
  await screenshot(page, 'codex-article-390x844');
});
