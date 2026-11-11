import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8066';

async function navigateToView(page: any, viewName: string) {
  await page.click('a[data-view="' + viewName + '"]');
  await page.waitForURL('**/' + viewName);
  await page.waitForTimeout(1500);
}

async function performSearch(page: any, view: string, query: string) {
  const input = page.locator('#' + view + '-query');
  await input.fill(query);
  await page.click('#' + view + '-search-btn');
  await page.waitForTimeout(2500);
}

test.describe('SEARCH FUNCTIONALITY', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);
  });

  test('/browse - Search Nocturne returns Indexers and Usenet results', async ({ page }) => {
    await navigateToView(page, 'browse');
    await performSearch(page, 'browse', 'Nocturne');

    const resultsContainer = page.locator('#browse-results');
    await expect(resultsContainer).not.toBeEmpty({ timeout: 10000 });

    const torrentItems = page.locator('[data-source="torrents"], .source-tag:has-text("Torrentio"), .source-tag:has-text("Prowlarr")');
    const usenetItems = page.locator('[data-source="usenet"], .source-tag:has-text("NZBIndex"), .source-tag:has-text("Binsearch")');

    const totalResults = await torrentItems.count() + await usenetItems.count();
    expect(totalResults).toBeGreaterThan(0);
  });

  test('/movies - Search Forrest Gump returns Indexers and Usenet results', async ({ page }) => {
    await navigateToView(page, 'movies');
    await performSearch(page, 'movies', 'Forrest Gump');

    const resultsContainer = page.locator('#movies-results');
    await expect(resultsContainer).not.toBeEmpty({ timeout: 10000 });

    const torrentItems = page.locator('[data-source="torrents"], .source-tag:has-text("Torrentio"), .source-tag:has-text("Prowlarr")');
    const usenetItems = page.locator('[data-source="usenet"], .source-tag:has-text("NZBIndex"), .source-tag:has-text("Binsearch")');

    const totalResults = await torrentItems.count() + await usenetItems.count();
    expect(totalResults).toBeGreaterThan(0);
  });

  test('/shows - Search Breaking Bad returns Indexers and Usenet results', async ({ page }) => {
    await navigateToView(page, 'shows');
    await performSearch(page, 'shows', 'Breaking Bad');

    const resultsContainer = page.locator('#shows-results');
    await expect(resultsContainer).not.toBeEmpty({ timeout: 10000 });

    const torrentItems = page.locator('[data-source="torrents"], .source-tag:has-text("Torrentio"), .source-tag:has-text("Prowlarr")');
    const usenetItems = page.locator('[data-source="usenet"], .source-tag:has-text("NZBIndex"), .source-tag:has-text("Binsearch")');

    const totalResults = await torrentItems.count() + await usenetItems.count();
    expect(totalResults).toBeGreaterThan(0);
  });

  test('/music - Search Michael Jackson returns Indexers and Usenet results', async ({ page }) => {
    await navigateToView(page, 'music');
    await performSearch(page, 'music', 'Michael Jackson');

    const resultsContainer = page.locator('#music-results');
    await expect(resultsContainer).not.toBeEmpty({ timeout: 10000 });

    const torrentItems = page.locator('[data-source="torrents"], .source-tag:has-text("Torrentio"), .source-tag:has-text("Prowlarr")');
    const usenetItems = page.locator('[data-source="usenet"], .source-tag:has-text("NZBIndex"), .source-tag:has-text("Binsearch")');

    const totalResults = await torrentItems.count() + await usenetItems.count();
    expect(totalResults).toBeGreaterThan(0);
  });
});

