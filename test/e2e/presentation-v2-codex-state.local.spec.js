import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('Codex state, search, category navigation, deep links, and empty recovery stay authoritative', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('local-login-a').click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  await page.getByTestId('nav-codex').click();
  await expect(page.getByTestId('codex-status')).not.toHaveText('Loading…');

  const apiResponse = await page.request.get('/api/codex?category=all');
  expect(apiResponse.ok()).toBe(true);
  const projection = await apiResponse.json();
  expect(projection.entries.length).toBeGreaterThan(0);
  expect(projection.counts).toMatchObject({ items: expect.any(Number), enemies: expect.any(Number), lore: expect.any(Number) });
  await expect(page.getByTestId('codex-count-lore')).toContainText(String(projection.counts.lore));

  const loreEntry = projection.entries.find((entry) => entry.category === 'lore');
  expect(loreEntry?.id).toBeTruthy();
  await page.getByTestId('codex-tab-lore').click();
  await expect(page.locator('[data-testid="codex-entry"][data-category="lore"]').first()).toBeVisible();
  await page.getByTestId('codex-search').fill(loreEntry.title);
  const matchingEntry = page.locator(`[data-testid="codex-entry"][data-category="lore"][data-entry-id="${loreEntry.id}"]`);
  await expect(matchingEntry).toHaveCount(1);
  await expect(page.getByTestId('codex-detail-title')).toHaveText(loreEntry.title);

  await matchingEntry.click();
  await expect(page.locator('body')).toHaveAttribute('data-codex-view', 'article');
  await expect(page.locator('.wiki-breadcrumbs')).toBeVisible();
  expect(page.url()).toContain(`#lore/${encodeURIComponent(loreEntry.id)}`);

  await page.reload();
  await expect(page.getByTestId('codex-status')).not.toHaveText('Loading…');
  await expect(page.locator('body')).toHaveAttribute('data-codex-view', 'article');
  await expect(page.getByTestId('codex-detail-title')).toHaveText(loreEntry.title);

  await page.getByRole('button', { name: 'Codex', exact: true }).click();
  await expect(page).toHaveURL(/\/codex$/);
  await expect(page.locator('body')).toHaveAttribute('data-codex-view', 'directory');
  await expect(page.getByTestId('codex-entry').first()).toBeVisible();

  await page.getByTestId('codex-search').fill('__no_such_codex_record__');
  await expect(page.getByTestId('codex-empty')).toBeVisible();
  await expect(page.getByTestId('codex-detail')).toContainText('Choose an entry');
  await page.getByTestId('codex-search').fill('');
  await expect(page.getByTestId('codex-entry').first()).toBeVisible();
});
