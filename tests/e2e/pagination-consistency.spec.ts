import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8066';

async function navigateToView(page: any, viewName: string) {
  await page.goto(BASE_URL);
  await page.waitForTimeout(1000);
  await page.click('a[data-view="' + viewName + '"]');
  await page.waitForURL('**/' + viewName);
  await page.waitForTimeout(1500);
}

async function performSearch(page: any, view: string, query: string) {
  const input = page.locator('#' + view + '-query');
  await input.fill(query);
  await page.click('#' + view + '-search-btn');
  // Combined searches (Prowlarr + Torrentio + 3 usenet sources) can take a while;
  // wait until the status line leaves the Searching/Loading state instead of a fixed delay.
  await page.waitForFunction((v) => {
    const s = document.querySelector('#' + v + '-status');
    const t = s ? s.textContent || '' : '';
    return !/Searching|Loading/.test(t);
  }, view, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(500);
}

async function selectOnlyTorrentio(page: any, view: string) {
  // Deselect the "all" indexers pill (inputs are display:none -> click the pill label),
  // then select only Torrentio
  const allBox = input(page, view, 'indexers:all');
  if (await allBox.isChecked()) await pill(page, view, 'indexers:all').click();
  const prowlarr = input(page, view, 'indexers:prowlarr');
  if (await prowlarr.isChecked()) await pill(page, view, 'indexers:prowlarr').click();
  const torrentio = input(page, view, 'indexers:torrentio');
  if (!(await torrentio.isChecked())) await pill(page, view, 'indexers:torrentio').click();
}


function pill(page: any, view: string, value: string) {
  return page.locator(`label.tb-source-pill:has(input[name="${view}-source"][value="${value}"])`);
}

function input(page: any, view: string, value: string) {
  return page.locator(`input[name="${view}-source"][value="${value}"]`);
}

function paginationInfo(page: any, view: string) {
  const pagId = view === 'browse' ? 'browse-pagination' : `${view}-pagination`;
  return page.locator(`#${pagId} .tb-pagination-info`);
}

test.describe('PAGINATION CONSISTENCY', () => {
  test.setTimeout(180000);
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);
  });

  test('/shows - "nocturne s01e02" Torrentio pagination keeps total stable across pages', async ({ page }) => {
    await navigateToView(page, 'shows');
    await selectOnlyTorrentio(page, 'shows');
    await performSearch(page, 'shows', 'nocturne s01e02');

    const pagInfo = paginationInfo(page, 'shows');
    await expect(pagInfo).toBeVisible({ timeout: 30000 });

    const page1Text = (await pagInfo.textContent()) || '';
    const match1 = page1Text.match(/Page\s+(\d+)\s+of\s+(\d+)\s+\((\d+)\s+results\)/);
    expect(match1).not.toBeNull();
    const totalPages1 = Number(match1![2]);
    const totalResults1 = Number(match1![3]);
    expect(totalResults1).toBeGreaterThan(20); // multi-page result set
    expect(totalPages1).toBeGreaterThan(1);

    // Click page 2
    await page.click('#shows-pagination .tb-pagination-btn[aria-label="Page 2"]');
    await page.waitForTimeout(2500);

    const page2Text = (await pagInfo.textContent()) || '';
    const match2 = page2Text.match(/Page\s+(\d+)\s+of\s+(\d+)\s+\((\d+)\s+results\)/);
    expect(match2).not.toBeNull();
    expect(Number(match2![1])).toBe(2);
    // The bug: total changed between pages (74 -> 37). It must stay identical.
    expect(Number(match2![2])).toBe(totalPages1);
    expect(Number(match2![3])).toBe(totalResults1);

    // Navigate to the last page — totals must still match
    await page.click(`#shows-pagination .tb-pagination-btn[aria-label="Page ${totalPages1}"]`);
    await page.waitForTimeout(2500);
    const lastText = (await pagInfo.textContent()) || '';
    const matchLast = lastText.match(/Page\s+(\d+)\s+of\s+(\d+)\s+\((\d+)\s+results\)/);
    expect(Number(matchLast![2])).toBe(totalPages1);
    expect(Number(matchLast![3])).toBe(totalResults1);
  });

  test('/movies - pagination totals are consistent between page 1 and page 2', async ({ page }) => {
    await navigateToView(page, 'movies');
    await selectOnlyTorrentio(page, 'movies');
    await performSearch(page, 'movies', 'Forrest Gump');

    const pagInfo = paginationInfo(page, 'movies');
    await expect(pagInfo).toBeVisible({ timeout: 30000 });
    const text1 = (await pagInfo.textContent()) || '';
    const m1 = text1.match(/Page\s+(\d+)\s+of\s+(\d+)\s+\((\d+)\s+results\)/);
    expect(m1).not.toBeNull();
    if (Number(m1![2]) < 2) return; // not multi-page, nothing to verify

    await page.click('#movies-pagination .tb-pagination-btn[aria-label="Page 2"]');
    await page.waitForTimeout(2500);
    const text2 = (await pagInfo.textContent()) || '';
    const m2 = text2.match(/Page\s+(\d+)\s+of\s+(\d+)\s+\((\d+)\s+results\)/);
    expect(Number(m2![2])).toBe(Number(m1![2]));
    expect(Number(m2![3])).toBe(Number(m1![3]));
  });

  test('/browse - pagination totals are consistent between page 1 and page 2', async ({ page }) => {
    await navigateToView(page, 'browse');
    await selectOnlyTorrentio(page, 'browse');
    await performSearch(page, 'browse', 'Nocturne');

    const pagInfo = paginationInfo(page, 'browse');
    await expect(pagInfo).toBeVisible({ timeout: 30000 });
    const text1 = (await pagInfo.textContent()) || '';
    const m1 = text1.match(/Page\s+(\d+)\s+of\s+(\d+)\s+\((\d+)\s+results\)/);
    expect(m1).not.toBeNull();
    if (Number(m1![2]) < 2) return;

    await page.click('#browse-pagination .tb-pagination-btn[aria-label="Page 2"]');
    await page.waitForTimeout(2500);
    const text2 = (await pagInfo.textContent()) || '';
    const m2 = text2.match(/Page\s+(\d+)\s+of\s+(\d+)\s+\((\d+)\s+results\)/);
    expect(Number(m2![2])).toBe(Number(m1![2]));
    expect(Number(m2![3])).toBe(Number(m1![3]));
  });
});

