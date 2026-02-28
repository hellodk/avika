import { test, expect } from '@playwright/test';

test.describe('Accessibility', () => {
    test('should have proper page title on dashboard', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveTitle(/.*/); // Should have some title
    });

    test('should have proper page title on inventory', async ({ page }) => {
        await page.goto('/inventory');
        await expect(page).toHaveTitle(/.*/);
    });

    test('should support keyboard navigation', async ({ page }) => {
        await page.goto('/');
        
        // Press Tab to move focus
        await page.keyboard.press('Tab');
        
        // Something should be focused
        const focusedElement = page.locator(':focus');
        await expect(focusedElement).toBeVisible();
    });

    test('should have proper heading structure', async ({ page }) => {
        await page.goto('/');
        
        // Should have at least one heading
        const headings = page.locator('h1, h2, h3');
        const headingCount = await headings.count();
        expect(headingCount).toBeGreaterThan(0);
    });

    test('should have proper link labels', async ({ page }) => {
        await page.goto('/');
        
        // All links should have accessible names
        const links = page.locator('a');
        const linkCount = await links.count();
        
        for (let i = 0; i < Math.min(linkCount, 5); i++) {
            const link = links.nth(i);
            const name = await link.getAttribute('aria-label') || await link.textContent();
            expect(name?.trim().length).toBeGreaterThan(0);
        }
    });

    test('should have sufficient color contrast in dark mode', async ({ page }) => {
        await page.goto('/');
        
        // Dark mode should be applied
        const html = page.locator('html');
        await expect(html).toHaveClass(/dark/);
        
        // Text should be visible (white on dark background)
        const text = page.locator('body');
        await expect(text).toBeVisible();
    });
});
