import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('Arc Workshop previews and validates a vNext world package clearly', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('local-login-a').click();
  await page.getByTestId('nav-workshop').click();
  await expect(page).toHaveURL(/\/arc-workshop$/);

  await page.getByTestId('manifest-file').setInputFiles('examples/arc-manifest-vnext.example.json');

  const preview = page.getByTestId('manifest-preview');
  await expect(page.getByTestId('manifest-version')).toHaveText('v2 · world package');
  await expect(preview).toContainText('Sunpetal Crossing');
  await expect(preview).toContainText('World package');

  const world = page.getByTestId('vnext-world-preview');
  await expect(world).toContainText('1Areas');
  await expect(world).toContainText('1Towns');
  await expect(world).toContainText('1NPCs');
  await expect(world).toContainText('1Quests');
  await expect(world).toContainText('1Shops');
  await expect(world).toContainText('2Recipes');
  await expect(world).toContainText('1Progression challenges');
  await expect(world).toContainText('Sunpetal Road');
  await expect(world).toContainText('Petalrest');
  await expect(world).toContainText('Mina');
  await expect(world).toContainText('Meet the Smith');
  await expect(world).toContainText('Petalrest Outfitters');
  await expect(world).toContainText('Helm Forging');
  await expect(world).toContainText('Petal Stew');
  await expect(world).toContainText('sunpetal-gate');
  await expect(world).toContainText('revalidated server-side');

  await page.getByTestId('validate-manifest').click();
  const validation = page.getByTestId('validation-result');
  await expect(validation).toContainText('Manifest is valid');
  await expect(validation).toContainText('v2 · world package');
  await expect(validation).toContainText('0 errors');
  await expect(page.getByTestId('save-manifest')).toBeEnabled();

  const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(bodyWidth).toBeLessThanOrEqual(390);
  await mkdir('ux-review', { recursive: true });
  await page.screenshot({ path: 'ux-review/arc-workshop-vnext-mobile.png', fullPage: true });

  await page.getByTestId('save-manifest').click();
  await expect(page.getByTestId('workshop-status')).toContainText(/Saved Sunpetal Crossing revision \d+ as a draft/);
  const list = page.getByTestId('manifest-list');
  await expect(list).toContainText('Sunpetal Crossing');
  await expect(list).toContainText('draft');
  await expect(list).toContainText('v2 · world package');
});
