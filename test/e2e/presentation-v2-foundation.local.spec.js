import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/');
  await page.getByTestId('local-login-a').click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
}

async function expectFoundation(page, viewportName) {
  await expect(page.locator('html')).toHaveClass(/threadbound-v2/);
  await expect(page.locator('html')).toHaveClass(/threadbound-v2-game/);

  const tokens = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    return {
      canvas: styles.getPropertyValue('--tb-v2-canvas').trim(),
      inset: styles.getPropertyValue('--tb-v2-inset').trim(),
      text: styles.getPropertyValue('--tb-v2-text').trim(),
      purple: styles.getPropertyValue('--tb-v2-purple').trim(),
    };
  });
  expect(tokens).toEqual({
    canvas: '#1e1f22',
    inset: '#0f1117',
    text: '#f0f0f5',
    purple: '#9e78ff',
  });

  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    navHeight: document.querySelector('.threadbound-topnav')?.getBoundingClientRect().height || 0,
  }));
  expect(layout.scrollWidth, `${viewportName} has horizontal overflow`).toBeLessThanOrEqual(layout.viewport);
  expect(layout.navHeight).toBeGreaterThanOrEqual(viewportName === 'mobile' ? 62 : 66);

  const navTargets = await page.locator('.threadbound-topnav a:visible').evaluateAll((elements) =>
    elements.map((element) => ({
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
    })),
  );
  for (const target of navTargets) {
    expect(target.height).toBeGreaterThanOrEqual(44);
  }
}

test.describe('presentation v2 shared foundation', () => {
  test('matches the 390×844 foundation contract', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await expectFoundation(page, 'mobile');
    await page.screenshot({
      path: 'test-results/presentation-v2/foundation-390x844.png',
      fullPage: true,
    });
  });

  test('matches the 1440×960 foundation contract', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await login(page);
    await expectFoundation(page, 'desktop');
    await page.screenshot({
      path: 'test-results/presentation-v2/foundation-1440x960.png',
      fullPage: true,
    });
  });
});
