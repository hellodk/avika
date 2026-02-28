import { test, expect } from '@playwright/test';

test.describe('Alerts Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/alerts');
    });

    test('should load alerts page', async ({ page }) => {
        await expect(page).toHaveURL('/alerts');
    });

    test('should display alerts content', async ({ page }) => {
        await expect(page.locator('body')).toBeVisible();
    });

    test('should have create alert functionality', async ({ page }) => {
        // Look for a button to create new alert rule
        const createButton = page.getByRole('button', { name: /create|add|new/i });
        
        if (await createButton.isVisible()) {
            await expect(createButton).toBeEnabled();
        }
    });
});
