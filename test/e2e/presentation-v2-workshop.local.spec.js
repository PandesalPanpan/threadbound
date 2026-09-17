import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('Workshop v2 moves from mobile editor to authoritative review state', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('local-login-a').click();
  await page.goto('/arc-workshop');

  const shell = page.locator('.workshop-shell');
  await expect(page.getByRole('heading', { name: 'Arc Workshop' })).toBeVisible();
  await expect(page.getByText('LOCAL DEV ONLY')).toBeVisible();
  await expect(page.getByTestId('manifest-editor')).toBeVisible();
  await expect(page.getByTestId('validate-manifest')).toBeVisible();
  await expect(shell).toHaveAttribute('data-workshop-view', 'editor');

  const editorWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(editorWidth).toBeLessThanOrEqual(390);
  await mkdir('ux-review', { recursive: true });

  await page.getByTestId('manifest-file').setInputFiles('examples/arc-manifest-vnext.example.json');
  await expect(page.getByTestId('manifest-preview')).toContainText('Sunpetal Crossing');
  await page.screenshot({ path: 'ux-review/arc-workshop-v2-editor-mobile.png', fullPage: true });
  await page.getByTestId('validate-manifest').click();

  await expect(shell).toHaveAttribute('data-workshop-view', 'review');
  await expect(page.getByTestId('manifest-editor')).toBeHidden();
  await expect(page.locator('#workshop-page-title')).toHaveText('Sunpetal Crossing');
  await expect(page.getByTestId('validation-result')).toContainText('Manifest is valid');
  await expect(page.getByTestId('manifest-version')).toHaveText('v2 · world package');
  await expect(page.getByTestId('save-manifest')).toBeVisible();

  const reviewWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(reviewWidth).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'ux-review/arc-workshop-v2-review-mobile.png', fullPage: true });
});
