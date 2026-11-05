# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: media-manager.spec.ts >> SEARCH FUNCTIONALITY >> /shows - Search Breaking Bad returns Indexers and Usenet results
- Location: tests/e2e/media-manager.spec.ts:52:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('#shows-search-btn')

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - navigation [ref=e2]:
    - generic [ref=e3]:
      - link "TorBox Media Manager" [ref=e4] [cursor=pointer]:
        - /url: /
      - generic [ref=e5]:
        - link "Browse" [ref=e6] [cursor=pointer]:
          - /url: /browse
        - link "Movies" [ref=e7] [cursor=pointer]:
          - /url: /movies
        - link "Shows" [ref=e8] [cursor=pointer]:
          - /url: /shows
        - link "TorBox Library" [ref=e9] [cursor=pointer]:
          - /url: /torrents
        - link "Local Media" [ref=e10] [cursor=pointer]:
          - /url: /local
        - link "Music" [ref=e11] [cursor=pointer]:
          - /url: /music
        - link "Calendar" [ref=e12] [cursor=pointer]:
          - /url: /calendar
  - generic [ref=e13]:
    - heading "Shows" [level=1] [ref=e14]
    - generic [ref=e15]:
      - generic [ref=e16]:
        - generic [ref=e17]: Search
        - searchbox "Search" [active] [ref=e18]: Breaking Bad
      - generic [ref=e19]: 0 items
      - generic [ref=e20]: No results yet. The IMDb catalog may still be importing.
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | const BASE_URL = 'http://localhost:8066';
  4   | 
  5   | async function navigateToView(page: any, viewName: string) {
  6   |   await page.click('a[data-view="' + viewName + '"]');
  7   |   await page.waitForURL('**/' + viewName);
  8   |   await page.waitForTimeout(1500);
  9   | }
  10  | 
  11  | async function performSearch(page: any, view: string, query: string) {
  12  |   const input = page.locator('#' + view + '-query');
  13  |   await input.fill(query);
> 14  |   await page.click('#' + view + '-search-btn');
      |              ^ Error: page.click: Test timeout of 30000ms exceeded.
  15  |   await page.waitForTimeout(2500);
  16  | }
  17  | 
  18  | test.describe('SEARCH FUNCTIONALITY', () => {
  19  |   test.beforeEach(async ({ page }) => {
  20  |     await page.goto(BASE_URL);
  21  |     await page.waitForTimeout(1000);
  22  |   });
  23  | 
  24  |   test('/browse - Search Nocturne returns Indexers and Usenet results', async ({ page }) => {
  25  |     await navigateToView(page, 'browse');
  26  |     await performSearch(page, 'browse', 'Nocturne');
  27  | 
  28  |     const resultsContainer = page.locator('#browse-results');
  29  |     await expect(resultsContainer).not.toBeEmpty({ timeout: 10000 });
  30  | 
  31  |     const torrentItems = page.locator('[data-source="torrents"], .source-tag:has-text("Torrentio"), .source-tag:has-text("Prowlarr")');
  32  |     const usenetItems = page.locator('[data-source="usenet"], .source-tag:has-text("NZBIndex"), .source-tag:has-text("Binsearch")');
  33  | 
  34  |     const totalResults = await torrentItems.count() + await usenetItems.count();
  35  |     expect(totalResults).toBeGreaterThan(0);
  36  |   });
  37  | 
  38  |   test('/movies - Search Forrest Gump returns Indexers and Usenet results', async ({ page }) => {
  39  |     await navigateToView(page, 'movies');
  40  |     await performSearch(page, 'movies', 'Forrest Gump');
  41  | 
  42  |     const resultsContainer = page.locator('#movies-results');
  43  |     await expect(resultsContainer).not.toBeEmpty({ timeout: 10000 });
  44  | 
  45  |     const torrentItems = page.locator('[data-source="torrents"], .source-tag:has-text("Torrentio"), .source-tag:has-text("Prowlarr")');
  46  |     const usenetItems = page.locator('[data-source="usenet"], .source-tag:has-text("NZBIndex"), .source-tag:has-text("Binsearch")');
  47  | 
  48  |     const totalResults = await torrentItems.count() + await usenetItems.count();
  49  |     expect(totalResults).toBeGreaterThan(0);
  50  |   });
  51  | 
  52  |   test('/shows - Search Breaking Bad returns Indexers and Usenet results', async ({ page }) => {
  53  |     await navigateToView(page, 'shows');
  54  |     await performSearch(page, 'shows', 'Breaking Bad');
  55  | 
  56  |     const resultsContainer = page.locator('#shows-results');
  57  |     await expect(resultsContainer).not.toBeEmpty({ timeout: 10000 });
  58  | 
  59  |     const torrentItems = page.locator('[data-source="torrents"], .source-tag:has-text("Torrentio"), .source-tag:has-text("Prowlarr")');
  60  |     const usenetItems = page.locator('[data-source="usenet"], .source-tag:has-text("NZBIndex"), .source-tag:has-text("Binsearch")');
  61  | 
  62  |     const totalResults = await torrentItems.count() + await usenetItems.count();
  63  |     expect(totalResults).toBeGreaterThan(0);
  64  |   });
  65  | 
  66  |   test('/music - Search Michael Jackson returns Indexers and Usenet results', async ({ page }) => {
  67  |     await navigateToView(page, 'music');
  68  |     await performSearch(page, 'music', 'Michael Jackson');
  69  | 
  70  |     const resultsContainer = page.locator('#music-results');
  71  |     await expect(resultsContainer).not.toBeEmpty({ timeout: 10000 });
  72  | 
  73  |     const torrentItems = page.locator('[data-source="torrents"], .source-tag:has-text("Torrentio"), .source-tag:has-text("Prowlarr")');
  74  |     const usenetItems = page.locator('[data-source="usenet"], .source-tag:has-text("NZBIndex"), .source-tag:has-text("Binsearch")');
  75  | 
  76  |     const totalResults = await torrentItems.count() + await usenetItems.count();
  77  |     expect(totalResults).toBeGreaterThan(0);
  78  |   });
  79  | });
  80  | 
  81  | test.describe('DISCOVER FUNCTIONALITY', () => {
  82  |   test.beforeEach(async ({ page }) => {
  83  |     await page.goto(BASE_URL);
  84  |     await page.waitForTimeout(1000);
  85  |   });
  86  | 
  87  |   test('/browse - Discover Nocturne returns local IMDb results only', async ({ page }) => {
  88  |     await navigateToView(page, 'browse');
  89  |     const searchInput = page.locator('#browse-query');
  90  |     await searchInput.fill('Nocturne');
  91  |     await page.click('#browse-discover-btn');
  92  |     await page.waitForTimeout(2500);
  93  | 
  94  |     const resultsContainer = page.locator('#browse-results');
  95  |     await expect(resultsContainer).not.toBeEmpty({ timeout: 10000 });
  96  | 
  97  |     const localItems = page.locator('[data-source="local"]');
  98  |     const torrentItems = page.locator('[data-source="torrents"]');
  99  |     const usenetItems = page.locator('[data-source="usenet"]');
  100 | 
  101 |     const localCount = await localItems.count();
  102 |     const torrentCount = await torrentItems.count();
  103 |     const usenetCount = await usenetItems.count();
  104 | 
  105 |     expect(localCount).toBeGreaterThan(0);
  106 |     expect(torrentCount).toBe(0);
  107 |     expect(usenetCount).toBe(0);
  108 |   });
  109 | 
  110 |   test('/movies - Discover Forrest Gump returns local IMDb movies only', async ({ page }) => {
  111 |     await navigateToView(page, 'movies');
  112 |     const searchInput = page.locator('#movies-query');
  113 |     await searchInput.fill('Forrest Gump');
  114 |     await page.click('#movies-discover-btn');
```