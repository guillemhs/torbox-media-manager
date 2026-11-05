import { test, expect } from '@playwright/test';

test.describe('Simple search tests', () => {
  test('browse search shows results', async ({ page }) => {
    await page.goto('http://localhost:8066/browse');
    await page.waitForTimeout(2000);
    
    const input = page.locator('#browse-query');
    await expect(input).toBeVisible();
    
    await input.fill('Nocturne');
    await page.click('#browse-search-btn');
    await page.waitForTimeout(3000);
    
    const results = page.locator('#browse-results .search-result-item');
    const count = await results.count();
    console.log('Browse results count:', count);
    
    if (count > 0) {
      const firstResult = results.first();
      await expect(firstResult).toBeVisible();
    }
  });

  test('movies search shows results', async ({ page }) => {
    await page.goto('http://localhost:8066/movies');
    await page.waitForTimeout(2000);
    
    const input = page.locator('#movies-query');
    await expect(input).toBeVisible();
    
    await input.fill('Forrest Gump');
    await page.click('#movies-search-btn');
    await page.waitForTimeout(3000);
    
    const results = page.locator('#movies-results .search-result-item');
    const count = await results.count();
    console.log('Movies results count:', count);
    
    if (count > 0) {
      const firstResult = results.first();
      await expect(firstResult).toBeVisible();
    }
  });
});
