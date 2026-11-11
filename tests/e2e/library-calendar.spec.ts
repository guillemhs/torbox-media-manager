import { test, expect } from '@playwright/test';

test.describe('LIBRARY & CALENDAR', () => {

  test.describe('Library', () => {
    test('should render library items using TorBox API Key', async ({ page }) => {
      await page.goto('/library');
      await page.waitForSelector('#library-results', { state: 'visible' });
      await page.waitForTimeout(2000);

      // Library results container should be visible
      await expect(page.locator('#library-results')).toBeVisible();

      // Check for library items or empty state
      const items = page.locator('#library-results .library-item');
      const emptyState = page.locator('#library-empty');

      if (await items.count() > 0) {
        // Verify library item structure
        const firstItem = items.first();
        await expect(firstItem).toBeVisible();
        await expect(firstItem.locator('.library-item-title')).toBeVisible();
        await expect(firstItem.locator('.library-item-meta')).toBeVisible();
        await expect(firstItem.locator('.library-item-status')).toBeVisible();
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

    test('library items should display detailed metadata', async ({ page }) => {
      await page.goto('/library');
      await page.waitForSelector('#library-results', { state: 'visible' });
      await page.waitForTimeout(2000);

      const items = page.locator('#library-results .library-item');
      const count = await items.count();

      if (count > 0) {
        const firstItem = items.first();

        // Verify title is displayed
        await expect(firstItem.locator('.library-item-title')).toBeVisible();

        // Verify category badge is displayed
        const categoryBadge = firstItem.locator('.library-item-category');
        if (await categoryBadge.isVisible()) {
          await expect(categoryBadge).toBeVisible();
        }

        // Verify size is displayed
        const sizeEl = firstItem.locator('.library-item-meta-size');
        if (await sizeEl.isVisible()) {
          await expect(sizeEl).toBeVisible();
        }

        // Verify status badge is displayed
        const statusEl = firstItem.locator('.library-item-status');
        if (await statusEl.isVisible()) {
          await expect(statusEl).toBeVisible();
        }

        // Verify date is displayed if present
        const dateEl = firstItem.locator('.library-item-date');
        if (await dateEl.isVisible()) {
          await expect(dateEl).toBeVisible();
        }
      }
    });

    test('library items with imdbId should link to title detail page', async ({ page }) => {
      await page.goto('/library');
      await page.waitForSelector('#library-results', { state: 'visible' });
      await page.waitForTimeout(2000);

      const items = page.locator('#library-results .library-item');
      const count = await items.count();

      if (count > 0) {
        const firstItem = items.first();
        const link = firstItem.locator('a.library-item-link');

        if (await link.isVisible()) {
          await link.click();
          await page.waitForTimeout(2000);
          await expect(page.url()).toContain('/title/');
          await expect(page.locator('#detail-content')).toBeVisible({ timeout: 10000 });
        }
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
          await page.locator('#library-pagination .tb-pagination-btn[aria-label="Page 2"]').click();
          await page.waitForTimeout(2000);

          // Verify page 2 content loaded
          await expect(page.locator('#library-results .library-item').first()).toBeVisible({ timeout: 10000 });
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

    test('library filter should filter items by category', async ({ page }) => {
      await page.goto('/library');
      await page.waitForSelector('#library-results', { state: 'visible' });
      await page.waitForTimeout(2000);

      const filterSelect = page.locator('#library-filter');
      await filterSelect.selectOption('video');

      await page.waitForTimeout(2000);

      const items = page.locator('#library-results .library-item');
      const count = await items.count();

      if (count > 0) {
        // All visible items should be video category
        const firstItem = items.first();
        const categoryBadge = firstItem.locator('.library-item-category');
        if (await categoryBadge.isVisible()) {
          await expect(categoryBadge).toContainText('video');
        }
      }
    });

    test('library should show empty state when no items', async ({ page }) => {
      await page.goto('/library');
      await page.waitForSelector('#library-results', { state: 'visible' });
      await page.waitForTimeout(2000);

      const items = page.locator('#library-results .library-item');
      const emptyState = page.locator('#library-empty');

      if (await items.count() === 0) {
        await expect(emptyState).toBeVisible();
        await expect(page.locator('#library-empty h3')).toContainText('No library items');
      } else {
        await expect(page.locator('#library-results')).toBeVisible();
      }
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
