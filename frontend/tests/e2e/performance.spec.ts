import { test, expect } from '@playwright/test';
import { installBasePath, withBase } from './helpers';

const MAX_LOAD_MS = Number(process.env.E2E_MAX_LOAD_MS || 15000);
const MAX_NAV_MS = Number(process.env.E2E_MAX_NAV_MS || 8000);

test.describe('Performance', () => {
    test.beforeEach(async ({ page }) => {
        installBasePath(page);
    });

    test('dashboard should load within acceptable time', async ({ page }) => {
        const startTime = Date.now();
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        const loadTime = Date.now() - startTime;
        
        // Keep generous defaults for port-forwarded/K8s environments.
        expect(loadTime).toBeLessThan(MAX_LOAD_MS);
    });

    test('navigation should be fast', async ({ page }) => {
        await page.goto('/');
        
        const startTime = Date.now();
        await page.click('text=Inventory');
        await page.waitForURL(withBase('/inventory'));
        const navigationTime = Date.now() - startTime;
        
        expect(navigationTime).toBeLessThan(MAX_NAV_MS);
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
        await expect(page).toHaveURL(withBase('/analytics'));
    });
});
