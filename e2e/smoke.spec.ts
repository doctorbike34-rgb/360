import { test, expect } from '@playwright/test';

test.describe('DB360 smoke', () => {
  test('landing or auth shell loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(10);
  });

  test('has document title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/doctorbike|db360|360/i);
  });
});
