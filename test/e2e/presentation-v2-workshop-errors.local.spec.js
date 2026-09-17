import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function openWorkshop(page) {
  await page.goto('/');
  await page.getByTestId('local-login-a').click();
  await page.goto('/arc-workshop');
}

test('Workshop surfaces malformed JSON and keeps the draft action disabled', async ({ page }) => {
  await openWorkshop(page);
  await page.getByTestId('manifest-editor').fill('{"manifestVersion": 2,');
  await page.getByTestId('validate-manifest').click();

  await expect(page.locator('.workshop-shell')).toHaveAttribute('data-workshop-view', 'review');
  const validation = page.getByTestId('validation-result');
  await expect(validation).toContainText('Manifest needs changes');
  await expect(validation).toContainText('JSON parsing failed');
  await expect(page.getByTestId('save-manifest')).toBeDisabled();
  await expect(page.getByTestId('workshop-status')).toContainText('JSON parsing failed');
});

test('Workshop surfaces authoritative v2 validation errors without saving invalid content', async ({ page }) => {
  await openWorkshop(page);
  const manifest = JSON.parse(await readFile('examples/arc-manifest-vnext.example.json', 'utf8'));
  manifest.towns[0].areaId = 'missing-area';
  await page.getByTestId('manifest-editor').fill(JSON.stringify(manifest));
  await page.getByTestId('validate-manifest').click();

  const validation = page.getByTestId('validation-result');
  await expect(validation).toContainText('Manifest needs changes');
  await expect(validation.getByRole('heading', { name: '✕ Manifest needs changes' })).toBeVisible();
  await expect(validation).toContainText(/\d+ errors/);
  await expect(validation).toContainText('Errors ·');
  await expect(page.getByTestId('save-manifest')).toBeDisabled();
});
