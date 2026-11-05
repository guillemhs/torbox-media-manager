# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: media-manager.spec.ts >> SEARCH FUNCTIONALITY >> /music - Search Michael Jackson returns Indexers and Usenet results
- Location: tests/e2e/media-manager.spec.ts:66:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('#music-search-btn')

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
    - heading "Music" [level=1] [ref=e14]
    - generic [ref=e15]:
      - generic [ref=e16]:
        - generic [ref=e17]: Search
        - searchbox "Search" [active] [ref=e18]: Michael Jackson
      - generic [ref=e19]: 25 items
      - generic [ref=e20]:
        - article [ref=e21]:
          - link "Open In Your Wildest Dreams by Whiskeytown" [ref=e22] [cursor=pointer]:
            - /url: /music/release/8e56f05c-d6fc-3ab7-b968-cba52c1733bb?title=In%20Your%20Wildest%20Dreams&artist=Whiskeytown&date=1997&type=EP
            - generic [ref=e23]:
              - generic [ref=e24]: In Your Wildest Dreams
              - generic [ref=e25]: Whiskeytown · 1997 · EP
          - generic [aria-hidden] [ref=e26]: ›
        - article [ref=e27]:
          - link "Open The Story of Dave Dee by Dave Dee, Dozy, Beaky, Mick & Tich" [ref=e28] [cursor=pointer]:
            - /url: /music/release/714c1217-d4dc-3878-ad5f-c14d0dd55fc7?title=The%20Story%20of%20Dave%20Dee&artist=Dave%20Dee%2C%20Dozy%2C%20Beaky%2C%20Mick%20%26%20Tich&date=&type=Album
            - generic [ref=e29]:
              - generic [ref=e30]: The Story of Dave Dee
              - generic [ref=e31]: Dave Dee, Dozy, Beaky, Mick & Tich · Album
          - generic [aria-hidden] [ref=e32]: ›
        - article [ref=e33]:
          - link "Open 168 by Simcoe Street Mob" [ref=e34] [cursor=pointer]:
            - /url: /music/release/d2a7c31f-93fb-3c55-8005-a982eac23eeb?title=168&artist=Simcoe%20Street%20Mob&date=&type=Album
            - generic [ref=e35]:
              - generic [ref=e36]: "168"
              - generic [ref=e37]: Simcoe Street Mob · Album
          - generic [aria-hidden] [ref=e38]: ›
        - article [ref=e39]:
          - link "Open Ihanaa Leijonat, ihanaa by A-Tyyppi" [ref=e40] [cursor=pointer]:
            - /url: /music/release/216bdd86-d144-3d1a-b798-a79b4dcf3271?title=Ihanaa%20Leijonat%2C%20ihanaa&artist=A-Tyyppi&date=1999&type=Single
            - generic [ref=e41]:
              - generic [ref=e42]: Ihanaa Leijonat, ihanaa
              - generic [ref=e43]: A-Tyyppi · 1999 · Single
          - generic [aria-hidden] [ref=e44]: ›
        - article [ref=e45]:
          - link "Open Goodbye Little Rose by The Little Flames" [ref=e46] [cursor=pointer]:
            - /url: /music/release/a595c87d-380d-3fae-8854-f4aa708d4176?title=Goodbye%20Little%20Rose&artist=The%20Little%20Flames&date=2005&type=Single
            - generic [ref=e47]:
              - generic [ref=e48]: Goodbye Little Rose
              - generic [ref=e49]: The Little Flames · 2005 · Single
          - generic [aria-hidden] [ref=e50]: ›
        - article [ref=e51]:
          - link "Open The History of Pop Muzik by M" [ref=e52] [cursor=pointer]:
            - /url: /music/release/4ee373bf-2a8b-3719-b536-1b69757ed3c5?title=The%20History%20of%20Pop%20Muzik&artist=M&date=1993&type=Album
            - generic [ref=e53]:
              - generic [ref=e54]: The History of Pop Muzik
              - generic [ref=e55]: M · 1993 · Album
          - generic [aria-hidden] [ref=e56]: ›
        - article [ref=e57]:
          - link "Open Alive & Amplified by The Mooney Suzuki" [ref=e58] [cursor=pointer]:
            - /url: /music/release/51471d84-5e14-3510-9e8c-ba652d8ad8e6?title=Alive%20%26%20Amplified&artist=The%20Mooney%20Suzuki&date=2004&type=Single
            - generic [ref=e59]:
              - generic [ref=e60]: Alive & Amplified
              - generic [ref=e61]: The Mooney Suzuki · 2004 · Single
          - generic [aria-hidden] [ref=e62]: ›
        - article [ref=e63]:
          - link "Open Slowdrag by Lael Alderman" [ref=e64] [cursor=pointer]:
            - /url: /music/release/5b185ebc-e575-3936-888b-fc8063c9495c?title=Slowdrag&artist=Lael%20Alderman&date=1997&type=Album
            - generic [ref=e65]:
              - generic [ref=e66]: Slowdrag
              - generic [ref=e67]: Lael Alderman · 1997 · Album
          - generic [aria-hidden] [ref=e68]: ›
        - article [ref=e69]:
          - link "Open The Dancing Sun by Orchis" [ref=e70] [cursor=pointer]:
            - /url: /music/release/e188606d-c030-3ee1-86eb-709d0b27eced?title=The%20Dancing%20Sun&artist=Orchis&date=1994&type=Album
            - generic [ref=e71]:
              - generic [ref=e72]: The Dancing Sun
              - generic [ref=e73]: Orchis · 1994 · Album
          - generic [aria-hidden] [ref=e74]: ›
        - article [ref=e75]:
          - link "Open Rapülők by Rapülők" [ref=e76] [cursor=pointer]:
            - /url: /music/release/04d48e81-0615-3e5f-b237-d4eef277c2e6?title=Rap%C3%BCl%C5%91k&artist=Rap%C3%BCl%C5%91k&date=1992&type=Album
            - generic [ref=e77]:
              - generic [ref=e78]: Rapülők
              - generic [ref=e79]: Rapülők · 1992 · Album
          - generic [aria-hidden] [ref=e80]: ›
        - article [ref=e81]:
          - link "Open Through the Darkest Days by Trial" [ref=e82] [cursor=pointer]:
            - /url: /music/release/9bc3435d-09fb-36a1-ba67-0b2ade2c6fb3?title=Through%20the%20Darkest%20Days&artist=Trial&date=1996&type=Album
            - generic [ref=e83]:
              - generic [ref=e84]: Through the Darkest Days
              - generic [ref=e85]: Trial · 1996 · Album
          - generic [aria-hidden] [ref=e86]: ›
        - article [ref=e87]:
          - link "Open Best of Jennifer Warnes by Jennifer Warnes" [ref=e88] [cursor=pointer]:
            - /url: /music/release/47d8ff40-8710-3e7d-887f-618354f30c0e?title=Best%20of%20Jennifer%20Warnes&artist=Jennifer%20Warnes&date=1982&type=Album
            - generic [ref=e89]:
              - generic [ref=e90]: Best of Jennifer Warnes
              - generic [ref=e91]: Jennifer Warnes · 1982 · Album
          - generic [aria-hidden] [ref=e92]: ›
        - article [ref=e93]:
          - link "Open Touchstone by Toshinori Kondo" [ref=e94] [cursor=pointer]:
            - /url: /music/release/0a7ba978-9734-3800-84ed-081f9544907e?title=Touchstone&artist=Toshinori%20Kondo&date=1993&type=Album
            - generic [ref=e95]:
              - generic [ref=e96]: Touchstone
              - generic [ref=e97]: Toshinori Kondo · 1993 · Album
          - generic [aria-hidden] [ref=e98]: ›
        - article [ref=e99]:
          - link "Open All I Want by 702" [ref=e100] [cursor=pointer]:
            - /url: /music/release/325bcf46-3c1a-312c-bc8d-278cd66f1873?title=All%20I%20Want&artist=702&date=1997-07-29&type=Single
            - generic [ref=e101]:
              - generic [ref=e102]: All I Want
              - generic [ref=e103]: 702 · 1997-07-29 · Single
          - generic [aria-hidden] [ref=e104]: ›
        - article [ref=e105]:
          - link "Open 25 Greatest Hits by The Swinging Blue Jeans" [ref=e106] [cursor=pointer]:
            - /url: /music/release/93fb477c-161b-3eb0-8374-3804330e55e7?title=25%20Greatest%20Hits&artist=The%20Swinging%20Blue%20Jeans&date=1998-07-06&type=Album
            - generic [ref=e107]:
              - generic [ref=e108]: 25 Greatest Hits
              - generic [ref=e109]: The Swinging Blue Jeans · 1998-07-06 · Album
          - generic [aria-hidden] [ref=e110]: ›
        - article [ref=e111]:
          - link "Open Under the Influence, Take 2 by Blackout" [ref=e112] [cursor=pointer]:
            - /url: /music/release/3be99310-ba73-3e79-bffb-5414bbc03c06?title=Under%20the%20Influence%2C%20Take%202&artist=Blackout&date=&type=Album
            - generic [ref=e113]:
              - generic [ref=e114]: Under the Influence, Take 2
              - generic [ref=e115]: Blackout · Album
          - generic [aria-hidden] [ref=e116]: ›
        - article [ref=e117]:
          - link "Open Steady Rocking by Romanowski" [ref=e118] [cursor=pointer]:
            - /url: /music/release/71a82b67-1bb6-3b18-9bf7-01e297093434?title=Steady%20Rocking&artist=Romanowski&date=&type=
            - generic [ref=e119]:
              - generic [ref=e120]: Steady Rocking
              - generic [ref=e121]: Romanowski
          - generic [aria-hidden] [ref=e122]: ›
        - article [ref=e123]:
          - link "Open Original Golden Hits by The Shirelles" [ref=e124] [cursor=pointer]:
            - /url: /music/release/0d41fba6-c393-333a-9f0b-fc4d550395a8?title=Original%20Golden%20Hits&artist=The%20Shirelles&date=1987&type=Album
            - generic [ref=e125]:
              - generic [ref=e126]: Original Golden Hits
              - generic [ref=e127]: The Shirelles · 1987 · Album
          - generic [aria-hidden] [ref=e128]: ›
        - article [ref=e129]:
          - link "Open A Classic Taste by Peter & Paul with The Wendinger Band" [ref=e130] [cursor=pointer]:
            - /url: /music/release/2c13f2d8-aebc-3174-80d9-23af39d07185?title=A%20Classic%20Taste&artist=Peter%20%26%20Paul%20with%20The%20Wendinger%20Band&date=&type=Album
            - generic [ref=e131]:
              - generic [ref=e132]: A Classic Taste
              - generic [ref=e133]: Peter & Paul with The Wendinger Band · Album
          - generic [aria-hidden] [ref=e134]: ›
        - article [ref=e135]:
          - link "Open So Underground It Hurts by Abe Duque" [ref=e136] [cursor=pointer]:
            - /url: /music/release/3ea4c7d2-0f3d-38f2-8e37-9d7a00a1999f?title=So%20Underground%20It%20Hurts&artist=Abe%20Duque&date=2004-02-01&type=Album
            - generic [ref=e137]:
              - generic [ref=e138]: So Underground It Hurts
              - generic [ref=e139]: Abe Duque · 2004-02-01 · Album
          - generic [aria-hidden] [ref=e140]: ›
        - article [ref=e141]:
          - link "Open 9mm Is a Classic by Ace the Space" [ref=e142] [cursor=pointer]:
            - /url: /music/release/dcf54df5-899b-3863-adde-7cda7b004350?title=9mm%20Is%20a%20Classic&artist=Ace%20the%20Space&date=2003&type=Single
            - generic [ref=e143]:
              - generic [ref=e144]: 9mm Is a Classic
              - generic [ref=e145]: Ace the Space · 2003 · Single
          - generic [aria-hidden] [ref=e146]: ›
        - article [ref=e147]:
          - link "Open 25 Year Celebration of Mannheim Steamroller by Mannheim Steamroller" [ref=e148] [cursor=pointer]:
            - /url: /music/release/76037000-442e-3695-b409-3f1f3706d200?title=25%20Year%20Celebration%20of%20Mannheim%20Steamroller&artist=Mannheim%20Steamroller&date=1999&type=Album
            - generic [ref=e149]:
              - generic [ref=e150]: 25 Year Celebration of Mannheim Steamroller
              - generic [ref=e151]: Mannheim Steamroller · 1999 · Album
          - generic [aria-hidden] [ref=e152]: ›
        - article [ref=e153]:
          - link "Open Stage Show / Love Affair by The Four Lads" [ref=e154] [cursor=pointer]:
            - /url: /music/release/cd5f7ba8-ab62-388f-8e27-b00e6bafc4dc?title=Stage%20Show%20%2F%20Love%20Affair&artist=The%20Four%20Lads&date=2004&type=Album
            - generic [ref=e155]:
              - generic [ref=e156]: Stage Show / Love Affair
              - generic [ref=e157]: The Four Lads · 2004 · Album
          - generic [aria-hidden] [ref=e158]: ›
        - article [ref=e159]:
          - link "Open The End of Halcyon Age by Twilight Ophera" [ref=e160] [cursor=pointer]:
            - /url: /music/release/b3fe4ed1-1c4f-3a7b-ac48-85f45a1bc237?title=The%20End%20of%20Halcyon%20Age&artist=Twilight%20Ophera&date=2003&type=Album
            - generic [ref=e161]:
              - generic [ref=e162]: The End of Halcyon Age
              - generic [ref=e163]: Twilight Ophera · 2003 · Album
          - generic [aria-hidden] [ref=e164]: ›
        - article [ref=e165]:
          - link "Open Rubber Room Rock by The Spectres" [ref=e166] [cursor=pointer]:
            - /url: /music/release/62d56a86-3fe3-30f2-8aa0-450ac293c238?title=Rubber%20Room%20Rock&artist=The%20Spectres&date=1998&type=Album
            - generic [ref=e167]:
              - generic [ref=e168]: Rubber Room Rock
              - generic [ref=e169]: The Spectres · 1998 · Album
          - generic [aria-hidden] [ref=e170]: ›
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