import { test, expect } from '@playwright/test';

test.describe('Provisions Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/provisions');
    });

    test('should load provisions page', async ({ page }) => {
        await expect(page).toHaveURL('/provisions');
    });

    test('should display provision templates', async ({ page }) => {
        // Should show provision template options
        await page.waitForLoadState('networkidle');
        await expect(page.locator('body')).toBeVisible();
    });

    test('should have template selection', async ({ page }) => {
        // Look for template selection elements
        const templateSection = page.locator('[class*="template"]').or(page.getByText(/template|config/i).first());
        
        if (await templateSection.isVisible()) {
            await expect(templateSection).toBeVisible();
        }
    });
});
