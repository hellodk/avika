import { test, expect } from '@playwright/test';
import { installBasePath, withBase } from './helpers';

const SETTINGS = withBase('/settings');

test.describe('Settings Page', () => {
    test.beforeEach(async ({ page }) => {
        installBasePath(page);
        await page.goto('/settings');
    });

    test('should load settings page', async ({ page }) => {
        await expect(page).toHaveURL(SETTINGS);
    });

    test('should display theme selection', async ({ page }) => {
        await page.waitForLoadState('networkidle');
        await expect(page.getByText('Configure your NGINX AI Manager').or(page.getByText('Appearance')).first()).toBeVisible({ timeout: 20000 });
        await expect(page.getByText('Active Theme').first()).toBeVisible();
    });

    test('should allow theme switching', async ({ page }) => {
        const appearance = page.getByText('Appearance').first();
        await appearance.scrollIntoViewIfNeeded();
        const themeTrigger = page.getByRole('button', { name: /Dark|Light|UI Kit|Rocker|Select Theme/i });
        await themeTrigger.scrollIntoViewIfNeeded();
        await themeTrigger.click();
        await expect(page.getByText(/Dark|Light|UI Kit|Rocker/i).first()).toBeVisible({ timeout: 5000 });
    });

    test('should list UI Kit and Rocker themes in appearance dropdown', async ({ page }) => {
        const appearance = page.getByText('Appearance').first();
        await appearance.scrollIntoViewIfNeeded();
        const themeTrigger = page.getByRole('button', { name: /Dark|Light|UI Kit|Rocker|Select Theme/i });
        await themeTrigger.scrollIntoViewIfNeeded();
        await themeTrigger.click();
        await expect(page.getByText('UI Kit').first()).toBeVisible({ timeout: 5000 });
        await expect(page.getByText('Rocker').first()).toBeVisible({ timeout: 5000 });
    });
});
