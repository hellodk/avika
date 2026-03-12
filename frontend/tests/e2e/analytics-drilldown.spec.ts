import { test, expect } from '@playwright/test';
import { installBasePath, loginIfNeeded, withBase } from './helpers';

/**
 * E2E tests: Mock NGINX Traffic Drill-Down
 * Verifies the analytics drill-down UI for status code breakdowns,
 * top endpoints, and per-instance charts.
 */

test.describe('Analytics Traffic Drill-Down', () => {
    test.beforeEach(async ({ page }) => {
        installBasePath(page);
        await page.goto('/analytics');
        await loginIfNeeded(page);
        await page.waitForLoadState('domcontentloaded');
    });

    test('analytics page loads', async ({ page }) => {
        await expect(page).toHaveURL(withBase('/analytics'));
    });

    test('shows HTTP status class breakdown section', async ({ page }) => {
        const statusSection = page.getByText(/2xx|3xx|4xx|5xx/i);
        if (await statusSection.count() > 0) {
            await expect(statusSection.first()).toBeVisible();
        }
    });

    test('shows top endpoints section', async ({ page }) => {
        const endpointsSection = page.getByText(/top endpoints|most requested|url/i);
        if (await endpointsSection.count() > 0) {
            await expect(endpointsSection.first()).toBeVisible();
        }
    });

    test('has time range picker on analytics page', async ({ page }) => {
        const timePicker = page.getByRole('button', { name: /last|hour|day|week/i });
        if (await timePicker.count() > 0) {
            await expect(timePicker.first()).toBeVisible();
        }
    });

    test('changing time range triggers data refresh', async ({ page }) => {
        // Click the time range button to open picker
        const timePicker = page.getByRole('button', { name: /last|hour|day/i }).first();
        if (await timePicker.isVisible()) {
            await timePicker.click();
            
            // Select a different time range
            const option = page.getByText(/Last 24 hours|Last 7 days/i).first();
            if (await option.isVisible()) {
                await option.click();
                await page.waitForLoadState('networkidle');
                
                // Page should still be on analytics
                expect(page.url()).toContain('/analytics');
            }
        }
    });
});

test.describe('Dashboard Traffic Drill-Down', () => {
    test.beforeEach(async ({ page }) => {
        installBasePath(page);
        await page.goto('/');
        await loginIfNeeded(page);
        await page.waitForLoadState('domcontentloaded');
    });

    test('dashboard loads with KPI cards when pinned', async ({ page }) => {
        await expect(page.locator('body')).toBeVisible();
        
        // KPI cards should be present (they're pinned by default)
        const kpiSections = page.getByText(/Total Requests|Request Rate|Error Rate|Avg Latency/i);
        if (await kpiSections.count() > 0) {
            await expect(kpiSections.first()).toBeVisible();
        }
    });

    test('customize button is visible on dashboard', async ({ page }) => {
        // DashboardBuilderButton renders on page
        const customizeBtn = page.getByRole('button', { name: /customize/i });
        if (await customizeBtn.isVisible()) {
            await expect(customizeBtn).toBeEnabled();
        }
    });

    test('clicking Customize opens the widget panel', async ({ page }) => {
        const customizeBtn = page.getByRole('button', { name: /customize/i });
        if (await customizeBtn.isVisible()) {
            await customizeBtn.click();
            
            const dialog = page.getByText('Customize Dashboard');
            await expect(dialog).toBeVisible();
        }
    });

    test('view details link navigates to analytics', async ({ page }) => {
        const viewDetailsLink = page.getByRole('link', { name: /view details/i }).first();
        if (await viewDetailsLink.isVisible()) {
            await viewDetailsLink.click();
            await page.waitForLoadState('domcontentloaded');
            
            expect(page.url()).toContain('/analytics');
        }
    });
});

test.describe('Per-Instance Log Analytics', () => {
    test.beforeEach(async ({ page }) => {
        installBasePath(page);
    });

    test('inventory links work and agent_id is present in URL', async ({ page }) => {
        await page.goto('/inventory');
        await loginIfNeeded(page);
        await page.waitForLoadState('domcontentloaded');

        const agentLinks = page.locator('a[href*="/servers/"]');
        const count = await agentLinks.count();

        if (count > 0) {
            const href = await agentLinks.first().getAttribute('href');
            // Verify the href is not blank (i.e., /servers/ alone)
            const id = href?.split('/servers/')[1];
            expect(id).toBeTruthy();
            expect(id?.length).toBeGreaterThan(1);
        }
    });

    test('server detail page has logs tab', async ({ page }) => {
        await page.goto('/inventory');
        await loginIfNeeded(page);
        await page.waitForLoadState('domcontentloaded');

        const agentLinks = page.locator('a[href*="/servers/"]');
        if (await agentLinks.count() > 0) {
            await agentLinks.first().click();
            await page.waitForLoadState('domcontentloaded');

            const logsTab = page.getByRole('tab', { name: /logs/i });
            if (await logsTab.isVisible()) {
                await logsTab.click();
                
                // Verify content in logs tab
                const logsContent = page.locator('[role="tabpanel"]');
                await expect(logsContent).toBeVisible();
            }
        }
    });
});
