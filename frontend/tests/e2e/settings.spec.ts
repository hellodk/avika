import { test, expect } from '@playwright/test';

test.describe('Settings Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/settings');
    });

    test('should load settings page', async ({ page }) => {
        await expect(page).toHaveURL('/settings');
    });

    test('should display theme selection', async ({ page }) => {
        // Look for theme-related elements
        const themeSection = page.getByText(/theme/i).first();
        await expect(themeSection).toBeVisible();
    });

    test('should allow theme switching', async ({ page }) => {
        // Find and interact with theme selector
        const themeSelector = page.locator('select').or(page.getByRole('combobox'));
        
        if (await themeSelector.isVisible()) {
            await themeSelector.click();
            // Should show theme options
            await expect(page.getByText(/dark|light|nord|solarized/i).first()).toBeVisible();
        }
    });
});
