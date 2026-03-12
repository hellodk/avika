import { test, expect } from '@playwright/test';
import { installBasePath, loginIfNeeded, withBase } from './helpers';

/**
 * Performance tests: 30-day backup retention ClickHouse query latency
 * and general API response time checks.
 */

const ACCEPTABLE_API_LATENCY_MS = 3000; // APIs should respond within 3s

test.describe('API Response Latency', () => {
    test.beforeEach(async ({ page }) => {
        installBasePath(page);
        await page.goto('/');
        await loginIfNeeded(page);
        await page.waitForLoadState('domcontentloaded');
    });

    test('/api/servers responds within acceptable latency', async ({ request }) => {
        const start = Date.now();
        const response = await request.get('/api/servers');
        const elapsed = Date.now() - start;

        // API should respond regardless of error status
        expect(elapsed).toBeLessThan(ACCEPTABLE_API_LATENCY_MS);
    });

    test('/api/analytics responds within acceptable latency', async ({ request }) => {
        const start = Date.now();
        const response = await request.get('/api/analytics?window=1h');
        const elapsed = Date.now() - start;

        expect(elapsed).toBeLessThan(ACCEPTABLE_API_LATENCY_MS);
    });

    test('dashboard page renders within acceptable time', async ({ page }) => {
        const start = Date.now();
        await page.goto('/');
        await loginIfNeeded(page);
        await page.waitForLoadState('domcontentloaded');
        const elapsed = Date.now() - start;

        // Page should fully load within 10s
        expect(elapsed).toBeLessThan(10000);
        await expect(page.locator('body')).toBeVisible();
    });
});

test.describe('Backup Retention Query Performance', () => {
    test.beforeEach(async ({ page }) => {
        installBasePath(page);
    });

    test('config backup API endpoint responds quickly', async ({ request }) => {
        // This tests the response time of the backup listing endpoint
        // The 30-day retention filter should not cause index scan issues
        const start = Date.now();
        const response = await request.get('/api/servers/mock-agent-1/config/backups');
        const elapsed = Date.now() - start;

        // Even for 30-day retention, query should be fast
        expect(elapsed).toBeLessThan(ACCEPTABLE_API_LATENCY_MS);
    });

    test('inventory page renders agent list efficiently', async ({ page }) => {
        const start = Date.now();
        await page.goto('/inventory');
        await loginIfNeeded(page);
        await page.waitForLoadState('domcontentloaded');
        const elapsed = Date.now() - start;

        // Inventory should load even with many agents
        expect(elapsed).toBeLessThan(10000);
        await expect(page.locator('body')).toBeVisible();
    });

    test('analytics page handles time ranges up to 30 days', async ({ request }) => {
        const start = Date.now();
        const response = await request.get('/api/analytics?window=30d');
        const elapsed = Date.now() - start;

        // 30-day analytics queries should still be well-indexed
        expect(elapsed).toBeLessThan(ACCEPTABLE_API_LATENCY_MS);
    });
});

test.describe('Concurrent Request Handling', () => {
    test('multiple API requests complete without timeout', async ({ request }) => {
        const start = Date.now();

        // Fire multiple API requests concurrently
        const results = await Promise.allSettled([
            request.get('/api/servers'),
            request.get('/api/analytics?window=1h'),
            request.get('/api/analytics?window=24h'),
        ]);

        const elapsed = Date.now() - start;

        // All requests (success or auth failure) should complete quickly
        expect(elapsed).toBeLessThan(ACCEPTABLE_API_LATENCY_MS * 2);
        expect(results).toHaveLength(3);
    });
});
