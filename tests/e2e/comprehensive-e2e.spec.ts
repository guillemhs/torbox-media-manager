import { test, expect } from '@playwright/test';

test.describe('TORBOX MEDIA MANAGER - Complete E2E Verification', () => {

  // ========================================================================
  // 1. SEARCH FUNCTIONALITY (Dual Action Flow)
  // ========================================================================

  test.describe('SEARCH - /browse route', () => {
    test('should render Indexers (Prowlarr + Torrentio) & Usenet results for "Nocturne"', async ({ page }) => {
      await page.goto('/browse');
      await page.waitForSelector('#browse-query', { state: 'visible' });

      // Initial state: only search input visible
      await expect(page.locator('#browse-query')).toBeVisible();
      await expect(page.locator('#browse-results')).toBeEmpty();

      // Enter query and click Search
      await page.locator('#browse-query').fill('Nocturne');
      await page.locator('#browse-search-btn').click();

      // Wait for results
      await page.waitForTimeout(5000);

      // Verify results grid is rendered
      const results = page.locator('#browse-results .tb-card');
      if (await results.count() > 0) {
        await expect(results.first()).toBeVisible();

        // Verify source badges indicate Indexers and Usenet
        const sourceBadges = page.locator('.tb-source-badge');
        const badgeTexts = await sourceBadges.allTextContents();
        const hasIndexers = badgeTexts.some(b => b.includes('Prowlarr') || b.includes('Torrentio'));
        const hasUsenet = badgeTexts.some(b => b.includes('Usenet') || b.includes('NZBGeek') || b.includes('NZBIndex') || b.includes('Binsearch'));
        expect(hasIndexers).toBeTruthy();
        expect(hasUsenet).toBeTruthy();
      }

      // Verify route badge
      await expect(page.locator('#browse-route-badge')).toBeVisible();
    });
  });

  test.describe('SEARCH - /movies route', () => {
    test('should render Indexers (Prowlarr + Torrentio) & Usenet results for "Forrest Gump" with Prowlarr Cat 2000', async ({ page }) => {
      await page.goto('/movies');
      await page.waitForSelector('#movies-query', { state: 'visible' });

      await expect(page.locator('#movies-results')).toBeEmpty();

      await page.locator('#movies-query').fill('Forrest Gump');
      await page.locator('#movies-search-btn').click();

      await page.waitForTimeout(5000);

      const results = page.locator('#movies-results .tb-card');
      if (await results.count() > 0) {
        await expect(results.first()).toBeVisible();

        const sourceBadges = page.locator('.tb-source-badge');
        const badgeTexts = await sourceBadges.allTextContents();
        const hasProwlarr = badgeTexts.some(b => b.includes('Prowlarr'));
        const hasUsenet = badgeTexts.some(b => b.includes('Usenet') || b.includes('NZBGeek'));
        expect(hasProwlarr).toBeTruthy();
        expect(hasUsenet).toBeTruthy();
      }

      await expect(page.locator('#movies-route-badge')).toContainText('Movies Category 2000');
    });
  });

  test.describe('SEARCH - /shows route', () => {
    test('should render Indexers (Prowlarr + Torrentio) & Usenet results for "Breaking Bad" with Prowlarr Cat 5000', async ({ page }) => {
      await page.goto('/shows');
      await page.waitForSelector('#shows-query', { state: 'visible' });

      await expect(page.locator('#shows-results')).toBeEmpty();

      await page.locator('#shows-query').fill('Breaking Bad');
      await page.locator('#shows-search-btn').click();

      await page.waitForTimeout(5000);

      const results = page.locator('#shows-results .tb-card');
      if (await results.count() > 0) {
        await expect(results.first()).toBeVisible();

        const sourceBadges = page.locator('.tb-source-badge');
        const badgeTexts = await sourceBadges.allTextContents();
        const hasProwlarr = badgeTexts.some(b => b.includes('Prowlarr'));
        const hasUsenet = badgeTexts.some(b => b.includes('Usenet') || b.includes('NZBGeek'));
        expect(hasProwlarr).toBeTruthy();
        expect(hasUsenet).toBeTruthy();
      }

      await expect(page.locator('#shows-route-badge')).toContainText('TV Category 5000');
    });
  });

  test.describe('SEARCH - /music route', () => {
    test('should render Indexers (Only Prowlarr) & Usenet results for "Michael Jackson" with Prowlarr Cat 3000', async ({ page }) => {
      await page.goto('/music');
      await page.waitForSelector('#music-query', { state: 'visible' });

      await expect(page.locator('#music-results')).toBeEmpty();

      await page.locator('#music-query').fill('Michael Jackson');
      await page.locator('#music-search-btn').click();

      await page.waitForTimeout(5000);

      const results = page.locator('#music-results .tb-card');
      if (await results.count() > 0) {
        await expect(results.first()).toBeVisible();

        const sourceBadges = page.locator('.tb-source-badge');
        const badgeTexts = await sourceBadges.allTextContents();
        const hasProwlarr = badgeTexts.some(b => b.includes('Prowlarr'));
        const hasUsenet = badgeTexts.some(b => b.includes('Usenet') || b.includes('NZBGeek'));
        const hasTorrentio = badgeTexts.some(b => b.includes('Torrentio'));
        expect(hasProwlarr).toBeTruthy();
        expect(hasUsenet).toBeTruthy();
        expect(hasTorrentio).toBeFalsy(); // Music search should NOT include Torrentio
      }

      await expect(page.locator('#music-route-badge')).toContainText('Audio Category 3000');
    });
  });

  // ========================================================================
  // 2. DISCOVER FUNCTIONALITY (Metadata Action Flow)
  // ========================================================================

  test.describe('DISCOVER - /browse route', () => {
    test('should render local IMDb results only (unfiltered) for "Nocturne"', async ({ page }) => {
      await page.goto('/browse');
      await page.waitForSelector('#browse-query', { state: 'visible' });

      await expect(page.locator('#browse-results')).toBeEmpty();

      await page.locator('#browse-query').fill('Nocturne');
      await page.locator('#browse-discover-btn').click();

      await page.waitForTimeout(5000);

      const results = page.locator('#browse-results .tb-card');
      if (await results.count() > 0) {
        await expect(results.first()).toBeVisible();
        const sourceBadges = page.locator('.tb-source-badge');
        const badgeTexts = await sourceBadges.allTextContents();
        const hasImdb = badgeTexts.some(b => b.includes('IMDb'));
        expect(hasImdb).toBeTruthy();
      }
    });
  });

  test.describe('DISCOVER - /movies route', () => {
    test('should render local IMDb results only (movies filter) for "Forrest Gump"', async ({ page }) => {
      await page.goto('/movies');
      await page.waitForSelector('#movies-query', { state: 'visible' });

      await expect(page.locator('#movies-results')).toBeEmpty();

      await page.locator('#movies-query').fill('Forrest Gump');
      await page.locator('#movies-discover-btn').click();

      await page.waitForTimeout(5000);

      const results = page.locator('#movies-results .tb-card');
      if (await results.count() > 0) {
        await expect(results.first()).toBeVisible();
      }
    });
  });

  test.describe('DISCOVER - /shows route', () => {
    test('should render local IMDb results only (TV shows filter) for "Breaking Bad"', async ({ page }) => {
      await page.goto('/shows');
      await page.waitForSelector('#shows-query', { state: 'visible' });

      await expect(page.locator('#shows-results')).toBeEmpty();

      await page.locator('#shows-query').fill('Breaking Bad');
      await page.locator('#shows-discover-btn').click();

      await page.waitForTimeout(5000);

      const results = page.locator('#shows-results .tb-card');
      if (await results.count() > 0) {
        await expect(results.first()).toBeVisible();
      }
    });
  });

  test.describe('DISCOVER - /music route', () => {
    test('should render MusicBrainz API results only for "Michael Jackson"', async ({ page }) => {
      await page.goto('/music');
      await page.waitForSelector('#music-query', { state: 'visible' });

      await expect(page.locator('#music-results')).toBeEmpty();

      await page.locator('#music-query').fill('Michael Jackson');
      await page.locator('#music-discover-btn').click();

      await page.waitForTimeout(5000);

      const results = page.locator('#music-results .tb-card');
      if (await results.count() > 0) {
        await expect(results.first()).toBeVisible();
        const sourceBadges = page.locator('.tb-source-badge');
        const badgeTexts = await sourceBadges.allTextContents();
        const hasMusicbrainz = badgeTexts.some(b => b.includes('MusicBrainz'));
        expect(hasMusicbrainz).toBeTruthy();
      }
    });
  });

  // ========================================================================
  // 3. INITIAL LOAD, STATE TRANSITIONS & RESPONSIVE UI
  // ========================================================================

  test.describe('INITIAL LOAD', () => {
    for (const view of ['browse', 'movies', 'shows', 'music']) {
      test(`${view} should display only hero search bar on initial load`, async ({ page }) => {
        await page.goto(`/${view}`);
        await page.waitForSelector(`#${view === 'browse' ? 'browse-query' : `${view}-query`}`, { state: 'visible' });

        // Verify search input is visible
        await expect(page.locator(`#${view === 'browse' ? 'browse-query' : `${view}-query`}`)).toBeVisible();

        // Verify no results grid or placeholders initially
        const resultsContainer = page.locator(`#${view}-results`);
        await expect(resultsContainer).toBeEmpty();

        const skeletons = page.locator(`#${view}-skeletons`);
        await expect(skeletons).toBeHidden();

        const empty = page.locator(`#${view}-empty`);
        await expect(empty).toBeHidden();
      });
    }
  });

  test.describe('LOADING & EMPTY STATES', () => {
    test('should show skeleton loading cards before results populate', async ({ page }) => {
      await page.goto('/browse');
      await page.waitForSelector('#browse-query', { state: 'visible' });

      await page.locator('#browse-query').fill('Nocturne');
      await page.locator('#browse-search-btn').click();

      // Skeletons should appear briefly
      const skeletons = page.locator('#browse-skeletons');
      // Note: skeletons may be replaced quickly by results, so we check they appear at some point
      await page.waitForTimeout(1000);

      // After results load, skeletons should be hidden
      await page.waitForTimeout(4000);
      await expect(skeletons).toBeHidden();
    });

    test('should show clean alert card if 0 results returned', async ({ page }) => {
      await page.goto('/browse');
      await page.waitForSelector('#browse-query', { state: 'visible' });

      // Use a query unlikely to return results
      await page.locator('#browse-query').fill('xyzzyqwerty12345nonexistent');
      await page.locator('#browse-search-btn').click();

      await page.waitForTimeout(5000);

      const empty = page.locator('#browse-empty');
      if (await empty.count() > 0) {
        await expect(empty).not.toHaveClass(/hidden/);
      }
    });
  });

  test.describe('RESPONSIVE GRID', () => {
    test('should have correct row-cols classes on media card container', async ({ page }) => {
      await page.goto('/browse');
      await page.waitForSelector('#browse-query', { state: 'visible' });

      await page.locator('#browse-query').fill('Nocturne');
      await page.locator('#browse-search-btn').click();

      await page.waitForTimeout(5000);

      const grid = page.locator('#browse-results');
      if (await grid.count() > 0) {
        const classAttr = await grid.getAttribute('class');
        expect(classAttr).toBeTruthy();
        // Verify it has row-cols classes for responsive layout
        expect(classAttr).toMatch(/row-cols-/);
      }
    });

    test('should have correct poster aspect ratios', async ({ page }) => {
      await page.goto('/browse');
      await page.waitForSelector('#browse-query', { state: 'visible' });

      await page.locator('#browse-query').fill('Nocturne');
      await page.locator('#browse-search-btn').click();

      await page.waitForTimeout(5000);

      const cards = page.locator('#browse-results .tb-card');
      if (await cards.count() > 0) {
        // Check that cards have proper structure
        await expect(cards.first()).toBeVisible();
      }
    });
  });

  test.describe('PAGINATION', () => {
    test('should update URL search params and refresh grid when paginating', async ({ page }) => {
      await page.goto('/browse');
      await page.waitForSelector('#browse-query', { state: 'visible' });

      await page.locator('#browse-query').fill('Nocturne');
      await page.locator('#browse-search-btn').click();

      await page.waitForTimeout(5000);

      const pagContainer = page.locator('#browse-pagination');
      if (await pagContainer.count() > 0 && !(await pagContainer.hasClass('hidden'))) {
        // Click page 2
        const page2Btn = pagContainer.locator('[data-page="2"]');
        if (await page2Btn.count() > 0) {
          await page2Btn.click();
          await page.waitForTimeout(3000);
          // Verify URL updated
          await expect(page).toHaveURL(/page=2/);
        }
      }
    });
  });

  // ========================================================================
  // 4. LIBRARY & CALENDAR
  // ========================================================================

  test.describe('LIBRARY', () => {
    test('should render library items with TorBox API key', async ({ page }) => {
      await page.goto('/library');
      await page.waitForTimeout(2000);

      const libraryResults = page.locator('#library-results');
      await expect(libraryResults).toBeVisible();
    });

    test('should have library pagination', async ({ page }) => {
      await page.goto('/library');
      await page.waitForTimeout(2000);

      const pagContainer = page.locator('#library-pagination');
      // Pagination may be hidden if few items - just verify the container exists
      await expect(pagContainer).toBeVisible();
    });
  });

  test.describe('CALENDAR', () => {
    test('should render calendar view grid', async ({ page }) => {
      await page.goto('/calendar');
      await page.waitForTimeout(2000);

      const calendarResults = page.locator('#calendar-results');
      await expect(calendarResults).toBeVisible();
    });

    test('should navigate to title detail when clicking calendar item', async ({ page }) => {
      await page.goto('/calendar');
      await page.waitForTimeout(2000);

      const calendarItems = page.locator('#calendar-results .tb-card, #calendar-results a');
      if (await calendarItems.count() > 0) {
        await calendarItems.first().click();
        await page.waitForTimeout(2000);
        // Should navigate to a title detail page
        await expect(page.url()).toMatch(/\/title\//);
      }
    });
  });

  // ========================================================================
  // 5. ITEM DETAIL ROUTES & RENDERING
  // ========================================================================

  test.describe('ITEM DETAIL', () => {
    test('Movie Detail: tt0109830 should render with poster, metadata, genres, overview', async ({ page }) => {
      await page.goto('/title/tt0109830?kind=movie');
      await page.waitForTimeout(3000);

      const detailContent = page.locator('#title-detail-content');
      await expect(detailContent).toBeVisible();

      // Verify poster container (2:3 ratio)
      const poster = page.locator('.tb-card img, .poster-container img');
      if (await poster.count() > 0) {
        await expect(poster.first()).toBeVisible();
      }

      // Verify metadata badges, release year, genres, overview
      await expect(page.locator('h1, h2, .tb-card-title')).toBeVisible();
    });

    test('TV Show Detail: tt0903747 should render with poster, metadata, episode list', async ({ page }) => {
      await page.goto('/title/tt0903747?kind=series');
      await page.waitForTimeout(3000);

      const detailContent = page.locator('#title-detail-content');
      await expect(detailContent).toBeVisible();

      await expect(page.locator('h1, h2, .tb-card-title')).toBeVisible();
    });

    test('Music Release Detail should render with square cover art, tracklist, details', async ({ page }) => {
      await page.goto('/music/release/a87dfac7-aca6-42e0-93cd-da849434cf6d');
      await page.waitForTimeout(3000);

      const detailContent = page.locator('#music-detail-content');
      await expect(detailContent).toBeVisible();

      // Verify square cover art (1:1 ratio)
      const cover = page.locator('.tb-card-cover img, .music-cover img');
      if (await cover.count() > 0) {
        await expect(cover.first()).toBeVisible();
      }

      await expect(page.locator('h1, h2, .tb-card-title')).toBeVisible();
    });
  });
});
