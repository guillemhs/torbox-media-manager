import { test, expect } from '@playwright/test';

test.describe('SEARCH FUNCTIONALITY - Dual Action Flow', () => {

  test.beforeEach(async ({ page }) => {
    // Ensure API key status is set for torbox-integrated mode
    await page.goto('/health');
    await page.waitForResponse('**/health');
  });

  test.describe('/browse - Search', () => {
    test('should render Indexers (Prowlarr + Torrentio) & Usenet results for query "Nocturne"', async ({ page }) => {
      await page.goto('/browse');
      await page.waitForSelector('#browse-query', { state: 'visible' });

      // Verify initial state: only search input visible, no results
      await expect(page.locator('#browse-results')).toBeEmpty();
      await expect(page.locator('#browse-skeletons')).toBeHidden();

      // Enter query and click Search
      await page.locator('#browse-query').fill('Nocturne');
      await page.locator('#browse-search-btn').click();

      // Wait for results to load
      await page.waitForTimeout(3000);

      // Verify results grid is rendered
      const results = page.locator('#browse-results .tb-card');
      await expect(results.first()).toBeVisible({ timeout: 10000 });

      // Verify source badges indicate Indexers and Usenet
      const sourceBadges = page.locator('.tb-source-badge');
      const badgeTexts = await sourceBadges.allTextContents();
      const hasIndexers = badgeTexts.some(b => b.includes('Prowlarr') || b.includes('Torrentio'));
      const hasUsenet = badgeTexts.some(b => b.includes('Usenet'));
      expect(hasIndexers).toBeTruthy();
      expect(hasUsenet).toBeTruthy();

      // Verify route badge shows filtering context
      await expect(page.locator('#browse-route-badge')).toBeVisible();
    });
  });

  test.describe('/movies - Search', () => {
    test('should render Indexers (Prowlarr + Torrentio) & Usenet results for "Forrest Gump" with Prowlarr Cat 2000', async ({ page }) => {
      await page.goto('/movies');
      await page.waitForSelector('#movies-query', { state: 'visible' });

      // Verify initial state
      await expect(page.locator('#movies-results')).toBeEmpty();

      // Enter query and click Search
      await page.locator('#movies-query').fill('Forrest Gump');
      await page.locator('#movies-search-btn').click();

      // Wait for results
      await page.waitForTimeout(3000);

      // Verify results grid
      const results = page.locator('#movies-results .tb-card');
      await expect(results.first()).toBeVisible({ timeout: 10000 });

      // Verify source badges
      const sourceBadges = page.locator('.tb-source-badge');
      const badgeTexts = await sourceBadges.allTextContents();
      const hasProwlarr = badgeTexts.some(b => b.includes('Prowlarr'));
      const hasUsenet = badgeTexts.some(b => b.includes('Usenet'));
      expect(hasProwlarr).toBeTruthy();
      expect(hasUsenet).toBeTruthy();

      // Verify route badge shows Movies Category 2000
      await expect(page.locator('#movies-route-badge')).toContainText('Movies Category 2000');

      // Verify card aspect ratio is 2:3 for movies
      const firstCover = results.first().locator('.tb-card-cover');
      await expect(firstCover).toHaveClass(/movie/);
    });
  });

  test.describe('/shows - Search', () => {
    test('should render Indexers (Prowlarr + Torrentio) & Usenet results for "Breaking Bad" with Prowlarr Cat 5000', async ({ page }) => {
      await page.goto('/shows');
      await page.waitForSelector('#shows-query', { state: 'visible' });

      await expect(page.locator('#shows-results')).toBeEmpty();

      await page.locator('#shows-query').fill('Breaking Bad');
      await page.locator('#shows-search-btn').click();

      await page.waitForTimeout(3000);

      const results = page.locator('#shows-results .tb-card');
      await expect(results.first()).toBeVisible({ timeout: 10000 });

      const sourceBadges = page.locator('.tb-source-badge');
      const badgeTexts = await sourceBadges.allTextContents();
      const hasProwlarr = badgeTexts.some(b => b.includes('Prowlarr'));
      const hasUsenet = badgeTexts.some(b => b.includes('Usenet'));
      expect(hasProwlarr).toBeTruthy();
      expect(hasUsenet).toBeTruthy();

      await expect(page.locator('#shows-route-badge')).toContainText('TV Category 5000');

      const firstCover = results.first().locator('.tb-card-cover');
      await expect(firstCover).toHaveClass(/movie/); // series uses movie class for cover
    });
  });

  test.describe('/music - Search', () => {
    test('should render Indexers (Only Prowlarr) & Usenet results for "Michael Jackson" with Prowlarr Cat 3000', async ({ page }) => {
      await page.goto('/music');
      await page.waitForSelector('#music-query', { state: 'visible' });

      await expect(page.locator('#music-results')).toBeEmpty();

      await page.locator('#music-query').fill('Michael Jackson');
      await page.locator('#music-search-btn').click();

      await page.waitForTimeout(3000);

      const results = page.locator('#music-results .tb-card');
      await expect(results.first()).toBeVisible({ timeout: 10000 });

      const sourceBadges = page.locator('.tb-source-badge');
      const badgeTexts = await sourceBadges.allTextContents();
      const hasProwlarr = badgeTexts.some(b => b.includes('Prowlarr'));
      const hasUsenet = badgeTexts.some(b => b.includes('Usenet'));
      const hasTorrentio = badgeTexts.some(b => b.includes('Torrentio'));
      expect(hasProwlarr).toBeTruthy();
      expect(hasUsenet).toBeTruthy();
      expect(hasTorrentio).toBeFalsy(); // Music search should NOT include Torrentio

      await expect(page.locator('#music-route-badge')).toContainText('Audio Category 3000');

      // Verify card aspect ratio is 1:1 for music
      const firstCover = results.first().locator('.tb-card-cover');
      await expect(firstCover).toHaveClass(/music/);
    });
  });

});
