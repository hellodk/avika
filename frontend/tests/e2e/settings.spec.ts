import { test, expect } from '@playwright/test';
import { installBasePath, withBase } from './helpers';

const SETTINGS = withBase('/settings');

test.describe('Settings Page', () => {
    test.beforeEach(async ({ page }) => {
        // Mock the settings API
        await page.route('**/api/settings', (route) => {
            const method = route.request().method();
            if (method === 'GET') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        integrations: {
                            grafana_url: 'http://grafana.local',
                            prometheus_url: 'http://prometheus.local',
                            clickhouse_url: 'http://clickhouse.local',
                        }
                    }),
                });
            }
            if (method === 'POST') {
                return route.fulfill({ status: 200 });
            }
            return route.continue();
        });

        installBasePath(page);
        await page.goto('/settings');
    });

    test('should load settings page and display current integrations', async ({ page }) => {
        await expect(page).toHaveURL(SETTINGS);
        await expect(page.locator('input[placeholder*="grafana.com"]')).toHaveValue('http://grafana.local');
    });

    test('should persist integration changes after save and reload', async ({ page }) => {
        const grafanaInput = page.locator('input[placeholder*="grafana.com"]');
        await grafanaInput.fill('http://new-grafana.io');
        
        // Mock updated GET response for after reload
        await page.route('**/api/settings', (route) => {
            if (route.request().method() === 'GET') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        integrations: {
                            grafana_url: 'http://new-grafana.io',
                        }
                    }),
                });
            }
            return route.continue();
        });

        await page.getByRole('button', { name: /Save Changes/i }).click();
        await expect(page.getByText('Settings saved')).toBeVisible();
        
        // Reload and verify
        await page.reload();
        await expect(page.locator('input[placeholder*="grafana.com"]')).toHaveValue('http://new-grafana.io');
    });

    test('should allow theme switching', async ({ page }) => {
        const themeTrigger = page.getByRole('button', { name: /Dark|Light|Select Theme/i });
        await themeTrigger.scrollIntoViewIfNeeded();
        await themeTrigger.click();
        await expect(page.getByText(/Dark|Light/i).first()).toBeVisible({ timeout: 5000 });
    });
});
