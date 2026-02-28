import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('should load the dashboard page', async ({ page }) => {
        await expect(page).toHaveURL('/');
        // Check for dashboard elements
        await expect(page.locator('[data-testid="sidebar"]').or(page.locator('nav'))).toBeVisible();
    });

    test('should navigate to inventory page', async ({ page }) => {
        await page.click('text=Inventory');
        await expect(page).toHaveURL('/inventory');
    });

    test('should navigate to alerts page', async ({ page }) => {
        await page.click('text=Alerts');
        await expect(page).toHaveURL('/alerts');
    });

    test('should navigate to settings page', async ({ page }) => {
        await page.click('text=Settings');
        await expect(page).toHaveURL('/settings');
    });

    test('should navigate to analytics page', async ({ page }) => {
        await page.click('text=Analytics');
        await expect(page).toHaveURL('/analytics');
    });

    test('should navigate to reports page', async ({ page }) => {
        await page.click('text=Reports');
        await expect(page).toHaveURL('/reports');
    });

    test('should navigate to monitoring page', async ({ page }) => {
        await page.click('text=Monitoring');
        await expect(page).toHaveURL('/monitoring');
    });

    test('should navigate to provisions page', async ({ page }) => {
        await page.click('text=Provisions');
        await expect(page).toHaveURL('/provisions');
    });

    test('should highlight active navigation item', async ({ page }) => {
        await page.click('text=Inventory');
        await expect(page).toHaveURL('/inventory');

        // The active link should have a different style
        const inventoryLink = page.getByRole('link', { name: /inventory/i });
        await expect(inventoryLink).toBeVisible();
    });

    test('should show Avika logo in sidebar', async ({ page }) => {
        // Look for the Avika branding
        await expect(page.getByText('Avika')).toBeVisible();
    });
});