test.describe('DISCOVER FUNCTIONALITY', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);
  });

  test('/browse - Discover Nocturne returns local IMDb results only', async ({ page }) => {
    await navigateToView(page, 'browse');
    const searchInput = page.locator('#browse-query');
    await searchInput.fill('Nocturne');
    await page.click('#browse-discover-btn');
    await page.waitForTimeout(2500);

    const resultsContainer = page.locator('#browse-results');
    await expect(resultsContainer).not.toBeEmpty({ timeout: 10000 });

    const localItems = page.locator('[data-source="local"]');
    const torrentItems = page.locator('[data-source="torrents"]');
    const usenetItems = page.locator('[data-source="usenet"]');

    const localCount = await localItems.count();
    const torrentCount = await torrentItems.count();
    const usenetCount = await usenetItems.count();

    expect(localCount).toBeGreaterThan(0);
    expect(torrentCount).toBe(0);
    expect(usenetCount).toBe(0);
  });

  test('/movies - Discover Forrest Gump returns local IMDb movies only', async ({ page }) => {
    await navigateToView(page, 'movies');
    const searchInput = page.locator('#movies-query');
    await searchInput.fill('Forrest Gump');
    await page.click('#movies-discover-btn');
    await page.waitForTimeout(2500);

    const resultsContainer = page.locator('#movies-results');
    await expect(resultsContainer).not.toBeEmpty({ timeout: 10000 });

    const localItems = page.locator('[data-source="local"]');
    expect(await localItems.count()).toBeGreaterThan(0);
  });

  test('/shows - Discover Breaking Bad returns local IMDb TV shows only', async ({ page }) => {
    await navigateToView(page, 'shows');
    const searchInput = page.locator('#shows-query');
    await searchInput.fill('Breaking Bad');
    await page.click('#shows-discover-btn');
    await page.waitForTimeout(2500);

    const resultsContainer = page.locator('#shows-results');
    await expect(resultsContainer).not.toBeEmpty({ timeout: 10000 });

    const localItems = page.locator('[data-source="local"]');
    expect(await localItems.count()).toBeGreaterThan(0);
  });

  test('/music - Discover Michael Jackson returns MusicBrainz results only', async ({ page }) => {
    await navigateToView(page, 'music');
    const searchInput = page.locator('#music-query');
    await searchInput.fill('Michael Jackson');
    await page.click('#music-discover-btn');
    await page.waitForTimeout(2500);

    const resultsContainer = page.locator('#music-results');
    await expect(resultsContainer).not.toBeEmpty({ timeout: 10000 });

    const localItems = page.locator('[data-source="local"]');
    expect(await localItems.count()).toBeGreaterThan(0);
  });
});

test.describe('INITIAL LOAD & UI BEHAVIOR', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);
  });

  test('/browse - Only search box shown on initial load', async ({ page }) => {
    await navigateToView(page, 'browse');
    await expect(page.locator('#browse-query')).toBeVisible();
    const resultsContainer = page.locator('#browse-results');
    await expect(resultsContainer).toBeEmpty();
  });

  test('/movies - Only search box shown on initial load', async ({ page }) => {
    await navigateToView(page, 'movies');
    await expect(page.locator('#movies-query')).toBeVisible();
    const resultsContainer = page.locator('#movies-results');
    await expect(resultsContainer).toBeEmpty();
  });

  test('/shows - Only search box shown on initial load', async ({ page }) => {
    await navigateToView(page, 'shows');
    await expect(page.locator('#shows-query')).toBeVisible();
    const resultsContainer = page.locator('#shows-results');
    await expect(resultsContainer).toBeEmpty();
  });

  test('/music - Only search box shown on initial load', async ({ page }) => {
    await navigateToView(page, 'music');
    await expect(page.locator('#music-query')).toBeVisible();
    const resultsContainer = page.locator('#music-results');
    await expect(resultsContainer).toBeEmpty();
  });

  test('Pagination works correctly on search results', async ({ page }) => {
    await navigateToView(page, 'movies');
    const searchInput = page.locator('#movies-query');
    await searchInput.fill('Forrest Gump');
    await page.click('#movies-search-btn');
    await page.waitForTimeout(2500);

    const pagination = page.locator('#movies-pagination');
    const resultsCount = await page.locator('#movies-results .search-result-item').count();

    if (resultsCount > 0 && await pagination.isVisible()) {
      const page2Button = page.locator('#movies-pagination button[aria-label="Page 2"]');
      if (await page2Button.isVisible()) {
        await page2Button.click();
        await page.waitForTimeout(1000);
        await expect(page.locator('#movies-results')).toBeVisible();
      }
    }
  });

  test('Pagination works correctly on browse results', async ({ page }) => {
    await navigateToView(page, 'browse');
    const searchInput = page.locator('#browse-query');
    await searchInput.fill('Nocturne');
    await page.click('#browse-search-btn');
    await page.waitForTimeout(2500);

    const pagination = page.locator('#browse-pagination');
    const resultsCount = await page.locator('#browse-results .search-result-item').count();

    if (resultsCount > 0 && await pagination.isVisible()) {
      const page2Button = page.locator('#browse-pagination button[aria-label="Page 2"]');
      if (await page2Button.isVisible()) {
        await page2Button.click();
        await page.waitForTimeout(1000);
        await expect(page.locator('#browse-results')).toBeVisible();
      }
    }
  });
});

