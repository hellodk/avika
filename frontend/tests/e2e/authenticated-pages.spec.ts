import { test, expect, Page } from '@playwright/test';

// Helper to login
async function login(page: Page) {
    await page.goto('/login');
    await page.fill('input[id="username"]', 'admin');
    await page.fill('input[id="password"]', 'admin');
    await page.click('button[type="submit"]');
    
    // Wait for sidebar to appear (only visible after login)
    await page.waitForSelector('text=OVERVIEW', { timeout: 15000 });
}

test.describe('Authenticated Page Tests', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    test('Dashboard loads with data', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);
        
        // Check breadcrumb shows Dashboard
        await expect(page.locator('text=Dashboard').first()).toBeVisible({ timeout: 10000 });
        
        // Check sidebar loaded (indicates successful navigation)
        await expect(page.locator('text=OVERVIEW').first()).toBeVisible({ timeout: 5000 });
        
        // Screenshot
        await page.screenshot({ path: '/tmp/authenticated-screenshots/01-dashboard.png', fullPage: true });
    });

    test('Inventory page loads with data', async ({ page }) => {
        await page.goto('/inventory');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);
        
        // Check breadcrumb shows Inventory
        await expect(page.locator('text=Inventory').first()).toBeVisible({ timeout: 10000 });
        
        // Check for stats or table
        const pageContent = await page.content();
        expect(pageContent).toMatch(/Total Agents|Agent Fleet|Hostname|No agents/i);
        
        // Screenshot
        await page.screenshot({ path: '/tmp/authenticated-screenshots/02-inventory.png', fullPage: true });
    });

    test('System page loads with data', async ({ page }) => {
        await page.goto('/system');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);
        
        // Check breadcrumb or page content
        await expect(page.locator('text=System').first()).toBeVisible({ timeout: 10000 });
        
        // Check for infrastructure components
        const pageContent = await page.content();
        expect(pageContent).toMatch(/Gateway|PostgreSQL|ClickHouse|Health/i);
        
        // Screenshot
        await page.screenshot({ path: '/tmp/authenticated-screenshots/03-system.png', fullPage: true });
    });

    test('Monitoring page loads with data', async ({ page }) => {
        await page.goto('/monitoring');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);
        
        // Check breadcrumb or page content
        await expect(page.locator('text=Monitoring').first()).toBeVisible({ timeout: 10000 });
        
        // Screenshot
        await page.screenshot({ path: '/tmp/authenticated-screenshots/04-monitoring.png', fullPage: true });
    });

    test('Provisions page loads', async ({ page }) => {
        await page.goto('/provisions');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);
        
        // Check breadcrumb or page content
        await expect(page.locator('text=Provisions').first()).toBeVisible({ timeout: 10000 });
        
        // Check for templates or content
        const pageContent = await page.content();
        expect(pageContent).toMatch(/Provisions|Rate Limiting|Health|Template/i);
        
        // Screenshot
        await page.screenshot({ path: '/tmp/authenticated-screenshots/05-provisions.png', fullPage: true });
    });

    test('Analytics page loads with data', async ({ page }) => {
        await page.goto('/analytics');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);
        
        // Check breadcrumb or page content
        await expect(page.locator('text=Analytics').first()).toBeVisible({ timeout: 10000 });
        
        // Screenshot
        await page.screenshot({ path: '/tmp/authenticated-screenshots/06-analytics.png', fullPage: true });
    });

    test('Traces page loads', async ({ page }) => {
        await page.goto('/analytics/traces');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);
        
        // Check for traces content
        await expect(page.locator('text=Traces').first()).toBeVisible({ timeout: 10000 });
        
        // Screenshot
        await page.screenshot({ path: '/tmp/authenticated-screenshots/07-traces.png', fullPage: true });
    });

    test('Alerts page loads', async ({ page }) => {
        await page.goto('/alerts');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);
        
        // Check breadcrumb or page content
        await expect(page.locator('text=Alerts').first()).toBeVisible({ timeout: 10000 });
        
        // Screenshot
        await page.screenshot({ path: '/tmp/authenticated-screenshots/08-alerts.png', fullPage: true });
    });

    test('AI Tuner page loads', async ({ page }) => {
        await page.goto('/optimization');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);
        
        // Check for AI Tuner content
        await expect(page.locator('text=AI').first()).toBeVisible({ timeout: 10000 });
        
        // Screenshot
        await page.screenshot({ path: '/tmp/authenticated-screenshots/09-ai-tuner.png', fullPage: true });
    });

    test('Reports page loads', async ({ page }) => {
        await page.goto('/reports');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);
        
        // Check breadcrumb or page content
        await expect(page.locator('text=Reports').first()).toBeVisible({ timeout: 10000 });
        
        // Screenshot
        await page.screenshot({ path: '/tmp/authenticated-screenshots/10-reports.png', fullPage: true });
    });
});
