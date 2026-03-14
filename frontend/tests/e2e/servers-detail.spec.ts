/**
 * Server detail page E2E: /servers/[id] with IP dots as dashes (e.g. /avika/servers/zabbix1-10-0-2-15).
 * Asserts page loads, tabs and main structure; tests links from Inventory UI.
 */
import { test, expect } from '@playwright/test';
import { installBasePath, loginIfNeeded } from './helpers';

async function gotoServerDetail(page: import('@playwright/test').Page, serverId: string) {
    installBasePath(page);
    const path = `/servers/${encodeURIComponent(serverId)}`;
    await page.goto(path);
    await loginIfNeeded(page);
    if (!page.url().includes('/servers/')) {
        await page.goto(path);
        await page.waitForLoadState('domcontentloaded');
    }
    const escaped = serverId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await expect(page).toHaveURL(new RegExp(`/servers/${escaped}(?:\\?|$)`));
    await page.waitForLoadState('domcontentloaded');
}

test.describe('Server detail page', () => {
    // URL format: dots in IP replaced by dashes (10.0.2.15 -> 10-0-2-15)
    const SERVER_ID_NEW = 'zabbix1-10-0-2-15';

    test('loads /servers/zabbix1-10-0-2-15 and URL is correct', async ({ page }) => {
        await gotoServerDetail(page, SERVER_ID_NEW);

        await expect(page).toHaveURL(new RegExp(`/servers/${SERVER_ID_NEW.replace(/\./g, '\\.')}(?:\\?|$)`));

        const rootError = page.getByText('An error occurred loading this page. You can try again or return to the dashboard.');
        await expect(rootError).not.toBeVisible({ timeout: 3000 });

        await expect(
            page.locator('[role="tablist"]').or(page.getByRole('link', { name: 'Back to Inventory' }))
        ).toBeVisible({ timeout: 10000 });

        const hasTabs = await page.locator('[role="tablist"]').first().isVisible().catch(() => false);
        const hasBackToInventory = await page.getByRole('link', { name: 'Back to Inventory' }).isVisible().catch(() => false);
        expect(hasTabs || hasBackToInventory).toBe(true);
    });

    test('link from Inventory to server detail uses new format (IP with dashes)', async ({ page }) => {
        installBasePath(page);
        await page.goto('/inventory');
        await loginIfNeeded(page);
        await expect(page).toHaveURL(/\/(avika\/)?inventory/);
        await expect(page.getByRole('heading', { name: 'Inventory', level: 1 })).toBeVisible({ timeout: 15000 });

        const serverLink = page.locator('table tbody a[href*="/servers/"]').first();
        await expect(serverLink).toBeVisible({ timeout: 10000 });

        const href = await serverLink.getAttribute('href');
        expect(href).toBeTruthy();
        // URL should use dashes in IP segment (no dots in the server id path)
        expect(href).toMatch(/\/servers\/[^/?#]+/);
        const idSegment = (href!.match(/\/servers\/([^/?#]+)/) || [])[1];
        const decoded = decodeURIComponent(idSegment);
        expect(decoded).not.toMatch(/^\S*\.\d+\.\d+\.\d+$/); // should not be like "zabbix1.10.0.2.15" or "zabbix1-10.0.2.15"
        expect(decoded).toMatch(/-/); // at least one dash (host-ip or ip octets)

        await serverLink.click();
        await page.waitForLoadState('domcontentloaded');
        await expect(page).toHaveURL(/\/servers\//);
        const rootError = page.getByText('An error occurred loading this page. You can try again or return to the dashboard.');
        await expect(rootError).not.toBeVisible({ timeout: 3000 });
    });
});