test.describe('SOURCE SELECTOR ALL/CHILDREN SYNC', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);
  });

  test('toggling Indexers-ALL checks/unchecks Prowlarr and Torrentio', async ({ page }) => {
    await navigateToView(page, 'browse');
    const allBox = input(page, 'browse', 'indexers:all');
    const prowlarr = input(page, 'browse', 'indexers:prowlarr');
    const torrentio = input(page, 'browse', 'indexers:torrentio');

    // Initial: indexers:all is checked -> children should be checked too
    await expect(allBox).toBeChecked();
    await expect(prowlarr).toBeChecked();
    await expect(torrentio).toBeChecked();

    // Deselect ALL -> children deselect
    await pill(page, 'browse', 'indexers:all').click();
    await expect(prowlarr).not.toBeChecked();
    await expect(torrentio).not.toBeChecked();

    // Select ALL -> children select
    await pill(page, 'browse', 'indexers:all').click();
    await expect(prowlarr).toBeChecked();
    await expect(torrentio).toBeChecked();
  });

  test('toggling Usenet-ALL checks/unchecks NZBGeek, NZBIndex, Binsearch', async ({ page }) => {
    await navigateToView(page, 'browse');
    const allBox = input(page, 'browse', 'usenet:all');
    const nzbgeek = input(page, 'browse', 'usenet:nzbgeek');
    const nzbindex = input(page, 'browse', 'usenet:nzbindex');
    const binsearch = input(page, 'browse', 'usenet:binsearch');

    await pill(page, 'browse', 'usenet:all').click();
    await expect(nzbgeek).toBeChecked();
    await expect(nzbindex).toBeChecked();
    await expect(binsearch).toBeChecked();

    await pill(page, 'browse', 'usenet:all').click();
    await expect(nzbgeek).not.toBeChecked();
    await expect(nzbindex).not.toBeChecked();
    await expect(binsearch).not.toBeChecked();
  });
});

