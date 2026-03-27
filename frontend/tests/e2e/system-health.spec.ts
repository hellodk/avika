import { test, expect } from '@playwright/test';
import { installBasePath, withBase, loginIfNeeded } from './helpers';

const SYSTEM = withBase('/system');

test.describe('System Health Page', () => {
    test.beforeEach(async ({ page }) => {
        // Mock the health and ready APIs
        await page.route('**/api/health', (route) => {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ status: 'healthy', version: '1.0.0', response_time_ms: 12 }),
            });
        });

        await page.route('**/api/ready', (route) => {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ database: 'connected', clickhouse: 'connected', status: 'ready' }),
            });
        });

        await page.route('**/api/servers**', (route) => {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ agents: [], system_version: '1.0.0' }),
            });
        });

        installBasePath(page);
        await page.goto('/system');
        await loginIfNeeded(page);
    });

    test('should load system health page', async ({ page }) => {
        await expect(page).toHaveURL(SYSTEM);
        await expect(page.getByText('System Overview')).toBeVisible();
    });

    test('should display healthy status for core infrastructure', async ({ page }) => {
        // Wait for at least one status badge to be healthy
        await expect(page.getByRole('status', { name: /healthy/i }).first()).toBeVisible({ timeout: 15000 });
        
        // Check API Gateway specifically
        const gatewayCard = page.locator('div').filter({ hasText: 'API Gateway' }).first();
        await expect(gatewayCard.getByRole('status', { name: /healthy/i })).toBeVisible();

        // Check PostgreSQL
        const pgCard = page.locator('div').filter({ hasText: 'PostgreSQL' }).first();
        await expect(pgCard.getByRole('status', { name: /healthy/i })).toBeVisible();
    });

    test('should show degraded status when components are down', async ({ page }) => {
        // Override the mock to simulate failure
        await page.route('**/api/ready', (route) => {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ database: 'disconnected', clickhouse: 'disconnected', status: 'not_ready' }),
            });
        });

        await page.reload({ waitUntil: 'networkidle' });
        await expect(page.getByRole('status', { name: /degraded/i }).first()).toBeVisible({ timeout: 15000 });
        
        const pgCard = page.locator('div').filter({ hasText: 'PostgreSQL' }).first();
        await expect(pgCard.getByRole('status', { name: /degraded/i })).toBeVisible();
    });
});
