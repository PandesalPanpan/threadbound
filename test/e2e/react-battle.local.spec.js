import { test, expect } from '@playwright/test';

test('React battle prototype drives the five backend-backed presentation states', async ({ page }) => {
  await page.addInitScript(() => { window.__THREADBOUND_FAST_TEST__ = true; });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('local-login-d').click();
  await page.context().request.post('/api/party/leave');
  await page.goto('/game-react');

  await expect(page.getByTestId('battle-card')).toHaveAttribute('data-battle-phase', 'preBattle');
  await expect(page.getByTestId('battle-pre-battle')).toContainText('Enter the hollow');
  await page.screenshot({ path: 'ux-review/react-battle-pre-battle-mobile.png', fullPage: true });

  await page.getByTestId('battle-start').click();
  await expect(page.getByTestId('battle-card')).toHaveAttribute('data-battle-phase', 'live');
  await expect(page.getByTestId('battle-attacker')).toBeVisible();
  await expect(page.getByTestId('battle-target')).toBeVisible();
  await page.screenshot({ path: 'ux-review/react-battle-live-mobile.png', fullPage: true });

  await page.getByTestId('battle-attack').click();
  await expect(page.getByTestId('battle-card')).toHaveAttribute('data-battle-phase', 'impact');
  await expect(page.getByTestId('battle-stage')).toHaveClass(/battle-stage--impact/);
  await expect(page.getByTestId('battle-floating-damage')).toBeVisible();
  await page.screenshot({ path: 'ux-review/react-battle-attack-impact-mobile.png', fullPage: true });
  await expect(page.getByTestId('battle-card')).toHaveAttribute('data-battle-phase', 'live');

  await page.getByTestId('battle-attack').click();
  await expect(page.getByTestId('battle-card')).toHaveAttribute('data-battle-phase', 'impact');
  await expect(page.getByTestId('battle-card')).toHaveAttribute('data-battle-phase', 'decision');
  await page.locator('[data-testid^="battle-decision-"]').first().click();
  await expect(page.getByTestId('battle-card')).toHaveAttribute('data-battle-phase', 'live');
  const skill = page.getByTestId('battle-skill-piercing-stitch');
  await expect(skill).toBeEnabled();
  await skill.click();
  await expect(page.getByTestId('battle-card')).toHaveAttribute('data-battle-phase', 'skillCast');
  await expect(page.getByTestId('battle-skill-banner')).toContainText('Piercing Stitch');
  await page.screenshot({ path: 'ux-review/react-battle-skill-cast-mobile.png', fullPage: true });
  await expect(page.getByTestId('battle-card')).toHaveAttribute('data-battle-phase', /live|decision/);

  for (let turn = 0; turn < 32; turn += 1) {
    const currentPhase = await page.getByTestId('battle-card').getAttribute('data-battle-phase');
    if (currentPhase === 'result') break;
    if (currentPhase === 'decision') {
      await page.locator('[data-testid^="battle-decision-"]').first().click();
      await expect(page.getByTestId('battle-card')).toHaveAttribute('data-battle-phase', 'live');
    } else {
      await page.getByTestId('battle-attack').click();
      await expect(page.getByTestId('battle-card')).toHaveAttribute('data-battle-phase', /impact|result/);
      await expect.poll(async () => page.getByTestId('battle-card').getAttribute('data-battle-phase')).toMatch(/live|decision|result/);
      const settledPhase = await page.getByTestId('battle-card').getAttribute('data-battle-phase');
      if (settledPhase === 'decision') {
        await page.locator('[data-testid^="battle-decision-"]').first().click();
        await expect(page.getByTestId('battle-card')).toHaveAttribute('data-battle-phase', 'live');
      }
    }
  }

  await expect(page.getByTestId('battle-card')).toHaveAttribute('data-battle-phase', 'result');
  await expect(page.getByTestId('battle-result-stamp')).toBeVisible();
  await page.screenshot({ path: 'ux-review/react-battle-result-mobile.png', fullPage: true });

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.screenshot({ path: 'ux-review/react-battle-result-desktop.png', fullPage: true });
  await expect(page.getByRole('navigation', { name: 'Threadbound' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View full Adventure Stream' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
});
