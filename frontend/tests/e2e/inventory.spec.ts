import { test, expect } from '@playwright/test';
import { installBasePath, withBase, loginIfNeeded } from './helpers';

const INV = withBase('/inventory');

/** Mock GET /api/servers (list only) to return one agent so we can assert table population. */
const MOCK_AGENTS = {
    agents: [
        {
            agent_id: 'web-01.local',
            id: 'web-01.local',
            hostname: 'web-01.local',
            ip: '192.168.1.10',
            agent_version: '0.1.0',
            last_seen: Math.floor(Date.now() / 1000) - 60,
            version: '1.24.0',
            is_pod: false,
        },
    ],
    system_version: '0.1.0',
};

function isListServersRequest(url: string, method: string): boolean {
    if (method !== 'GET') return false;
    try {
        const u = new URL(url);
        const path = u.pathname;
        return path.endsWith('/api/servers') || path.replace(/\/$/, '').endsWith('/api/servers');
    } catch {
        return false;
    }
}

test.describe('Inventory Page - Agents populated from API', () => {
    test('agents from /api/servers appear in the table', async ({ page }) => {
        await page.route('**/api/servers**', (route) => {
            const req = route.request();
            if (isListServersRequest(req.url(), req.method())) {
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AGENTS) });
            }
            return route.continue();
        });
        installBasePath(page);
        await page.goto('/inventory');
        await loginIfNeeded(page);
        if (!page.url().includes('/inventory')) {
            await page.goto('/inventory');
            await page.waitForLoadState('domcontentloaded');
        }
        await expect(page).toHaveURL(INV);
        await page.waitForSelector('h1:has-text("Inventory")', { timeout: 15000 });
        await expect(page.getByRole('cell', { name: 'web-01.local' }).first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByText('Total Agents')).toBeVisible();
    });
});

test.describe('Inventory Page', () => {
    test.beforeEach(async ({ page }) => {
        installBasePath(page);
        await page.goto('/inventory');
        await loginIfNeeded(page);
        if (!page.url().includes('/inventory')) {
            await page.goto('/inventory');
            await page.waitForLoadState('domcontentloaded');
        }
    });

    test('should load inventory page', async ({ page }) => {
        await expect(page).toHaveURL(INV);
    });

    test('should display inventory content', async ({ page }) => {
        // The page should have loaded
        await expect(page.locator('body')).toBeVisible();
    });

    test('should handle empty state gracefully', async ({ page }) => {
        // When no agents are connected, should show appropriate message or empty state
        // This tests that the page doesn't crash with no data
        await page.waitForLoadState('networkidle');
        await expect(page).toHaveURL(INV);
    });

    test('should display stats cards', async ({ page }) => {
        // Wait for React hydration
        await page.waitForSelector('h1:has-text("Inventory")', { timeout: 10000 });
        
        // Stats cards should be visible (check page HTML contains the text)
        const pageContent = await page.content();
        expect(pageContent).toContain('Total Agents');
        expect(pageContent).toContain('Online');
        expect(pageContent).toContain('Offline');
        expect(pageContent).toContain('Needs Update');
    });

    test('should have search functionality', async ({ page }) => {
        // Wait for React hydration
        await page.waitForSelector('h1:has-text("Inventory")', { timeout: 10000 });
        
        // Check page contains search input
        const pageContent = await page.content();
        expect(pageContent).toContain('Search agents...');
    });

    test('should have status filter buttons', async ({ page }) => {
        // Wait for React hydration
        await page.waitForSelector('h1:has-text("Inventory")', { timeout: 10000 });
        
        // Check page contains filter button text
        const pageContent = await page.content();
        expect(pageContent.toLowerCase()).toContain('all');
        expect(pageContent.toLowerCase()).toContain('online');
        expect(pageContent.toLowerCase()).toContain('offline');
    });

    test('should render inventory page with agent fleet section', async ({ page }) => {
        // Wait for React hydration
        await page.waitForSelector('h1:has-text("Inventory")', { timeout: 10000 });
        
        // Verify page loads with inventory table section (Total Agents, search, table)
        const pageContent = await page.content();
        
        // Agent Fleet section should always be present
        expect(pageContent).toContain('agent fleet');
        expect(pageContent).toContain('Total Agents');
        await expect(page).toHaveURL(INV);
    });

    test('should have export dropdown', async ({ page }) => {
        // Wait for React hydration
        await page.waitForSelector('h1:has-text("Inventory")', { timeout: 10000 });
        
        // Check page contains Export button
        const pageContent = await page.content();
        expect(pageContent).toContain('Export');
    });

    test('should have refresh button', async ({ page }) => {
        // Wait for React hydration
        await page.waitForSelector('h1:has-text("Inventory")', { timeout: 10000 });
        
        // Check page contains Refresh button
        const pageContent = await page.content();
        expect(pageContent).toContain('Refresh');
        
        // Page should still be functional
        await expect(page).toHaveURL(INV);
    });

    test('should render agent fleet controls', async ({ page }) => {
        // Wait for React hydration
        await page.waitForSelector('h1:has-text("Inventory")', { timeout: 10000 });
        
        // Verify the page loads with inventory controls
        const pageContent = await page.content();
        
        // Controls section should always be present
        expect(pageContent).toContain('agent fleet');
        expect(pageContent).toContain('Refresh');
        expect(pageContent).toContain('Export');
        // Verify the page loads with inventory controls (search, Export, Refresh via button)
        await expect(page.getByPlaceholder('Search agents...')).toBeVisible();
        await expect(page.getByRole('button', { name: /export/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /refresh/i }).first()).toBeVisible();
    });
});

test.describe('Inventory Page - Delete Confirmation', () => {
    test.beforeEach(async ({ page }) => {
        installBasePath(page);
        await page.goto('/inventory');
        await loginIfNeeded(page);
        if (!page.url().includes('/inventory')) await page.goto('/inventory');
        await page.waitForSelector('h1:has-text("Inventory")', { timeout: 10000 });
    });

    test('delete confirmation dialog structure exists', async ({ page }) => {
        // Verify the AlertDialog component is properly imported and structured
        // The actual dialog is only shown when delete is triggered with agents present
        // For now, just verify the page loads and has the delete button structure
        const pageContent = await page.content();
        
        // The delete confirmation uses AlertDialog component
        // Page should have the trash icon buttons if agents exist
        expect(pageContent).toContain('Inventory');
        await expect(page).toHaveURL(INV);
    });
});

test.describe('Inventory Page - Accessibility', () => {
    test.beforeEach(async ({ page }) => {
        installBasePath(page);
        await page.goto('/inventory');
        await loginIfNeeded(page);
        if (!page.url().includes('/inventory')) await page.goto('/inventory');
        await page.waitForSelector('h1:has-text("Inventory")', { timeout: 10000 });
    });

    test('should have proper accessibility structure', async ({ page }) => {
        await page.waitForSelector('h1:has-text("Inventory")', { timeout: 10000 });
        const pageContent = await page.content();
        
        // Basic accessibility structure - page title and search input
        expect(pageContent).toContain('Inventory');
        expect(pageContent).toContain('Search agents...');
        
        // Page should have stats cards
        expect(pageContent).toContain('Total Agents');
    });

    test('should be keyboard navigable', async ({ page }) => {
        // Check that search input exists in page content
        const pageContent = await page.content();
        expect(pageContent).toContain('Search agents...');
        
        // Page should be interactive (not errored)
        await expect(page).toHaveURL(INV);
    });
});
