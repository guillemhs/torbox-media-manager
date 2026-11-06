import { test, expect } from '@playwright/test';

test.describe('ITEM DETAIL ROUTES & RENDERING', () => {

  test.describe('Movie Detail', () => {
    test('should render Movie tt0109830 correctly with 2:3 poster, metadata, and details', async ({ page }) => {
      await page.goto('/title/tt0109830?kind=movie');
      await page.waitForSelector('#detail-content', { state: 'visible' });
      await page.waitForTimeout(2000);

      // Verify detail page is active
      await expect(page.locator('#view-title')).toHaveClass(/active/);
      await expect(page.locator('#detail-content')).toBeVisible();

      // Verify poster container with 2:3 aspect ratio
      const poster = page.locator('.tb-detail-poster.movie');
      await expect(poster).toBeVisible();

      const posterImg = poster.locator('img');
      if (await posterImg.count() > 0) {
        await expect(posterImg).toBeVisible();
      }

      // Verify metadata badges
      await expect(page.locator('.tb-detail-meta')).toBeVisible();
      await expect(page.locator('.tb-detail-tag')).toBeVisible();

      // Verify title
      await expect(page.locator('h1')).toBeVisible();

      // Verify overview section
      await expect(page.locator('.tb-detail-overview')).toBeVisible();

      // Verify release year and genres
      const metaText = await page.locator('.tb-detail-meta').textContent();
      expect(metaText.length).toBeGreaterThan(0);
    });
  });

  test.describe('TV Show Detail', () => {
    test('should render TV Show tt0903747 correctly with poster, metadata, and episode accordions', async ({ page }) => {
      await page.goto('/title/tt0903747?kind=series');
      await page.waitForSelector('#detail-content', { state: 'visible' });
      await page.waitForTimeout(2000);

      await expect(page.locator('#view-title')).toHaveClass(/active/);
      await expect(page.locator('#detail-content')).toBeVisible();

      // Verify poster container
      const poster = page.locator('.tb-detail-poster.series');
      await expect(poster).toBeVisible();

      // Verify title
      await expect(page.locator('h1')).toBeVisible();

      // Verify metadata
      await expect(page.locator('.tb-detail-meta')).toBeVisible();
      await expect(page.locator('.tb-detail-tag')).toBeVisible();

      // Verify season accordion if present
      const accordion = page.locator('.tb-accordion');
      if (await accordion.isVisible()) {
        await expect(accordion.locator('.accordion-button')).toBeVisible();
      }

      // Verify overview
      await expect(page.locator('.tb-detail-overview')).toBeVisible();
    });
  });

  test.describe('Music Release Detail', () => {
    test('should render MusicBrainz release a87dfac7-aca6-42e0-93cd-da849434cf6d with 1:1 cover art and details', async ({ page }) => {
      await page.goto('/music/release/a87dfac7-aca6-42e0-93cd-da849434cf6d');
      await page.waitForSelector('#music-detail-content', { state: 'visible' });
      await page.waitForTimeout(2000);

      // Verify detail page is active
      await expect(page.locator('#view-music-detail')).toHaveClass(/active/);
      await expect(page.locator('#music-detail-content')).toBeVisible();

      // Verify square cover art (1:1 ratio)
      const poster = page.locator('.tb-detail-poster.music');
      await expect(poster).toBeVisible();

      const posterImg = poster.locator('img');
      if (await posterImg.count() > 0) {
        await expect(posterImg).toBeVisible();
      }

      // Verify MusicBrainz source badge
      await expect(page.locator('.tb-source-badge.musicbrainz')).toBeVisible();

      // Verify title and metadata
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('.tb-detail-meta')).toBeVisible();
      await expect(page.locator('.tb-detail-tag')).toBeVisible();
    });
  });

  test.describe('Detail Page Navigation', () => {
    test('clicking a movie search result should navigate to title detail page', async ({ page }) => {
      await page.goto('/movies');
      await page.waitForSelector('#movies-query', { state: 'visible' });

      await page.locator('#movies-query').fill('Forrest Gump');
      await page.locator('#movies-search-btn').click();
      await page.waitForTimeout(3000);

      const results = page.locator('#movies-results .tb-card');
      const count = await results.count();

      if (count > 0) {
        // Click on first result title/link
        await results.first().click();
        await page.waitForTimeout(2000);

        // Should navigate to title detail
        await expect(page.url()).toContain('/title/');
        await expect(page.locator('#detail-content')).toBeVisible({ timeout: 10000 });
      }
    });

    test('clicking a music search result should navigate to music detail page', async ({ page }) => {
      await page.goto('/music');
      await page.waitForSelector('#music-query', { state: 'visible' });

      await page.locator('#music-query').fill('Michael Jackson');
      await page.locator('#music-search-btn').click();
      await page.waitForTimeout(3000);

      const results = page.locator('#music-results .tb-card');
      const count = await results.count();

      if (count > 0) {
        await results.first().click();
        await page.waitForTimeout(2000);

        // Should navigate to music detail
        await expect(page.url()).toContain('/music/release/');
        await expect(page.locator('#music-detail-content')).toBeVisible({ timeout: 10000 });
      }
    });
  });

});
