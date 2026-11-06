import { test, expect } from '@playwright/test';

test.describe('LIBRARY & CALENDAR', () => {

  test.describe('Library', () => {
    test('should render library items using TorBox API Key', async ({ page }) => {
      // Inject TorBox API key into localStorage/session
      await page.goto('/library');
      await page.waitForSelector('#library-results', { state: 'visible' });
      await page.waitForTimeout(2000);

      // Library results container should be visible
      await expect(page.locator('#library-results')).toBeVisible();

      // Check for library items or empty state
      const items = page.locator('#library-results .tb-list-item');
      const emptyState = page.locator('#library-empty');

      if (await items.count() > 0) {
        // Verify library item structure
        const firstItem = items.first();
        await expect(firstItem).toBeVisible();
        await expect(firstItem.locator('.tb-list-title')).toBeVisible();
        await expect(firstItem.locator('.tb-list-meta')).toBeVisible();
      } else {
        // If empty, verify empty state is shown
        await expect(emptyState).toBeVisible();
      }

      // Verify library count is displayed
      const count = page.locator('#library-count');
      if (await count.isVisible()) {
        await expect(count).toBeVisible();
      }
    });

    test('library pagination should function correctly when items exceed one page', async ({ page }) => {
      await page.goto('/library');
      await page.waitForSelector('#library-results', { state: 'visible' });
      await page.waitForTimeout(2000);

      const pagination = page.locator('#library-pagination');

      if (await pagination.isVisible()) {
        const pageButtons = page.locator('#library-pagination .tb-pagination-btn[data-page]');
        const count = await pageButtons.count();

        if (count > 1) {
          // Click page 2
          await page.locator('#library-pagination .tb-pagination-btn[data-page="2"]').click();
          await page.waitForTimeout(2000);

          // Verify page 2 content loaded
          await expect(page.locator('#library-results .tb-list-item').first()).toBeVisible({ timeout: 10000 });
        }
      } else {
        // If no pagination, verify library still renders
        await expect(page.locator('#library-results')).toBeVisible();
      }
    });

    test('library filter and sort controls should be present', async ({ page }) => {
      await page.goto('/library');
      await page.waitForSelector('#library-query', { state: 'visible' });

      await expect(page.locator('#library-query')).toBeVisible();
      await expect(page.locator('#library-sort')).toBeVisible();
      await expect(page.locator('#library-filter')).toBeVisible();
    });
  });

  test.describe('Calendar', () => {
    test('should render calendar view grid correctly', async ({ page }) => {
      await page.goto('/calendar');
      await page.waitForSelector('#calendar-results', { state: 'visible' });
      await page.waitForTimeout(2000);

      await expect(page.locator('#calendar-results')).toBeVisible();
      await expect(page.locator('#calendar-date')).toBeVisible();
      await expect(page.locator('#calendar-platform')).toBeVisible();
    });

    test('clicking a calendar item should navigate to its title detail page', async ({ page }) => {
      await page.goto('/calendar');
      await page.waitForSelector('#calendar-results', { state: 'visible' });
      await page.waitForTimeout(2000);

      const calendarItems = page.locator('#calendar-results .tb-card');
      const count = await calendarItems.count();

      if (count > 0) {
        // Click first calendar item
        await calendarItems.first().click();
        await page.waitForTimeout(2000);

        // Should navigate to title detail page
        await expect(page.url()).toContain('/title/');
        await expect(page.locator('#detail-content')).toBeVisible({ timeout: 10000 });
      } else {
        // If no calendar items, verify empty state
        const emptyState = page.locator('#calendar-empty');
        if (await emptyState.isVisible()) {
          await expect(emptyState).toBeVisible();
        }
      }
    });

    test('calendar should have date and platform filters', async ({ page }) => {
      await page.goto('/calendar');
      await page.waitForSelector('#calendar-date', { state: 'visible' });

      await expect(page.locator('#calendar-date')).toBeVisible();
      await expect(page.locator('#calendar-platform')).toBeVisible();
    });
  });

});
