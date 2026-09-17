import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 960 } });

test('Workshop v2 desktop keeps editor, impact, review, and drafts in one bounded workspace', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('local-login-a').click();
  await page.goto('/arc-workshop');

  await page.getByTestId('manifest-file').setInputFiles('examples/arc-manifest-vnext.example.json');
  const editor = page.locator('#workshop-editor-view');
  const editorImpact = page.locator('#editor-impact-view');
  await expect(editor).toBeVisible();
  await expect(editorImpact).toBeVisible();
  await expect(editor.getByRole('heading', { name: '1 · Upload or paste' })).toBeVisible();
  await expect(editorImpact).toContainText('Sunpetal Crossing');

  const editorBox = await editor.boundingBox();
  const impactBox = await editorImpact.boundingBox();
  expect(editorBox?.width).toBeGreaterThanOrEqual(750);
  expect(impactBox?.width).toBeGreaterThanOrEqual(570);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  await mkdir('ux-review', { recursive: true });
  await page.screenshot({ path: 'ux-review/arc-workshop-v2-editor-desktop.png', fullPage: true });

  await page.getByTestId('validate-manifest').click();
  const review = page.locator('#workshop-review-view');
  await expect(review).toBeVisible();
  await expect(page.locator('.workshop-review-package')).toBeVisible();
  await expect(page.getByTestId('manifest-list')).toBeVisible();
  await expect(page.locator('.workshop-human-guidance')).toBeVisible();
  await expect(page.getByTestId('validation-result')).toContainText('Manifest is valid');
  await expect(page.getByTestId('save-manifest')).toBeVisible();

  await page.getByTestId('save-manifest').click();
  await expect(page.getByTestId('workshop-status')).toContainText(/Saved Sunpetal Crossing revision \d+ as a draft/);
  await expect(page.locator('#review-publish')).toBeVisible();
  await page.screenshot({ path: 'ux-review/arc-workshop-v2-review-desktop.png', fullPage: true });

  await page.locator('#review-publish').click();
  await expect(page.getByTestId('workshop-status')).toContainText(/Published Sunpetal Crossing revision \d+/);
  await expect(page.getByTestId('manifest-list')).toContainText('PUBLISHED');
  await expect(page.locator('#review-publish')).toBeHidden();
});
