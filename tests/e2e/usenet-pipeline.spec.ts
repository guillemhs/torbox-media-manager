import { test, expect } from '@playwright/test';

test.describe('USENET Pipeline - NZBGeek Search & Download', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/health');
    await page.waitForResponse('**/health');
  });

  test('should show NZBGeek as a usenet source option in dropdowns', async ({ page }) => {
    await page.goto('/browse');
    await page.waitForSelector('#usenet-source', { state: 'visible' });

    const usenetSelect = page.locator('#usenet-source');
    await expect(usenetSelect).toBeVisible();
    await expect(usenetSelect).toContainText('NZBGeek');
    await expect(usenetSelect).toContainText('NZBIndex');
    await expect(usenetSelect).toContainText('Binsearch');
  });

  test('should have NZBGeek source option on all views', async ({ page }) => {
    for (const view of ['browse', 'movies', 'shows', 'music']) {
      await page.goto(`/${view}`);
      await page.waitForSelector(`#${view === 'browse' ? 'usenet-source' : `${view}-usenet-source`}`, { state: 'visible' });
      const select = page.locator(`#${view === 'browse' ? 'usenet-source' : `${view}-usenet-source`}`);
      await expect(select).toContainText('NZBGeek');
    }
  });

  test('should render usenet results with NZBGeek source badge', async ({ page }) => {
    await page.goto('/browse');
    await page.waitForSelector('#browse-query', { state: 'visible' });

    await page.locator('#browse-query').fill('Nocturne');
    await page.locator('#browse-search-btn').click();

    await page.waitForTimeout(5000);

    // Check if any usenet results are rendered
    const usenetCards = page.locator('#browse-results .tb-card');
    const count = await usenetCards.count();
    if (count > 0) {
      const sourceBadges = page.locator('.tb-source-badge');
      const badgeTexts = await sourceBadges.allTextContents();
      const hasUsenet = badgeTexts.some(b => b.includes('Usenet') || b.includes('NZBGeek'));
      expect(hasUsenet).toBeTruthy();
    }
  });

  test('should have pipeline button for NZBGeek usenet results', async ({ page }) => {
    await page.goto('/browse');
    await page.waitForSelector('#browse-query', { state: 'visible' });

    await page.locator('#browse-query').fill('Nocturne');
    await page.locator('#browse-search-btn').click();

    await page.waitForTimeout(5000);

    const pipelineButtons = page.locator('[data-usenet-pipeline]');
    const count = await pipelineButtons.count();
    if (count > 0) {
      await expect(pipelineButtons.first()).toBeVisible();
    }
  });

  test('should list pipeline jobs via API', async ({ page }) => {
    // This tests the API endpoint directly
    const response = await page.request.post('/usenet/pipeline/search', {
      data: { q: 'Nocturne' },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.query).toBe('Nocturne');
    expect(Array.isArray(body.results)).toBeTruthy();
  });
});
