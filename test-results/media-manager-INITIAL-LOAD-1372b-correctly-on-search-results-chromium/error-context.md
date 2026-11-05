# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: media-manager.spec.ts >> INITIAL LOAD & UI BEHAVIOR >> Pagination works correctly on search results
- Location: tests/e2e/media-manager.spec.ts:187:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('#movies-search-btn')

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
    - heading "Movies" [level=1] [ref=e14]
    - generic [ref=e15]:
      - generic [ref=e16]:
        - generic [ref=e17]: Search
        - searchbox "Search" [active] [ref=e18]: Forrest Gump
      - generic [ref=e19]: 0 items
      - generic [ref=e20]: Search for movies or click Discover to see recent releases.
```

# Test source

```ts
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
  115 |     await page.waitForTimeout(2500);
  116 | 
  117 |     const resultsContainer = page.locator('#movies-results');
  118 |     await expect(resultsContainer).not.toBeEmpty({ timeout: 10000 });
  119 | 
  120 |     const localItems = page.locator('[data-source="local"]');
  121 |     expect(await localItems.count()).toBeGreaterThan(0);
  122 |   });
  123 | 
  124 |   test('/shows - Discover Breaking Bad returns local IMDb TV shows only', async ({ page }) => {
  125 |     await navigateToView(page, 'shows');
  126 |     const searchInput = page.locator('#shows-query');
  127 |     await searchInput.fill('Breaking Bad');
  128 |     await page.click('#shows-discover-btn');
  129 |     await page.waitForTimeout(2500);
  130 | 
  131 |     const resultsContainer = page.locator('#shows-results');
  132 |     await expect(resultsContainer).not.toBeEmpty({ timeout: 10000 });
  133 | 
  134 |     const localItems = page.locator('[data-source="local"]');
  135 |     expect(await localItems.count()).toBeGreaterThan(0);
  136 |   });
  137 | 
  138 |   test('/music - Discover Michael Jackson returns MusicBrainz results only', async ({ page }) => {
  139 |     await navigateToView(page, 'music');
  140 |     const searchInput = page.locator('#music-query');
  141 |     await searchInput.fill('Michael Jackson');
  142 |     await page.click('#music-discover-btn');
  143 |     await page.waitForTimeout(2500);
  144 | 
  145 |     const resultsContainer = page.locator('#music-results');
  146 |     await expect(resultsContainer).not.toBeEmpty({ timeout: 10000 });
  147 | 
  148 |     const localItems = page.locator('[data-source="local"]');
  149 |     expect(await localItems.count()).toBeGreaterThan(0);
  150 |   });
  151 | });
  152 | 
  153 | test.describe('INITIAL LOAD & UI BEHAVIOR', () => {
  154 |   test.beforeEach(async ({ page }) => {
  155 |     await page.goto(BASE_URL);
  156 |     await page.waitForTimeout(1000);
  157 |   });
  158 | 
  159 |   test('/browse - Only search box shown on initial load', async ({ page }) => {
  160 |     await navigateToView(page, 'browse');
  161 |     await expect(page.locator('#browse-query')).toBeVisible();
  162 |     const resultsContainer = page.locator('#browse-results');
  163 |     await expect(resultsContainer).toBeEmpty();
  164 |   });
  165 | 
  166 |   test('/movies - Only search box shown on initial load', async ({ page }) => {
  167 |     await navigateToView(page, 'movies');
  168 |     await expect(page.locator('#movies-query')).toBeVisible();
  169 |     const resultsContainer = page.locator('#movies-results');
  170 |     await expect(resultsContainer).toBeEmpty();
  171 |   });
  172 | 
  173 |   test('/shows - Only search box shown on initial load', async ({ page }) => {
  174 |     await navigateToView(page, 'shows');
  175 |     await expect(page.locator('#shows-query')).toBeVisible();
  176 |     const resultsContainer = page.locator('#shows-results');
  177 |     await expect(resultsContainer).toBeEmpty();
  178 |   });
  179 | 
  180 |   test('/music - Only search box shown on initial load', async ({ page }) => {
  181 |     await navigateToView(page, 'music');
  182 |     await expect(page.locator('#music-query')).toBeVisible();
  183 |     const resultsContainer = page.locator('#music-results');
  184 |     await expect(resultsContainer).toBeEmpty();
  185 |   });
  186 | 
  187 |   test('Pagination works correctly on search results', async ({ page }) => {
  188 |     await navigateToView(page, 'movies');
  189 |     const searchInput = page.locator('#movies-query');
  190 |     await searchInput.fill('Forrest Gump');
> 191 |     await page.click('#movies-search-btn');
      |                ^ Error: page.click: Test timeout of 30000ms exceeded.
  192 |     await page.waitForTimeout(2500);
  193 | 
  194 |     const pagination = page.locator('#movies-pagination');
  195 |     const resultsCount = await page.locator('#movies-results .search-result-item').count();
  196 | 
  197 |     if (resultsCount > 0 && await pagination.isVisible()) {
  198 |       const page2Button = page.locator('#movies-pagination button[data-page="2"]');
  199 |       if (await page2Button.isVisible()) {
  200 |         await page2Button.click();
  201 |         await page.waitForTimeout(1000);
  202 |         await expect(page.locator('#movies-results')).toBeVisible();
  203 |       }
  204 |     }
  205 |   });
  206 | 
  207 |   test('Pagination works correctly on browse results', async ({ page }) => {
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
```