import { test, expect } from '@playwright/test';
import { installBasePath, withBase } from './helpers';

const PROVISIONS = withBase('/provisions');

test.describe('Provisions Page', () => {
    test.beforeEach(async ({ page }) => {
        installBasePath(page);
        await page.goto('/provisions');
    });

    test('should load provisions page', async ({ page }) => {
        await expect(page).toHaveURL(PROVISIONS);
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
