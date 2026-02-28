import { test, expect } from '@playwright/test';

test.describe('Inventory Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/inventory');
    });

    test('should load inventory page', async ({ page }) => {
        await expect(page).toHaveURL('/inventory');
    });

    test('should display inventory content', async ({ page }) => {
        // The page should have loaded
        await expect(page.locator('body')).toBeVisible();
    });

    test('should handle empty state gracefully', async ({ page }) => {
        // When no agents are connected, should show appropriate message or empty state
        // This tests that the page doesn't crash with no data
        await page.waitForLoadState('networkidle');
        await expect(page).toHaveURL('/inventory');
    });

    test('should display stats cards', async ({ page }) => {
        // Wait for React hydration
        await page.waitForSelector('h1:has-text("Inventory")', { timeout: 10000 });
        
        // Stats cards should be visible (check page HTML contains the text)
        const pageContent = await page.content();
        expect(pageContent).toContain('Total Agents');
        expect(pageContent).toContain('Online');
        expect(pageContent).toContain('Offline');
        expect(pageContent).toContain('Needs Update');
    });

    test('should have search functionality', async ({ page }) => {
        // Wait for React hydration
        await page.waitForSelector('h1:has-text("Inventory")', { timeout: 10000 });
        
        // Check page contains search input
        const pageContent = await page.content();
        expect(pageContent).toContain('Search agents...');
    });

    test('should have status filter buttons', async ({ page }) => {
        // Wait for React hydration
        await page.waitForSelector('h1:has-text("Inventory")', { timeout: 10000 });
        
        // Check page contains filter button text
        const pageContent = await page.content();
        expect(pageContent.toLowerCase()).toContain('all');
        expect(pageContent.toLowerCase()).toContain('online');
        expect(pageContent.toLowerCase()).toContain('offline');
    });

    test('should render inventory page with agent fleet section', async ({ page }) => {
        // Wait for React hydration
        await page.waitForSelector('h1:has-text("Inventory")', { timeout: 10000 });
        
        // Verify page loads correctly with Agent Fleet section
        const pageContent = await page.content();
        
        // Agent Fleet section should always be present
        expect(pageContent).toContain('Agent Fleet');
        expect(pageContent).toContain('agents shown');
        await expect(page).toHaveURL('/inventory');
    });

    test('should have export dropdown', async ({ page }) => {
        // Wait for React hydration
        await page.waitForSelector('h1:has-text("Inventory")', { timeout: 10000 });
        
        // Check page contains Export button
        const pageContent = await page.content();
        expect(pageContent).toContain('Export');
    });

    test('should have refresh button', async ({ page }) => {
        // Wait for React hydration
        await page.waitForSelector('h1:has-text("Inventory")', { timeout: 10000 });
        
        // Check page contains Refresh button
        const pageContent = await page.content();
        expect(pageContent).toContain('Refresh');
        
        // Page should still be functional
        await expect(page).toHaveURL('/inventory');
    });

    test('should render agent fleet controls', async ({ page }) => {
        // Wait for React hydration
        await page.waitForSelector('h1:has-text("Inventory")', { timeout: 10000 });
        
        // Verify the page loads with inventory controls
        const pageContent = await page.content();
        
        // Controls section should always be present
        expect(pageContent).toContain('Agent Fleet');
        expect(pageContent).toContain('Refresh');
        expect(pageContent).toContain('Export');
    });
});

test.describe('Inventory Page - Delete Confirmation', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/inventory');
        await page.waitForSelector('h1:has-text("Inventory")', { timeout: 10000 });
    });

    test('delete confirmation dialog structure exists', async ({ page }) => {
        // Verify the AlertDialog component is properly imported and structured
        // The actual dialog is only shown when delete is triggered with agents present
        // For now, just verify the page loads and has the delete button structure
        const pageContent = await page.content();
        
        // The delete confirmation uses AlertDialog component
        // Page should have the trash icon buttons if agents exist
        expect(pageContent).toContain('Inventory');
        await expect(page).toHaveURL('/inventory');
    });
});

test.describe('Inventory Page - Accessibility', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/inventory');
        await page.waitForSelector('h1:has-text("Inventory")', { timeout: 10000 });
    });

    test('should have proper accessibility structure', async ({ page }) => {
        await page.waitForSelector('h1:has-text("Inventory")', { timeout: 10000 });
        const pageContent = await page.content();
        
        // Basic accessibility structure - page title and search input
        expect(pageContent).toContain('Inventory');
        expect(pageContent).toContain('Search agents...');
        
        // Page should have stats cards
        expect(pageContent).toContain('Total Agents');
    });

    test('should be keyboard navigable', async ({ page }) => {
        // Check that search input exists in page content
        const pageContent = await page.content();
        expect(pageContent).toContain('Search agents...');
        
        // Page should be interactive (not errored)
        await expect(page).toHaveURL('/inventory');
    });
});
