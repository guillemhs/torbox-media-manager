import { test, expect } from '@playwright/test';

test.describe('DISCOVER FUNCTIONALITY - Metadata Action Flow', () => {

  test.describe('/browse - Discover', () => {
    test('should render local IMDb results only (unfiltered) for query "Nocturne"', async ({ page }) => {
      await page.goto('/browse');
      await page.waitForSelector('#browse-query', { state: 'visible' });

      await expect(page.locator('#browse-results')).toBeEmpty();

      await page.locator('#browse-query').fill('Nocturne');
      await page.locator('#browse-discover-btn').click();

      await page.waitForTimeout(3000);

      const results = page.locator('#browse-results .tb-card');
      await expect(results.first()).toBeVisible({ timeout: 10000 });

      // Verify source badges show only IMDb (local), no indexers/usenet
      const sourceBadges = page.locator('.tb-source-badge');
      const badgeTexts = await sourceBadges.allTextContents();
      const hasImdb = badgeTexts.some(b => b.includes('IMDb'));
      const hasProwlarr = badgeTexts.some(b => b.includes('Prowlarr'));
      const hasUsenet = badgeTexts.some(b => b.includes('Usenet'));
      expect(hasImdb).toBeTruthy();
      expect(hasProwlarr).toBeFalsy();
      expect(hasUsenet).toBeFalsy();
    });
  });

  test.describe('/movies - Discover', () => {
    test('should render local IMDb movies only (movies filter applied) for query "Forrest Gump"', async ({ page }) => {
      await page.goto('/movies');
      await page.waitForSelector('#movies-query', { state: 'visible' });

      await expect(page.locator('#movies-results')).toBeEmpty();

      await page.locator('#movies-query').fill('Forrest Gump');
      await page.locator('#movies-discover-btn').click();

      await page.waitForTimeout(3000);

      const results = page.locator('#movies-results .tb-card');
      await expect(results.first()).toBeVisible({ timeout: 10000 });

      const sourceBadges = page.locator('.tb-source-badge');
      const badgeTexts = await sourceBadges.allTextContents();
      const hasImdb = badgeTexts.some(b => b.includes('IMDb'));
      const hasProwlarr = badgeTexts.some(b => b.includes('Prowlarr'));
      const hasUsenet = badgeTexts.some(b => b.includes('Usenet'));
      expect(hasImdb).toBeTruthy();
      expect(hasProwlarr).toBeFalsy();
      expect(hasUsenet).toBeFalsy();
    });
  });

  test.describe('/shows - Discover', () => {
    test('should render local IMDb TV shows only (TV shows & series filter applied) for query "Breaking Bad"', async ({ page }) => {
      await page.goto('/shows');
      await page.waitForSelector('#shows-query', { state: 'visible' });

      await expect(page.locator('#shows-results')).toBeEmpty();

      await page.locator('#shows-query').fill('Breaking Bad');
      await page.locator('#shows-discover-btn').click();

      await page.waitForTimeout(3000);

      const results = page.locator('#shows-results .tb-card');
      await expect(results.first()).toBeVisible({ timeout: 10000 });

      const sourceBadges = page.locator('.tb-source-badge');
      const badgeTexts = await sourceBadges.allTextContents();
      const hasImdb = badgeTexts.some(b => b.includes('IMDb'));
      const hasProwlarr = badgeTexts.some(b => b.includes('Prowlarr'));
      const hasUsenet = badgeTexts.some(b => b.includes('Usenet'));
      expect(hasImdb).toBeTruthy();
      expect(hasProwlarr).toBeFalsy();
      expect(hasUsenet).toBeFalsy();
    });
  });

  test.describe('/music - Discover', () => {
    test('should render MusicBrainz API results only for query "Michael Jackson"', async ({ page }) => {
      await page.goto('/music');
      await page.waitForSelector('#music-query', { state: 'visible' });

      await expect(page.locator('#music-results')).toBeEmpty();

      await page.locator('#music-query').fill('Michael Jackson');
      await page.locator('#music-discover-btn').click();

      await page.waitForTimeout(3000);

      const results = page.locator('#music-results .tb-card');
      await expect(results.first()).toBeVisible({ timeout: 45000 });

      const sourceBadges = page.locator('.tb-source-badge');
      const badgeTexts = await sourceBadges.allTextContents();
      const hasMusicBrainz = badgeTexts.some(b => b.includes('MusicBrainz'));
      const hasProwlarr = badgeTexts.some(b => b.includes('Prowlarr'));
      const hasUsenet = badgeTexts.some(b => b.includes('Usenet'));
      expect(hasMusicBrainz).toBeTruthy();
      expect(hasProwlarr).toBeFalsy();
      expect(hasUsenet).toBeFalsy();

      // Verify the music card is rendered with the music (1:1 square) variant
      await expect(results.first()).toHaveClass(/music-card/);
    });
  });

});
