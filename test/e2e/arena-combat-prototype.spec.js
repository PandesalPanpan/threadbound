import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 960 }]) {
  test(`arena formation, automatic fight, pause, replay and reposition at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors = [];
    const mutations = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/') && request.method() !== 'GET') mutations.push(request.url());
    });
    await page.goto('/arena-combat');
    await expect(page.getByRole('heading', { name: 'Place. Watch. Adapt.' })).toBeVisible();
    await expect(page.locator('.arena-unit img')).toHaveCount(6);
    await expect(page.getByRole('img', { name: 'Tower Guard, your team, 150/150 HP, 0/100 Mana' })).toBeVisible();
    expect(await page.locator('.arena-unit img').evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
    await page.getByRole('button', { name: 'Place Tower Guard row 8 column 3', exact: true }).click();
    await expect(page.locator('[data-unit="guard"]')).toHaveAttribute('data-y', '7');
    await expect(page.locator('[data-unit="archer"]')).toHaveAttribute('data-y', '5');
    await page.screenshot({ path: `test-results/arena-placement-${viewport.width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Start battle' }).click();
    await expect(page.getByTestId('arena-board')).toHaveAttribute('data-phase', 'running');
    await expect.poll(() => page.getByTestId('arena-board').getAttribute('data-tick')).not.toBe('0');
    await page.getByRole('button', { name: 'Pause', exact: false }).click();
    await expect(page.getByTestId('arena-board')).toHaveAttribute('data-phase', 'paused');
    const tick = await page.getByTestId('arena-board').getAttribute('data-tick');
    await page.waitForTimeout(500);
    await expect(page.getByTestId('arena-board')).toHaveAttribute('data-tick', tick);
    await page.getByRole('button', { name: '4×', exact: true }).click();
    await page.getByRole('button', { name: 'Resume' }).click();
    await expect.poll(async () => Number(await page.getByTestId('arena-board').getAttribute('data-tick'))).toBeGreaterThan(16);
    await page.screenshot({ path: `test-results/arena-fighting-${viewport.width}.png`, fullPage: true });
    await expect(page.getByTestId('arena-board')).toHaveAttribute('data-phase', 'finished', { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /team wins|draw/ })).toBeVisible();
    const finalHealth = await page.locator('.arena-unit').evaluateAll((units) => units.map((unit) => unit.dataset.hp));
    await page.screenshot({ path: `test-results/arena-result-${viewport.width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Replay battle' }).click();
    await expect(page.getByTestId('arena-board')).toHaveAttribute('data-phase', 'running');
    await expect(page.getByTestId('arena-board')).toHaveAttribute('data-phase', 'finished', { timeout: 20_000 });
    expect(await page.locator('.arena-unit').evaluateAll((units) => units.map((unit) => unit.dataset.hp))).toEqual(finalHealth);
    await page.getByRole('button', { name: 'Reposition' }).click();
    await expect(page.getByTestId('arena-board')).toHaveAttribute('data-phase', 'placement');
    await expect(page.locator('[data-unit="guard"]')).toHaveAttribute('data-hp', '150');
    expect(mutations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('arena supports keyboard deployment and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/arena-combat');
  await page.getByRole('button', { name: 'Wayfarer Healer Support' }).click();
  const tile = page.getByRole('button', { name: 'Place Wayfarer Healer row 6 column 8', exact: true });
  await tile.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-unit="healer"]')).toHaveAttribute('data-x', '7');
  await page.getByRole('button', { name: '4×', exact: true }).click();
  await page.getByRole('button', { name: 'Start battle' }).click();
  await expect(page.getByTestId('arena-board')).toHaveAttribute('data-phase', 'finished', { timeout: 20_000 });
});
