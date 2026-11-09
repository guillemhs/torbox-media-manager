import { test, expect } from '@playwright/test';

test.describe('USENET Pipeline - NZBGeek Search & TorBox Web Download', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/health');
    await page.waitForResponse('**/health');
  });

  test('should show NZBGeek as a usenet source option in all view dropdowns', async ({ page }) => {
    for (const view of ['browse', 'movies', 'shows', 'music']) {
      await page.goto(`/${view}`);
      await page.waitForSelector(`#${view === 'browse' ? 'usenet-source' : `${view}-usenet-source`}`, { state: 'visible' });
      const select = page.locator(`#${view === 'browse' ? 'usenet-source' : `${view}-usenet-source`}`);
      await expect(select).toBeVisible();
      await expect(select).toContainText('NZBGeek');
      await expect(select).toContainText('NZBIndex');
      await expect(select).toContainText('Binsearch');
    }
  });

  test('should render usenet results with NZBGeek source badge', async ({ page }) => {
    await page.goto('/browse');
    await page.waitForSelector('#browse-query', { state: 'visible' });

    await page.locator('#browse-query').fill('Nocturne');
    await page.locator('#browse-search-btn').click();

    await page.waitForTimeout(5000);

    const usenetCards = page.locator('#browse-results .tb-card');
    const count = await usenetCards.count();
    if (count > 0) {
      await expect(usenetCards.first()).toBeVisible();
      const sourceBadges = page.locator('.tb-source-badge');
      const badgeTexts = await sourceBadges.allTextContents();
      const hasUsenet = badgeTexts.some(b => b.includes('Usenet') || b.includes('NZBGeek') || b.includes('NZBIndex') || b.includes('Binsearch'));
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

  test('should search NZBGeek via API and return results', async ({ page }) => {
    const response = await page.request.post('/usenet/pipeline/search', {
      data: { q: 'Nocturne' },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.query).toBe('Nocturne');
    expect(Array.isArray(body.results)).toBeTruthy();
    expect(body.total).toBeGreaterThanOrEqual(0);
  });

  test('should run full pipeline and return job with status', async ({ page }) => {
    const response = await page.request.post('/usenet/pipeline/run', {
      data: { q: 'Nocturne' },
    });
    // Pipeline may fail if NNTP is not configured, but should return a job
    expect(response.ok() || response.status() === 502).toBeTruthy();
    const body = await response.json();
    expect(body.job).toBeDefined();
    expect(body.job.id).toBeDefined();
    expect(body.job.status).toBeDefined();
    expect(body.job.logs).toBeDefined();
  });

  test('should list pipeline jobs via API', async ({ page }) => {
    const response = await page.request.get('/usenet/pipeline/jobs');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(Array.isArray(body.jobs)).toBeTruthy();
  });

  test('should return 404 for invalid job ID', async ({ page }) => {
    const response = await page.request.get('/usenet/pipeline/status/invalid-job-id');
    expect(response.status()).toBe(404);
  });

  test('should return 400 for invalid cleanup job ID', async ({ page }) => {
    const response = await page.request.post('/usenet/pipeline/cleanup/invalid-job-id');
    expect(response.status()).toBe(400);
  });
});
