import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8066';

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
  await page.waitForTimeout(2500);
}

async function selectOnlyTorrentio(page: any, view: string) {
  // Deselect the "all" indexers pill, then select only Torrentio
  const allBox = page.locator(`input[name="${view}-source"][value="indexers:all"]`);
  if (await allBox.isChecked()) await allBox.uncheck();
  const prowlarr = page.locator(`input[name="${view}-source"][value="indexers:prowlarr"]`);
  if (await prowlarr.isChecked()) await prowlarr.uncheck();
  const torrentio = page.locator(`input[name="${view}-source"][value="indexers:torrentio"]`);
  if (!(await torrentio.isChecked())) await torrentio.check();
}

function paginationInfo(page: any, view: string) {
  const pagId = view === 'browse' ? 'browse-pagination' : `${view}-pagination`;
  return page.locator(`#${pagId} .tb-pagination-info`);
}

test.describe('PAGINATION CONSISTENCY', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);
  });

  test('/shows - "nocturne s01e02" Torrentio pagination keeps total stable across pages', async ({ page }) => {
    await navigateToView(page, 'shows');
    await selectOnlyTorrentio(page, 'shows');
    await performSearch(page, 'shows', 'nocturne s01e02');

    const pagInfo = paginationInfo(page, 'shows');
    await expect(pagInfo).toBeVisible({ timeout: 15000 });

    const page1Text = (await pagInfo.textContent()) || '';
    const match1 = page1Text.match(/Page\s+(\d+)\s+of\s+(\d+)\s+\((\d+)\s+results\)/);
    expect(match1).not.toBeNull();
    const totalPages1 = Number(match1![2]);
    const totalResults1 = Number(match1![3]);
    expect(totalResults1).toBeGreaterThan(20); // multi-page result set
    expect(totalPages1).toBeGreaterThan(1);

    // Click page 2
    await page.click('#shows-pagination .tb-pagination-btn[data-page="2"]');
    await page.waitForTimeout(2500);

    const page2Text = (await pagInfo.textContent()) || '';
    const match2 = page2Text.match(/Page\s+(\d+)\s+of\s+(\d+)\s+\((\d+)\s+results\)/);
    expect(match2).not.toBeNull();
    expect(Number(match2![1])).toBe(2);
    // The bug: total changed between pages (74 -> 37). It must stay identical.
    expect(Number(match2![2])).toBe(totalPages1);
    expect(Number(match2![3])).toBe(totalResults1);

    // Navigate to the last page — totals must still match
    await page.click(`#shows-pagination .tb-pagination-btn[data-page="${totalPages1}"]`);
    await page.waitForTimeout(2500);
    const lastText = (await pagInfo.textContent()) || '';
    const matchLast = lastText.match(/Page\s+(\d+)\s+of\s+(\d+)\s+\((\d+)\s+results\)/);
    expect(Number(matchLast![2])).toBe(totalPages1);
    expect(Number(matchLast![3])).toBe(totalResults1);
  });

  test('/movies - pagination totals are consistent between page 1 and page 2', async ({ page }) => {
    await navigateToView(page, 'movies');
    await performSearch(page, 'movies', 'Forrest Gump');

    const pagInfo = paginationInfo(page, 'movies');
    await expect(pagInfo).toBeVisible({ timeout: 15000 });
    const text1 = (await pagInfo.textContent()) || '';
    const m1 = text1.match(/Page\s+(\d+)\s+of\s+(\d+)\s+\((\d+)\s+results\)/);
    expect(m1).not.toBeNull();
    if (Number(m1![2]) < 2) return; // not multi-page, nothing to verify

    await page.click('#movies-pagination .tb-pagination-btn[data-page="2"]');
    await page.waitForTimeout(2500);
    const text2 = (await pagInfo.textContent()) || '';
    const m2 = text2.match(/Page\s+(\d+)\s+of\s+(\d+)\s+\((\d+)\s+results\)/);
    expect(Number(m2![2])).toBe(Number(m1![2]));
    expect(Number(m2![3])).toBe(Number(m1![3]));
  });

  test('/browse - pagination totals are consistent between page 1 and page 2', async ({ page }) => {
    await navigateToView(page, 'browse');
    await performSearch(page, 'browse', 'Nocturne');

    const pagInfo = paginationInfo(page, 'browse');
    await expect(pagInfo).toBeVisible({ timeout: 15000 });
    const text1 = (await pagInfo.textContent()) || '';
    const m1 = text1.match(/Page\s+(\d+)\s+of\s+(\d+)\s+\((\d+)\s+results\)/);
    expect(m1).not.toBeNull();
    if (Number(m1![2]) < 2) return;

    await page.click('#browse-pagination .tb-pagination-btn[data-page="2"]');
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
    const allBox = page.locator('input[name="browse-source"][value="indexers:all"]');
    const prowlarr = page.locator('input[name="browse-source"][value="indexers:prowlarr"]');
    const torrentio = page.locator('input[name="browse-source"][value="indexers:torrentio"]');

    // Initial: indexers:all is checked -> children should be checked too
    await expect(allBox).toBeChecked();
    await expect(prowlarr).toBeChecked();
    await expect(torrentio).toBeChecked();

    // Deselect ALL -> children deselect
    await allBox.uncheck();
    await expect(prowlarr).not.toBeChecked();
    await expect(torrentio).not.toBeChecked();

    // Select ALL -> children select
    await allBox.check();
    await expect(prowlarr).toBeChecked();
    await expect(torrentio).toBeChecked();
  });

  test('toggling Usenet-ALL checks/unchecks NZBGeek, NZBIndex, Binsearch', async ({ page }) => {
    await navigateToView(page, 'browse');
    const allBox = page.locator('input[name="browse-source"][value="usenet:all"]');
    const nzbgeek = page.locator('input[name="browse-source"][value="usenet:nzbgeek"]');
    const nzbindex = page.locator('input[name="browse-source"][value="usenet:nzbindex"]');
    const binsearch = page.locator('input[name="browse-source"][value="usenet:binsearch"]');

    await allBox.check();
    await expect(nzbgeek).toBeChecked();
    await expect(nzbindex).toBeChecked();
    await expect(binsearch).toBeChecked();

    await allBox.uncheck();
    await expect(nzbgeek).not.toBeChecked();
    await expect(nzbindex).not.toBeChecked();
    await expect(binsearch).not.toBeChecked();
  });
});
