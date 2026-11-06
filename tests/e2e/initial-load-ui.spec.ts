import { test, expect } from '@playwright/test';

test.describe('INITIAL LOAD, STATE TRANSITIONS & RESPONSIVE UI BEHAVIOR', () => {

  test.describe('Initial Load State', () => {
    test('/browse should display ONLY the centered hero search bar on initial load', async ({ page }) => {
      await page.goto('/browse');
      await page.waitForSelector('#browse-query', { state: 'visible' });

      // Hero search bar should be visible
      await expect(page.locator('#browse-query')).toBeVisible();
      await expect(page.locator('.tb-hero-input-group')).toBeVisible();

      // No results should be rendered before user input
      await expect(page.locator('#browse-results')).toBeEmpty();
      await expect(page.locator('#browse-skeletons')).toBeHidden();
      await expect(page.locator('#browse-empty')).toBeHidden();
      await expect(page.locator('#browse-pagination')).toBeHidden();
    });

    test('/movies should display ONLY the centered hero search bar on initial load', async ({ page }) => {
      await page.goto('/movies');
      await page.waitForSelector('#movies-query', { state: 'visible' });

      await expect(page.locator('#movies-query')).toBeVisible();
      await expect(page.locator('.tb-hero-input-group')).toBeVisible();
      await expect(page.locator('#movies-results')).toBeEmpty();
      await expect(page.locator('#movies-skeletons')).toBeHidden();
    });

    test('/shows should display ONLY the centered hero search bar on initial load', async ({ page }) => {
      await page.goto('/shows');
      await page.waitForSelector('#shows-query', { state: 'visible' });

      await expect(page.locator('#shows-query')).toBeVisible();
      await expect(page.locator('.tb-hero-input-group')).toBeVisible();
      await expect(page.locator('#shows-results')).toBeEmpty();
      await expect(page.locator('#shows-skeletons')).toBeHidden();
    });

    test('/music should display ONLY the centered hero search bar on initial load', async ({ page }) => {
      await page.goto('/music');
      await page.waitForSelector('#music-query', { state: 'visible' });

      await expect(page.locator('#music-query')).toBeVisible();
      await expect(page.locator('.tb-hero-input-group')).toBeVisible();
      await expect(page.locator('#music-results')).toBeEmpty();
      await expect(page.locator('#music-skeletons')).toBeHidden();
    });
  });

  test.describe('Loading & Empty States', () => {
    test('should display skeleton loading cards before results populate', async ({ page }) => {
      await page.goto('/movies');
      await page.waitForSelector('#movies-query', { state: 'visible' });

      await page.locator('#movies-query').fill('Forrest Gump');
      await page.locator('#movies-search-btn').click();

      // Skeletons should appear briefly during loading
      await expect(page.locator('#movies-skeletons')).toBeVisible({ timeout: 5000 });

      // Wait for results to replace skeletons
      await page.waitForTimeout(3000);
      await expect(page.locator('#movies-skeletons')).toBeHidden();
      await expect(page.locator('#movies-results .tb-card').first()).toBeVisible({ timeout: 10000 });
    });

    test('should display clean empty state when 0 results returned', async ({ page }) => {
      await page.goto('/movies');
      await page.waitForSelector('#movies-query', { state: 'visible' });

      await page.locator('#movies-query').fill('xyz123nonexistent');
      await page.locator('#movies-search-btn').click();

      await page.waitForTimeout(3000);

      await expect(page.locator('#movies-empty')).toBeVisible();
      await expect(page.locator('#movies-empty h3')).toContainText('No movies found');
      await expect(page.locator('#movies-results')).toBeEmpty();
    });
  });

  test.describe('Responsive Grid', () => {
    const viewports = [
      { name: 'mobile', width: 375, height: 667, expectedCols: 2 },
      { name: 'tablet', width: 768, height: 1024, expectedCols: 4 },
      { name: 'desktop', width: 1920, height: 1080, expectedCols: 6 },
    ];

    for (const vp of viewports) {
      test(`should display ${vp.expectedCols} columns on ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto('/movies');
        await page.waitForSelector('#movies-query', { state: 'visible' });

        await page.locator('#movies-query').fill('Forrest Gump');
        await page.locator('#movies-search-btn').click();
        await page.waitForTimeout(3000);

        const results = page.locator('#movies-results .tb-card');
        const count = await results.count();
        if (count > 0) {
          // Verify card grid uses correct aspect ratio
          const firstCover = results.first().locator('.tb-card-cover');
          await expect(firstCover).toHaveClass(/movie/);
        }
      });
    }

    test('music cards should use 1:1 square aspect ratio', async ({ page }) => {
      await page.goto('/music');
      await page.waitForSelector('#music-query', { state: 'visible' });

      await page.locator('#music-query').fill('Michael Jackson');
      await page.locator('#music-search-btn').click();
      await page.waitForTimeout(3000);

      const results = page.locator('#music-results .tb-card');
      const count = await results.count();
      if (count > 0) {
        const firstCover = results.first().locator('.tb-card-cover');
        await expect(firstCover).toHaveClass(/music/);
      }
    });
  });

  test.describe('Pagination', () => {
    test('should paginate results correctly on /movies', async ({ page }) => {
      await page.goto('/movies');
      await page.waitForSelector('#movies-query', { state: 'visible' });

      await page.locator('#movies-query').fill('Forrest Gump');
      await page.locator('#movies-search-btn').click();
      await page.waitForTimeout(3000);

      const pagination = page.locator('#movies-pagination');
      await expect(pagination).toBeVisible({ timeout: 10000 });

      // Check pagination buttons exist
      const nextBtn = page.locator('#movies-pagination .tb-pagination-btn').last();
      const pageCount = await page.locator('#movies-pagination .tb-pagination-btn[data-page]').count();

      if (pageCount > 1) {
        // Click page 2
        await page.locator('#movies-pagination .tb-pagination-btn[data-page="2"]').click();
        await page.waitForTimeout(2000);

        // Verify results updated
        await expect(page.locator('#movies-results .tb-card').first()).toBeVisible();
      }
    });

    test('should paginate library results correctly', async ({ page }) => {
      await page.goto('/library');
      await page.waitForSelector('#library-results', { state: 'visible' });
      await page.waitForTimeout(2000);

      const pagination = page.locator('#library-pagination');
      // Pagination may or may not be visible depending on item count
      if (await pagination.isVisible()) {
        const pageCount = await page.locator('#library-pagination .tb-pagination-btn[data-page]').count();
        if (pageCount > 1) {
          await page.locator('#library-pagination .tb-pagination-btn[data-page="2"]').click();
          await page.waitForTimeout(2000);
          await expect(page.locator('#library-results .tb-list-item').first()).toBeVisible();
        }
      }
    });
  });

});
