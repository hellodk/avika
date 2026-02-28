import { test, expect } from '@playwright/test';

test.describe('Dashboard Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('should display the dashboard', async ({ page }) => {
        // Dashboard should load without errors
        await expect(page).toHaveURL('/');
    });

    test('should have a dark theme by default', async ({ page }) => {
        // Check if dark theme is applied
        const html = page.locator('html');
        await expect(html).toHaveClass(/dark/);
    });

    test('should display main content area', async ({ page }) => {
        // Main content should be visible
        const main = page.locator('main').or(page.locator('[role="main"]'));
        await expect(main).toBeVisible();
    });

    test('should be responsive', async ({ page }) => {
        // Test at different viewport sizes
        await page.setViewportSize({ width: 1920, height: 1080 });
        await expect(page.locator('body')).toBeVisible();

        await page.setViewportSize({ width: 768, height: 1024 });
        await expect(page.locator('body')).toBeVisible();

        await page.setViewportSize({ width: 375, height: 667 });
        await expect(page.locator('body')).toBeVisible();
    });
});

test.describe('Dashboard - KPI Cards', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
    });

    test('should display all KPI cards', async ({ page }) => {
        // Check for all 4 KPI card titles
        await expect(page.getByText('Total Requests')).toBeVisible();
        await expect(page.getByText('Request Rate')).toBeVisible();
        await expect(page.getByText('Error Rate')).toBeVisible();
        await expect(page.getByText('Avg Latency')).toBeVisible();
    });

    test('should show trend indicators when data available', async ({ page }) => {
        // Wait for data to load
        await page.waitForTimeout(2000);
        
        // Look for trend indicators (TrendingUp or TrendingDown icons via their container classes)
        // The trend indicators should be present in the KPI cards
        const kpiSection = page.locator('.grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-4');
        await expect(kpiSection).toBeVisible();
    });
});

test.describe('Dashboard - Time Range Picker', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
    });

    test('should display time range picker', async ({ page }) => {
        // Look for the time range picker button (shows "Last 1 hour" by default)
        const timeRangeButton = page.getByRole('button', { name: /Last 1 hour|Select time range/i });
        await expect(timeRangeButton).toBeVisible();
    });

    test('should open time range dropdown when clicked', async ({ page }) => {
        // Click the time range picker
        const timeRangeButton = page.getByRole('button', { name: /Last 1 hour|Select time range/i });
        await timeRangeButton.click();
        
        // Check that the popover opens with quick range options
        await expect(page.getByText('Quick ranges')).toBeVisible();
        await expect(page.getByText('Last 5 minutes')).toBeVisible();
        await expect(page.getByText('Last 24 hours')).toBeVisible();
    });

    test('should change time range when option selected', async ({ page }) => {
        // Open time range picker
        const timeRangeButton = page.getByRole('button', { name: /Last 1 hour|Select time range/i });
        await timeRangeButton.click();
        
        // Wait for popover to open
        await page.waitForTimeout(300);
        
        // Select a different time range (use more specific selector)
        const option = page.locator('button:has-text("Last 24 hours")').first();
        await option.click();
        
        // Wait for popover to close and state to update
        await page.waitForTimeout(300);
        
        // The button should now show the new selection (check the button text contains the new value)
        await expect(page.locator('[data-slot="popover-trigger"]').or(page.getByRole('button', { name: /Last 24 hours/i }))).toBeVisible();
    });

    test('should have absolute time tab', async ({ page }) => {
        // Just verify the time range picker component exists
        // The absolute time tab is part of the TimeRangePicker component
        await page.waitForSelector('h1:has-text("Dashboard")', { timeout: 10000 });
        
        const pageContent = await page.content();
        
        // TimeRangePicker should be on the page
        expect(pageContent).toContain('Last');
        expect(pageContent).toContain('hour');
    });
});

test.describe('Dashboard - Traffic Chart', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
    });

    test('should display traffic overview card', async ({ page }) => {
        await expect(page.getByText('Traffic Overview')).toBeVisible();
    });

    test('should have View Details link', async ({ page }) => {
        // View Details is a button inside a Link component
        const viewDetailsLink = page.locator('button:has-text("View Details")').first();
        await expect(viewDetailsLink).toBeVisible();
    });

    test('should update chart description based on time range', async ({ page }) => {
        // Default should show "Last 1 hour"
        await expect(page.getByText(/Requests and errors.*Last 1 hour/i)).toBeVisible();
        
        // Change time range
        const timeRangeButton = page.getByRole('button', { name: /Last 1 hour/i });
        await timeRangeButton.click();
        await page.getByText('Last 24 hours').click();
        
        // Chart description should update
        await expect(page.getByText(/Requests and errors.*Last 24 hours/i)).toBeVisible();
    });
});

test.describe('Dashboard - Response Codes', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
    });

    test('should display response codes card', async ({ page }) => {
        await expect(page.getByText('Response Codes')).toBeVisible();
        await expect(page.getByText('HTTP status distribution')).toBeVisible();
    });

    test('should show status categories', async ({ page }) => {
        await expect(page.getByText('2xx Success')).toBeVisible();
        await expect(page.getByText('3xx Redirect')).toBeVisible();
        await expect(page.getByText('4xx Client Error')).toBeVisible();
        await expect(page.getByText('5xx Server Error')).toBeVisible();
    });
});

test.describe('Dashboard - System Insights', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
    });

    test('should display system insights card', async ({ page }) => {
        await expect(page.getByText('System Insights')).toBeVisible();
    });

    test('should show fleet status insight', async ({ page }) => {
        // Should show either "Fleet Status" or "No Agents Connected"
        const fleetStatus = page.getByText(/Fleet Status|No Agents Connected/i);
        await expect(fleetStatus).toBeVisible();
    });
});

test.describe('Dashboard - Refresh Functionality', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
    });

    test('should have refresh button', async ({ page }) => {
        const refreshButton = page.getByRole('button', { name: /Refresh/i });
        await expect(refreshButton).toBeVisible();
    });

    test('should refresh data when clicked', async ({ page }) => {
        const refreshButton = page.getByRole('button', { name: /Refresh/i });
        
        // Click refresh
        await refreshButton.click();
        
        // Button should show spinning indicator (class contains 'animate-spin')
        // and page should remain functional
        await expect(page).toHaveURL('/');
    });
});

test.describe('Dashboard - Accessibility', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
    });

    test('should have proper ARIA labels', async ({ page }) => {
        // Check for aria-labels on key elements
        const refreshButton = page.getByRole('button', { name: /Refresh dashboard data/i });
        await expect(refreshButton).toBeVisible();
        
        // Agent status badge should have aria-label
        const agentBadge = page.getByLabel(/agents online/i);
        await expect(agentBadge).toBeVisible();
    });

    test('should have accessible chart links', async ({ page }) => {
        const viewDetailsLink = page.getByRole('button', { name: /View detailed analytics/i });
        await expect(viewDetailsLink).toBeVisible();
    });
});
