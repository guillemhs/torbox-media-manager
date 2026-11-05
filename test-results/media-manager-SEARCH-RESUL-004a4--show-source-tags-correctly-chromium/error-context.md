# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: media-manager.spec.ts >> SEARCH RESULTS DISPLAY >> Search results show source tags correctly
- Location: tests/e2e/media-manager.spec.ts:304:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('#browse-search-btn')

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
    - heading "Browse" [level=1] [ref=e14]
    - generic [ref=e15]:
      - generic [ref=e16]:
        - generic [ref=e17]: Search
        - searchbox "Search" [active] [ref=e18]: Nocturne
        - generic [ref=e19]:
          - checkbox "Indexers" [checked] [ref=e20]
          - text: Indexers
        - generic [ref=e21]:
          - checkbox "Usenet" [ref=e22]
          - text: Usenet
      - generic [ref=e23]: Enter at least 2 characters to search.
      - generic [ref=e24]: No movie results found.
      - generic [ref=e27]: No show results found.
      - generic [ref=e30]: No music results found.
      - generic [ref=e33]: No torrent results found.
```

# Test source

```ts
  208 |     await navigateToView(page, 'browse');
  209 |     const searchInput = page.locator('#browse-query');
  210 |     await searchInput.fill('Nocturne');
  211 |     await page.click('#browse-search-btn');
  212 |     await page.waitForTimeout(2500);
  213 | 
  214 |     const pagination = page.locator('#browse-pagination');
  215 |     const resultsCount = await page.locator('#browse-results .search-result-item').count();
  216 | 
  217 |     if (resultsCount > 0 && await pagination.isVisible()) {
  218 |       const page2Button = page.locator('#browse-pagination button[data-page="2"]');
  219 |       if (await page2Button.isVisible()) {
  220 |         await page2Button.click();
  221 |         await page.waitForTimeout(1000);
  222 |         await expect(page.locator('#browse-results')).toBeVisible();
  223 |       }
  224 |     }
  225 |   });
  226 | });
  227 | 
  228 | test.describe('LIBRARY FUNCTIONALITY', () => {
  229 |   test.beforeEach(async ({ page }) => {
  230 |     await page.goto(BASE_URL);
  231 |     await page.waitForTimeout(1000);
  232 |   });
  233 | 
  234 |   test('/library - Shows Torbox library items', async ({ page }) => {
  235 |     await page.click('a[data-view="library"]');
  236 |     await page.waitForURL('**/library');
  237 |     await page.waitForTimeout(1000);
  238 | 
  239 |     const libraryResults = page.locator('#library-results');
  240 |     await expect(libraryResults).toBeVisible();
  241 | 
  242 |     const libraryItems = page.locator('.library-item');
  243 |     const emptyState = page.locator('.empty-state');
  244 | 
  245 |     expect(await libraryItems.count() + await emptyState.count()).toBeGreaterThan(0);
  246 |   });
  247 | 
  248 |   test('Library pagination works correctly', async ({ page }) => {
  249 |     await page.click('a[data-view="library"]');
  250 |     await page.waitForURL('**/library');
  251 |     await page.waitForTimeout(1000);
  252 | 
  253 |     const pagination = page.locator('#library-pagination');
  254 |     const items = page.locator('.library-item');
  255 | 
  256 |     if (await items.count() > 0 && await pagination.isVisible()) {
  257 |       const page2Button = page.locator('#library-pagination button[data-page="2"]');
  258 |       if (await page2Button.isVisible()) {
  259 |         await page2Button.click();
  260 |         await page.waitForTimeout(1000);
  261 |         await expect(page.locator('#library-results')).toBeVisible();
  262 |       }
  263 |     }
  264 |   });
  265 | });
  266 | 
  267 | test.describe('CALENDAR FUNCTIONALITY', () => {
  268 |   test.beforeEach(async ({ page }) => {
  269 |     await page.goto(BASE_URL);
  270 |     await page.waitForTimeout(1000);
  271 |   });
  272 | 
  273 |   test('/calendar - Renders calendar', async ({ page }) => {
  274 |     await page.click('a[data-view="calendar"]');
  275 |     await page.waitForURL('**/calendar');
  276 |     await page.waitForTimeout(1500);
  277 | 
  278 |     const calendarResults = page.locator('#calendar-results');
  279 |     await expect(calendarResults).toBeVisible();
  280 |   });
  281 | 
  282 |   test('Calendar date picker works', async ({ page }) => {
  283 |     await page.click('a[data-view="calendar"]');
  284 |     await page.waitForURL('**/calendar');
  285 |     await page.waitForTimeout(1000);
  286 | 
  287 |     const dateInput = page.locator('#calendar-date');
  288 |     await expect(dateInput).toBeVisible();
  289 | 
  290 |     await dateInput.fill('2026-11-05');
  291 |     await page.waitForTimeout(1000);
  292 | 
  293 |     const calendarResults = page.locator('#calendar-results');
  294 |     await expect(calendarResults).toBeVisible();
  295 |   });
  296 | });
  297 | 
  298 | test.describe('SEARCH RESULTS DISPLAY', () => {
  299 |   test.beforeEach(async ({ page }) => {
  300 |     await page.goto(BASE_URL);
  301 |     await page.waitForTimeout(1000);
  302 |   });
  303 | 
  304 |   test('Search results show source tags correctly', async ({ page }) => {
  305 |     await navigateToView(page, 'browse');
  306 |     const searchInput = page.locator('#browse-query');
  307 |     await searchInput.fill('Nocturne');
> 308 |     await page.click('#browse-search-btn');
      |                ^ Error: page.click: Test timeout of 30000ms exceeded.
  309 |     await page.waitForTimeout(2500);
  310 | 
  311 |     const results = page.locator('#browse-results .search-result-item');
  312 |     if (await results.count() > 0) {
  313 |       const firstResult = results.first();
  314 |       const sourceTag = firstResult.locator('.source-tag');
  315 |       if (await sourceTag.count() > 0) {
  316 |         await expect(sourceTag.first()).toBeVisible();
  317 |       }
  318 |     }
  319 |   });
  320 | 
  321 |   test('Torrent results show Add to Torbox button', async ({ page }) => {
  322 |     await navigateToView(page, 'movies');
  323 |     const searchInput = page.locator('#movies-query');
  324 |     await searchInput.fill('Forrest Gump');
  325 |     await page.click('#movies-search-btn');
  326 |     await page.waitForTimeout(2500);
  327 | 
  328 |     const addButtons = page.locator('[data-add-torrent]');
  329 |     if (await addButtons.count() > 0) {
  330 |       await expect(addButtons.first()).toBeVisible();
  331 |       await expect(addButtons.first()).toContainText('Add to Torbox');
  332 |     }
  333 |   });
  334 | 
  335 |   test('Usenet results show Add to Torbox button', async ({ page }) => {
  336 |     await navigateToView(page, 'browse');
  337 |     const searchInput = page.locator('#browse-query');
  338 |     await searchInput.fill('Nocturne');
  339 |     await page.click('#browse-search-btn');
  340 |     await page.waitForTimeout(2500);
  341 | 
  342 |     const usenetButtons = page.locator('[data-usenet-add]');
  343 |     if (await usenetButtons.count() > 0) {
  344 |       await expect(usenetButtons.first()).toBeVisible();
  345 |       await expect(usenetButtons.first()).toContainText('Add to Torbox');
  346 |     }
  347 |   });
  348 | });
  349 | 
  350 | test.describe('TITLE DETAIL PAGE', () => {
  351 |   test.beforeEach(async ({ page }) => {
  352 |     await page.goto(BASE_URL);
  353 |     await page.waitForTimeout(1000);
  354 |   });
  355 | 
  356 |   test('Clicking a search result navigates to title detail page', async ({ page }) => {
  357 |     await navigateToView(page, 'movies');
  358 |     const searchInput = page.locator('#movies-query');
  359 |     await searchInput.fill('Forrest Gump');
  360 |     await page.click('#movies-search-btn');
  361 |     await page.waitForTimeout(2500);
  362 | 
  363 |     const firstResultLink = page.locator('#movies-results .search-result-link').first();
  364 |     if (await firstResultLink.isVisible()) {
  365 |       await firstResultLink.click();
  366 |       await page.waitForTimeout(1000);
  367 | 
  368 |       await expect(page.url()).toContain('/title/');
  369 |     }
  370 |   });
  371 | });
  372 | 
```