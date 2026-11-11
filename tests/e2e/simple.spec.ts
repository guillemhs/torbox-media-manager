import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8066';

test.describe('Simple navigation tests', () => {
  test('Navigate to browse view', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);
    await page.click('a[data-view="browse"]');
    await page.waitForURL('**/browse');
    await page.waitForTimeout(1000);
    await expect(page.locator('#browse-query')).toBeVisible();
  });

  test('Navigate to movies view', async ({ page }) => {
    await page.goto(BASE_URL + '/movies');
    await page.waitForTimeout(1000);
    await expect(page.locator('#movies-query')).toBeVisible();
  });

  test('Navigate to shows view', async ({ page }) => {
    await page.goto(BASE_URL + '/shows');
    await page.waitForTimeout(1000);
    await expect(page.locator('#shows-query')).toBeVisible();
  });

  test('Navigate to music view', async ({ page }) => {
    await page.goto(BASE_URL + '/music');
    await page.waitForTimeout(1000);
    await expect(page.locator('#music-query')).toBeVisible();
  });

  test('Navigate to library view', async ({ page }) => {
    await page.click('a[data-view="library"]');
    await page.waitForURL('**/library');
    await page.waitForTimeout(1000);
    await expect(page.locator('#library-results')).toBeVisible();
  });

  test('Navigate to calendar view', async ({ page }) => {
    await page.click('a[data-view="calendar"]');
    await page.waitForURL('**/calendar');
    await page.waitForTimeout(1000);
    await expect(page.locator('#calendar-results')).toBeVisible();
  });
});