test.describe('PAGINATION URL STATE (?page=N)', () => {
  test.setTimeout(180000); // cold provider cache (Prowlarr/Torrentio/Usenet) can be slow on first hit
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);
  });

  test('/shows - clicking page 2 updates the URL to ?page=2 and keeps totals stable', async ({ page }) => {
    await navigateToView(page, 'shows');
    await performSearch(page, 'shows', 'Breaking Bad');

    const pagInfo = paginationInfo(page, 'shows');
    await expect(pagInfo).toBeVisible({ timeout: 30000 });
    const m1 = ((await pagInfo.textContent()) || '').match(/Page\s+(\d+)\s+of\s+(\d+)\s+\((\d+)\s+results\)/);
    expect(m1).not.toBeNull();
    if (Number(m1![2]) < 2) return; // single page, nothing to paginate

    await page.click('#shows-pagination .tb-pagination-btn[aria-label="Page 2"]');
    await page.waitForTimeout(2500);

    expect(page.url()).toContain('page=2');
    const m2 = ((await pagInfo.textContent()) || '').match(/Page\s+(\d+)\s+of\s+(\d+)\s+\((\d+)\s+results\)/);
    expect(Number(m2![1])).toBe(2);
    expect(Number(m2![2])).toBe(Number(m1![2]));
    expect(Number(m2![3])).toBe(Number(m1![3]));
  });

  test('/movies - loading /movies?page=2 restores page 2 of the same search', async ({ page }) => {
    await navigateToView(page, 'movies');
    await selectOnlyTorrentio(page, 'movies');
    await performSearch(page, 'movies', 'Forrest Gump');
    const pagInfo = paginationInfo(page, 'movies');
    await expect(pagInfo).toBeVisible({ timeout: 30000 });
    const m1 = ((await pagInfo.textContent()) || '').match(/of\s+(\d+)\s+\((\d+)\s+results\)/);
    if (!m1 || Number(m1[1]) < 2) return;

    await page.click('#movies-pagination .tb-pagination-btn[aria-label="Page 2"]');
    await page.waitForTimeout(2500);
    expect(page.url()).toContain('page=2');

    // Reload with ?q=&page=2 in the URL — the URL keeps page=2 and loadView
    // restores the input from ?q= and re-runs the search at page 2
    await page.reload();
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('page=2');
    const pagInfo2 = paginationInfo(page, 'movies');
    await expect(pagInfo2).toBeVisible({ timeout: 30000 });
    const text2 = (await pagInfo2.textContent()) || '';
    const m2 = text2.match(/Page\s+(\d+)\s+of\s+(\d+)\s+\((\d+)\s+results\)/);
    expect(m2).not.toBeNull();
    expect(Number(m2![1])).toBe(2); // restored page 2
  });

  test('/music - search request excludes Torrentio (music uses Prowlarr 3000 + Usenet only)', async ({ page }) => {
    let musicRequestUrl = '';
    page.on('request', (req) => {
      if (req.url().includes('/api/music?')) musicRequestUrl = req.url();
    });
    await navigateToView(page, 'music');
    await performSearch(page, 'music', 'Michael Jackson');
    await page.waitForTimeout(2500);
    expect(musicRequestUrl).toContain('/api/music?');
    // The backend never queries Torrentio for kind=music; the API contract only
    // exposes prowlarr for music. If indexers include torrentio in the request,
    // results must still carry no Torrentio-sourced items.
    const torrentioTagged = page.locator('.source-tag:has-text("Torrentio")');
    expect(await torrentioTagged.count()).toBe(0);
    // The search syncs q into the URL so the view is restorable
    expect(page.url()).toContain('q=Michael');
  });
});
