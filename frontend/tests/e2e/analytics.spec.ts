import { test, expect } from '@playwright/test';
import { installBasePath } from './helpers';

test.describe('Analytics Page', () => {
    test.beforeEach(async ({ page }) => {
        installBasePath(page);
    });

    test('should navigate to analytics page', async ({ page }) => {
        await page.goto('/analytics');
        await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
    });

    test('should persist tab selection on refresh', async ({ page }) => {
        await page.goto('/analytics');

        // Click on Errors tab
        await page.getByRole('tab', { name: 'Errors' }).click();

        // URL should update
        await expect(page).toHaveURL(/.*tab=errors/);

        // Refresh
        await page.reload();

        // URL should still have tab=errors
        await expect(page).toHaveURL(/.*tab=errors/);

        // Errors tab should be active
        await expect(page.getByRole('tab', { name: 'Errors' })).toHaveAttribute('data-state', 'active');
    });
});
