import { test, expect } from '@playwright/test';

test('external Arc Manifest can be uploaded, validated, published, played, and documented', async ({ page, context }) => {
  await page.goto('/');
  await page.getByTestId('local-login-a').click();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');

  await page.getByTestId('nav-workshop').click();
  await expect(page).toHaveURL(/\/arc-workshop$/);
  await expect(page.getByRole('heading', { name: 'Arc Workshop' })).toBeVisible();
  await expect(page.getByText('No paid AI API required.')).toBeVisible();

  const contextDownloadPromise = page.waitForEvent('download');
  await page.getByTestId('download-world-context').click();
  const contextDownload = await contextDownloadPromise;
  expect(contextDownload.suggestedFilename()).toBe('threadbound-world-context.json');

  const schemaDownloadPromise = page.waitForEvent('download');
  await page.getByTestId('download-manifest-schema').click();
  const schemaDownload = await schemaDownloadPromise;
  expect(schemaDownload.suggestedFilename()).toBe('threadbound-arc-manifest.schema.json');

  await page.getByTestId('manifest-file').setInputFiles('examples/arc-manifest.example.json');
  await expect(page.getByTestId('manifest-preview')).toContainText('The Ashen Thread');
  await expect(page.getByTestId('manifest-preview')).toContainText('Cinder Vault');

  await page.getByTestId('validate-manifest').click();
  await expect(page.getByTestId('validation-result')).toContainText('Manifest is valid');
  await expect(page.getByTestId('validation-result')).toContainText('0 errors');
  await expect(page.getByTestId('save-manifest')).toBeEnabled();

  await page.getByTestId('save-manifest').click();
  const savedStatus = page.getByTestId('workshop-status');
  await expect(savedStatus).toContainText(/Saved The Ashen Thread revision \d+ as a draft/);
  const revisionMatch = (await savedStatus.textContent())?.match(/revision (\d+)/);
  expect(revisionMatch).not.toBeNull();
  const revision = revisionMatch[1];
  await expect(page.getByTestId('manifest-list')).toContainText('draft');

  await page.getByTestId('manifest-list').getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByTestId('workshop-status')).toContainText(`Published The Ashen Thread revision ${revision}`);
  await expect(page.getByTestId('manifest-list')).toContainText('published');

  await page.getByTestId('nav-game').click();
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  const cinderDungeon = page.getByTestId('dungeon-option').filter({ hasText: 'Cinder Vault' });
  await expect(cinderDungeon).toContainText('The Ashen Thread');

  // Provenance is part of the game/application contract, not player-facing debug copy.
  // Keep the streamlined dungeon card clean while proving the published revision survives
  // the Workshop -> runtime boundary.
  const dashboardResponse = await context.request.get('/api/dashboard');
  expect(dashboardResponse.ok()).toBe(true);
  const dashboard = await dashboardResponse.json();
  const runtimeDungeon = dashboard.dungeons.find((dungeon) => dungeon.id === 'cinder-vault');
  expect(runtimeDungeon).toBeTruthy();
  expect(String(runtimeDungeon.sourceManifestRevision)).toBe(String(revision));

  await page.getByTestId('start-dungeon-cinder-vault').click();
  await expect(page.getByTestId('run-state')).toContainText('Ashling');

  for (let i = 0; i < 4; i += 1) await page.getByTestId('attack').click();
  await expect(page.getByTestId('run-state')).toContainText('Phase: upgrade');
  await page.getByTestId('upgrade-sharpen').click();
  await expect(page.getByTestId('run-state')).toContainText('The Ember Loomkeeper');
  for (let i = 0; i < 4; i += 1) await page.getByTestId('attack').click();

  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  const emberNeedle = page.getByTestId('inventory-item').filter({ hasText: 'Ember Needle of the Loom' }).first();
  await expect(emberNeedle).toContainText('+3 attack');
  await expect(page.getByTestId('achievement').filter({ hasText: 'Through the Cinders' })).toBeVisible();

  await page.getByTestId('nav-codex').click();
  await expect(page.getByTestId('codex-status')).not.toHaveText('Loading…');

  await page.getByTestId('codex-search').fill('Cinder Seam');
  const cinderLore = page.locator('[data-testid="codex-entry"][data-category="lore"][data-entry-id="generated-lore:ashen-thread:cinder-seam"]');
  await expect(cinderLore).toBeVisible();
  await cinderLore.click();
  await expect(page.getByTestId('codex-detail-title')).toHaveText('The Cinder Seam');
  await expect(page.getByTestId('codex-detail')).toContainText('arc-manifest');

  await page.getByTestId('codex-search').fill('Ember Loomkeeper');
  const loomkeeper = page.locator('[data-testid="codex-entry"][data-category="bosses"][data-entry-id="ember-loomkeeper"]');
  await expect(loomkeeper).toBeVisible();
  await loomkeeper.click();
  await expect(page.getByTestId('codex-detail-title')).toHaveText('The Ember Loomkeeper');
  await expect(page.getByTestId('codex-mechanics')).toContainText('28');

  await page.getByTestId('codex-search').fill('Ember Needle of the Loom');
  const needleEntry = page.locator('[data-testid="codex-entry"][data-category="items"]').filter({ hasText: 'Ember Needle of the Loom' }).first();
  await expect(needleEntry).toBeVisible();
  await needleEntry.click();
  await expect(page.getByTestId('codex-detail-title')).toHaveText('Ember Needle of the Loom');
  await expect(page.getByTestId('codex-detail')).toContainText('boss_bane');

  await page.getByTestId('codex-search').fill('Through the Cinders');
  const achievementEntry = page.locator('[data-testid="codex-entry"][data-category="achievements"][data-entry-id="cinder-vault-cleared"]');
  await expect(achievementEntry).toBeVisible();
  await achievementEntry.click();
  await expect(page.getByTestId('codex-detail-title')).toHaveText('Through the Cinders');
  await expect(page.getByTestId('codex-detail')).toContainText('Unlocked');

  await page.getByTestId('codex-tab-history').click();
  await page.getByTestId('codex-search').fill('Ashen Thread begins');
  const historyEntry = page.locator(`[data-testid="codex-entry"][data-category="history"][data-entry-id="manifest-history:ashen-thread:r${revision}:ashen-thread-begins"]`);
  await expect(historyEntry).toBeVisible();
  await historyEntry.click();
  await expect(page.getByTestId('codex-detail-title')).toHaveText('The Ashen Thread begins');
});