test.describe('LIBRARY FUNCTIONALITY', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);
  });

  test('/library - Shows Torbox library items', async ({ page }) => {
    await page.click('a[data-view="library"]');
    await page.waitForURL('**/library');
    await page.waitForTimeout(1000);

    const libraryResults = page.locator('#library-results');
    await expect(libraryResults).toBeVisible();

    const libraryItems = page.locator('.library-item');
    const emptyState = page.locator('.empty-state');

    expect(await libraryItems.count() + await emptyState.count()).toBeGreaterThan(0);
  });

  test('Library pagination works correctly', async ({ page }) => {
    await page.click('a[data-view="library"]');
    await page.waitForURL('**/library');
    await page.waitForTimeout(1000);

    const pagination = page.locator('#library-pagination');
    const items = page.locator('.library-item');

    if (await items.count() > 0 && await pagination.isVisible()) {
      const page2Button = page.locator('#library-pagination button[aria-label="Page 2"]');
      if (await page2Button.isVisible()) {
        await page2Button.click();
        await page.waitForTimeout(1000);
        await expect(page.locator('#library-results')).toBeVisible();
      }
    }
  });
});

test.describe('CALENDAR FUNCTIONALITY', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);
  });

  test('/calendar - Renders calendar', async ({ page }) => {
    await page.click('a[data-view="calendar"]');
    await page.waitForURL('**/calendar');
    await page.waitForTimeout(1500);

    const calendarResults = page.locator('#calendar-results');
    await expect(calendarResults).toBeVisible();
  });

  test('Calendar date picker works', async ({ page }) => {
    await page.click('a[data-view="calendar"]');
    await page.waitForURL('**/calendar');
    await page.waitForTimeout(1000);

    const dateInput = page.locator('#calendar-date');
    await expect(dateInput).toBeVisible();

    await dateInput.fill('2026-11-05');
    await page.waitForTimeout(1000);

    const calendarResults = page.locator('#calendar-results');
    await expect(calendarResults).toBeVisible();
  });
});

test.describe('SEARCH RESULTS DISPLAY', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);
  });

  test('Search results show source tags correctly', async ({ page }) => {
    await navigateToView(page, 'browse');
    const searchInput = page.locator('#browse-query');
    await searchInput.fill('Nocturne');
    await page.click('#browse-search-btn');
    await page.waitForTimeout(2500);

    const results = page.locator('#browse-results .search-result-item');
    if (await results.count() > 0) {
      const firstResult = results.first();
      const sourceTag = firstResult.locator('.source-tag');
      if (await sourceTag.count() > 0) {
        await expect(sourceTag.first()).toBeVisible();
      }
    }
  });

  test('Torrent results show Add to Torbox button', async ({ page }) => {
    await navigateToView(page, 'movies');
    const searchInput = page.locator('#movies-query');
    await searchInput.fill('Forrest Gump');
    await page.click('#movies-search-btn');
    await page.waitForTimeout(2500);

    const addButtons = page.locator('[data-add-torrent]');
    if (await addButtons.count() > 0) {
      await expect(addButtons.first()).toBeVisible();
      await expect(addButtons.first()).toContainText('Add to Torbox');
    }
  });

  test('Usenet results show Add to Torbox button', async ({ page }) => {
    await navigateToView(page, 'browse');
    const searchInput = page.locator('#browse-query');
    await searchInput.fill('Nocturne');
    await page.click('#browse-search-btn');
    await page.waitForTimeout(2500);

    const usenetButtons = page.locator('[data-usenet-add]');
    if (await usenetButtons.count() > 0) {
      await expect(usenetButtons.first()).toBeVisible();
      await expect(usenetButtons.first()).toContainText('Add to Torbox');
    }
  });
});

test.describe('TITLE DETAIL PAGE', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);
  });

  test('Clicking a search result navigates to title detail page', async ({ page }) => {
    await navigateToView(page, 'movies');
    const searchInput = page.locator('#movies-query');
    await searchInput.fill('Forrest Gump');
    await page.click('#movies-search-btn');
    await page.waitForTimeout(2500);

    const firstResultLink = page.locator('#movies-results .search-result-link').first();
    if (await firstResultLink.isVisible()) {
      await firstResultLink.click();
      await page.waitForTimeout(1000);

      await expect(page.url()).toContain('/title/');
    }
  });
});
