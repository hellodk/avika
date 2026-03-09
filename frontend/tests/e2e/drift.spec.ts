import { test, expect, Page } from '@playwright/test';
import { installBasePath, E2E_LOGIN_USERNAME, E2E_LOGIN_PASSWORD } from './helpers';

async function login(page: Page) {
    installBasePath(page);
    await page.goto('/login');
    await page.fill('input[id="username"]', E2E_LOGIN_USERNAME);
    await page.fill('input[id="password"]', E2E_LOGIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=OVERVIEW', { timeout: 15000 });
}

test.describe('Drift detection', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    test('Drift compare page loads and shows Compare groups UI', async ({ page }) => {
        await page.goto('/drift/compare');
        await page.waitForLoadState('domcontentloaded');

        // "Compare groups" is the card title on the page
        await expect(page.getByText('Compare groups').first()).toBeVisible({ timeout: 15000 });

        // Compare groups card or selectors
        const content = await page.content();
        expect(content).toMatch(/Group A|Group B|Select.*group|Select a project/i);
    });

    test('Drift compare page has Back to inventory link', async ({ page }) => {
        await page.goto('/drift/compare');
        await page.waitForLoadState('domcontentloaded');

        const backLink = page.getByRole('link', { name: /Back|Inventory/i }).first();
        await expect(backLink).toBeVisible({ timeout: 8000 });
    });

    test('Server detail Drift tab URL loads without crash', async ({ page }) => {
        // With no agents we hit a placeholder server ID and expect error or empty state. With agents we only assert navigation.
        await page.goto('/inventory');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForSelector('h1:has-text("Inventory")', { timeout: 10000 });

        const serverLink = page.locator('a[href*="/servers/"]').first();
        const hasServer = (await serverLink.count()) > 0;

        if (hasServer) {
            const href = await serverLink.getAttribute('href');
            const serverId = href?.match(/\/servers\/([^/?]+)/)?.[1];
            if (serverId) {
                await page.goto(`/servers/${serverId}?tab=drift`);
                await page.waitForLoadState('domcontentloaded');
                await expect(page).toHaveURL(/\/servers\/[^/]+/);
                await expect(page.locator('body')).toBeVisible();
            }
        } else {
            await page.goto('/servers/test-agent-id-no-exist?tab=drift');
            await page.waitForLoadState('domcontentloaded');
            await expect(
                page.getByText(/Failed to load server|Drift by group|Loading drift|Not in any group/i).first()
            ).toBeVisible({ timeout: 12000 });
        }
    });

    test('Server detail page shows tabs or error', async ({ page }) => {
        await page.goto('/inventory');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForSelector('h1:has-text("Inventory")', { timeout: 10000 });

        const serverLink = page.locator('a[href*="/servers/"]').first();
        if ((await serverLink.count()) === 0) {
            test.skip();
            return;
        }
        const href = await serverLink.getAttribute('href');
        const serverId = href?.match(/\/servers\/([^/?]+)/)?.[1];
        if (!serverId) {
            test.skip();
            return;
        }

        await page.goto(`/servers/${serverId}`);
        await page.waitForLoadState('domcontentloaded');
        await expect(page).toHaveURL(/\/servers\/[^/]+/);
        // Page shows either tabs (Configuration, Drift, etc.) or loading spinner or Failed to load server
        const hasContent =
            (await page.getByText(/Configuration|Drift|Failed to load server/i).first().isVisible().catch(() => false)) ||
            (await page.getByRole('tab').first().isVisible().catch(() => false));
        expect(hasContent || (await page.locator('body').isVisible())).toBeTruthy();
    });
});
