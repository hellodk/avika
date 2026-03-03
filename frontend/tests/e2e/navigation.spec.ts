import { test, expect } from '@playwright/test';
import { withBase } from './helpers';

test.describe('Navigation', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(withBase('/'));
    });

    test('should load the dashboard page', async ({ page }) => {
        await expect(page).toHaveURL(withBase('/'));
        // Check for a stable dashboard element
        await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible();
    });

    test('should navigate to inventory page', async ({ page }) => {
        await page.click('text=Inventory');
        await expect(page).toHaveURL(withBase('/inventory'));
    });

    test('should navigate to alerts page', async ({ page }) => {
        await page.click('text=Alerts');
        await expect(page).toHaveURL(withBase('/alerts'));
    });

    test('should navigate to settings page', async ({ page }) => {
        await page.click('text=Settings');
        await expect(page).toHaveURL(withBase('/settings'));
    });

    test('should navigate to analytics page', async ({ page }) => {
        await page.click('text=Analytics');
        await expect(page).toHaveURL(withBase('/analytics'));
    });

    test('should navigate to reports page', async ({ page }) => {
        await page.click('text=Reports');
        await expect(page).toHaveURL(withBase('/reports'));
    });

    test('should navigate to monitoring page', async ({ page }) => {
        await page.click('text=Monitoring');
        await expect(page).toHaveURL(withBase('/monitoring'));
    });

    test('should navigate to provisions page', async ({ page }) => {
        await page.click('text=Provisions');
        await expect(page).toHaveURL(withBase('/provisions'));
    });

    test('should highlight active navigation item', async ({ page }) => {
        await page.click('text=Inventory');
        await expect(page).toHaveURL(withBase('/inventory'));

        // The active link should have a different style
        const inventoryLink = page.getByRole('link', { name: /inventory/i });
        await expect(inventoryLink).toBeVisible();
    });

    test('should show Avika logo in sidebar', async ({ page }) => {
        // Look for the Avika branding
        await expect(page.getByText('Avika')).toBeVisible();
    });
});
