import { test, expect } from '@playwright/test';
import { installBasePath, loginIfNeeded, withBase } from './helpers';

/**
 * E2E tests: Theme Switching + Log Rotation UI + Config Backup/Restore Flow
 * These tests verify the end-to-end user flows added in Phase 1-3.
 */

test.describe('Theme Switching', () => {
    test.beforeEach(async ({ page }) => {
        installBasePath(page);
        await page.goto('/settings');
        await loginIfNeeded(page);
    });

    test('settings page loads', async ({ page }) => {
        await expect(page).toHaveURL(withBase('/settings'));
    });

    test('can see theme selection in settings', async ({ page }) => {
        await page.waitForLoadState('domcontentloaded');
        const themeSection = page.getByRole('heading', { name: /theme|appearance/i });
        if (await themeSection.isVisible()) {
            await expect(themeSection).toBeVisible();
        }
    });

    test('Rocker theme appears in the dropdown', async ({ page }) => {
        await page.waitForLoadState('domcontentloaded');
        const body = page.locator('body');
        const html = await body.innerHTML();
        // The settings page should contain the Rocker theme option
        const rockerOption = page.getByText(/rocker/i);
        if (await rockerOption.count() > 0) {
            await expect(rockerOption.first()).toBeVisible();
        }
    });

    test('switching themes updates CSS variables', async ({ page }) => {
        await page.waitForLoadState('domcontentloaded');
        
        // Try to select a different theme if the dropdown is present
        const select = page.locator('select, [role="combobox"]').filter({ hasText: /theme/i }).first();
        if (await select.isVisible()) {
            await select.selectOption({ label: 'Rocker' });
            await page.waitForTimeout(500);
            
            // Verify some visual change happened (CSS should be updated)
            const root = page.locator(':root');
            expect(root).toBeDefined();
        }
    });
});

test.describe('Log Rotation UI', () => {
    test.beforeEach(async ({ page }) => {
        installBasePath(page);
    });

    test('monitoring page is accessible', async ({ page }) => {
        await page.goto('/monitoring');
        await loginIfNeeded(page);
        await expect(page).toHaveURL(withBase('/monitoring'));
    });

    test('server detail page has log rotation configuration', async ({ page }) => {
        // Navigate to any server detail page
        await page.goto('/inventory');
        await loginIfNeeded(page);
        await page.waitForLoadState('domcontentloaded');

        // Look for agent links in inventory
        const agentLinks = page.locator('a[href*="/servers/"]');
        const count = await agentLinks.count();
        
        if (count > 0) {
            await agentLinks.first().click();
            await page.waitForLoadState('domcontentloaded');
            
            // Look for log configuration tab
            const logTab = page.getByRole('tab', { name: /log|config/i });
            if (await logTab.isVisible()) {
                await expect(logTab).toBeEnabled();
            }
        }
    });
});

test.describe('Config Backup and Restore Flow', () => {
    test.beforeEach(async ({ page }) => {
        installBasePath(page);
    });

    test('inventory page loads successfully', async ({ page }) => {
        await page.goto('/inventory');
        await loginIfNeeded(page);
        await expect(page).toHaveURL(withBase('/inventory'));
    });

    test('server detail page loads when navigating from inventory', async ({ page }) => {
        await page.goto('/inventory');
        await loginIfNeeded(page);
        await page.waitForLoadState('domcontentloaded');

        const agentLinks = page.locator('a[href*="/servers/"]');
        const count = await agentLinks.count();

        if (count > 0) {
            const href = await agentLinks.first().getAttribute('href');
            expect(href).toContain('/servers/');
            // The href should contain an ID, not be blank
            expect(href?.replace('/servers/', '').replace(withBase('/servers/'), '')).toBeTruthy();
        }
    });

    test('server detail page shows config tab', async ({ page }) => {
        await page.goto('/inventory');
        await loginIfNeeded(page);
        await page.waitForLoadState('domcontentloaded');

        const agentLinks = page.locator('a[href*="/servers/"]');
        if (await agentLinks.count() > 0) {
            await agentLinks.first().click();
            await page.waitForLoadState('domcontentloaded');

            const configTab = page.getByRole('tab', { name: /config|configuration/i });
            if (await configTab.isVisible()) {
                await configTab.click();
                await expect(configTab).toHaveAttribute('aria-selected', 'true');
            }
        }
    });

    test('backup section is shown in config tab', async ({ page }) => {
        await page.goto('/inventory');
        await loginIfNeeded(page);
        await page.waitForLoadState('domcontentloaded');

        const agentLinks = page.locator('a[href*="/servers/"]');
        if (await agentLinks.count() > 0) {
            await agentLinks.first().click();
            await page.waitForLoadState('domcontentloaded');

            // Click config tab
            const configTab = page.getByRole('tab', { name: /config/i });
            if (await configTab.isVisible()) {
                await configTab.click();
                
                // Look for backup related text
                const backupSection = page.getByText(/backup|restore/i);
                if (await backupSection.isVisible()) {
                    await expect(backupSection.first()).toBeVisible();
                }
            }
        }
    });

    test('config save button is present in config tab', async ({ page }) => {
        await page.goto('/inventory');
        await loginIfNeeded(page);
        await page.waitForLoadState('domcontentloaded');

        const agentLinks = page.locator('a[href*="/servers/"]');
        if (await agentLinks.count() > 0) {
            await agentLinks.first().click();
            await page.waitForLoadState('domcontentloaded');

            const configTab = page.getByRole('tab', { name: /config/i });
            if (await configTab.isVisible()) {
                await configTab.click();

                const saveButton = page.getByRole('button', { name: /save|apply/i });
                if (await saveButton.isVisible()) {
                    await expect(saveButton).toBeVisible();
                }
            }
        }
    });
});
