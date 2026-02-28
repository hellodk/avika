import { test, expect } from '@playwright/test';

test.describe('Performance', () => {
    test('dashboard should load within acceptable time', async ({ page }) => {
        const startTime = Date.now();
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        const loadTime = Date.now() - startTime;
        
        // Page should load within 5 seconds
        expect(loadTime).toBeLessThan(5000);
    });

    test('navigation should be fast', async ({ page }) => {
        await page.goto('/');
        
        const startTime = Date.now();
        await page.click('text=Inventory');
        await page.waitForURL('/inventory');
        const navigationTime = Date.now() - startTime;
        
        // Navigation should complete within 2 seconds
        expect(navigationTime).toBeLessThan(2000);
    });

    test('should not have JavaScript errors', async ({ page }) => {
        const errors: string[] = [];
        
        page.on('pageerror', (error) => {
            errors.push(error.message);
        });
        
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        
        // Navigate to a few pages
        await page.click('text=Inventory');
        await page.waitForLoadState('networkidle');
        
        await page.click('text=Settings');
        await page.waitForLoadState('networkidle');
        
        // Should have no JavaScript errors
        expect(errors).toHaveLength(0);
    });

    test('should handle rapid navigation', async ({ page }) => {
        await page.goto('/');
        
        // Rapidly navigate between pages
        const pages = ['Inventory', 'Alerts', 'Settings', 'Analytics'];
        
        for (const pageName of pages) {
            await page.click(`text=${pageName}`);
        }
        
        // Should end up on the last page without crashing
        await expect(page).toHaveURL('/analytics');
    });
});
