import { test, expect } from '@playwright/test';

async function loginLocal(page) {
  await page.goto('/');
  await page.getByTestId('local-login-a').click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
}

const PROJECTION = {
  receipt: {
    headline: 'Victory · Defeated Ember Slime',
    turnCount: 3,
    detailsAvailable: true,
  },
  details: {
    turns: [
      {
        turnNumber: 1,
        critical: true,
        consecutiveAction: false,
        summary: 'Mira critically hit Ember Slime for 6 damage.',
        events: [
          { kind: 'effect-applied', effect: 'fire', resistanceLevel: 'resistant', appliedPotency: 1 },
        ],
      },
      {
        turnNumber: 2,
        critical: false,
        consecutiveAction: true,
        summary: 'Mira took an extra action from Speed and hit Ember Slime for 4 damage.',
        events: [
          { kind: 'effect-blocked', effect: 'psychic', resistanceLevel: 'immune' },
        ],
      },
      {
        turnNumber: 3,
        critical: false,
        consecutiveAction: false,
        summary: 'Ember Slime took 2 effect damage before acting.',
        events: [
          { kind: 'effect-damage', effect: 'fire', damage: 2 },
          { kind: 'effect-expired', effect: 'fire' },
        ],
      },
    ],
  },
};

test('Battle Details opens from a stream receipt without adding turn messages to the timeline', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginLocal(page);

  await page.evaluate(async (projection) => {
    const { attachBattleDetails } = await import('/battle-details.js');
    const log = document.querySelector('[data-testid="adventure-stream-log"]');
    const entry = document.createElement('article');
    entry.className = 'stream-entry stream-entry-system';
    entry.dataset.testid = 'automatic-battle-fixture';

    const avatar = document.createElement('div');
    avatar.className = 'stream-avatar';
    avatar.textContent = 'TB';
    const content = document.createElement('div');
    const meta = document.createElement('div');
    meta.className = 'stream-entry-meta';
    const author = document.createElement('strong');
    author.textContent = 'THREADBOUND';
    meta.append(author);
    const receipt = document.createElement('p');
    receipt.textContent = 'Victory · Defeated Ember Slime · HP 20 → 13/20 · 3 turns';
    content.append(meta, receipt);
    entry.append(avatar, content);
    log.append(entry);
    attachBattleDetails(content, projection);
  }, PROJECTION);

  const entry = page.getByTestId('automatic-battle-fixture');
  await expect(entry).toContainText('Victory · Defeated Ember Slime · HP 20 → 13/20 · 3 turns');
  await expect(entry.getByText('Turn 1')).toBeHidden();
  expect(await page.getByTestId('stream-system-entry').count()).toBeLessThanOrEqual(1);

  const trigger = page.getByTestId('battle-details-trigger');
  await expect(trigger).toBeVisible();
  const triggerBox = await trigger.boundingBox();
  expect(triggerBox.height).toBeGreaterThanOrEqual(44);
  await trigger.click();

  const dialog = page.getByTestId('battle-details-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('BATTLE DETAILS');
  await expect(dialog).toContainText('Victory · Defeated Ember Slime');
  await expect(dialog).toContainText('Critical');
  await expect(dialog).toContainText('Speed extra action');
  await expect(dialog).toContainText('Fire · −2 HP');
  await expect(dialog).toContainText('Psychic blocked · immune');
  await expect(page.getByTestId('battle-details-turns').locator('.battle-details-turn')).toHaveCount(3);

  const closeBox = await page.getByTestId('battle-details-close').boundingBox();
  expect(closeBox.height).toBeGreaterThanOrEqual(44);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();
  await page.screenshot({ path: 'ux-review/battle-details-mobile.png', fullPage: true });

  await page.getByTestId('battle-details-close').click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});
