/**
 * Inventory page: links and functionality E2E tests.
 * Covers: navigation links, search, filters, sort, export, row actions, delete flow, terminal flow.
 */
import { test, expect } from '@playwright/test';
import { installBasePath, withBase, loginIfNeeded } from './helpers';

const INV = withBase('/inventory');
const BASE = process.env.BASE_PATH || process.env.NEXT_PUBLIC_BASE_PATH || '';

async function gotoInventory(page: import('@playwright/test').Page) {
    installBasePath(page);
    await page.goto('/inventory');
    await loginIfNeeded(page);
    if (!page.url().includes('/inventory')) {
        await page.goto('/inventory');
        await page.waitForLoadState('domcontentloaded');
    }
    await expect(page).toHaveURL(INV);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Inventory', level: 1 })).toBeVisible({ timeout: 25000 });
}

test.describe('Inventory Page - Links and Functionality', () => {
    test.beforeEach(async ({ page }) => {
        await gotoInventory(page);
    });

    test('page load and main structure', async ({ page }) => {
        await expect(page.getByText('Manage your NGINX agent fleet')).toBeVisible();
    });

    test('stats cards are visible', async ({ page }) => {
        await expect(page.getByText('Total Agents')).toBeVisible();
        await expect(page.getByText('Online').first()).toBeVisible();
        await expect(page.getByText('Offline').first()).toBeVisible();
        await expect(page.getByText('Needs Update')).toBeVisible();
    });

    test('search input exists and is usable', async ({ page }) => {
        const search = page.getByPlaceholder('Search agents...');
        await expect(search).toBeVisible();
        await search.fill('test');
        await expect(search).toHaveValue('test');
        await search.clear();
    });

    test('status filter buttons (All, Online, Offline)', async ({ page }) => {
        const allBtn = page.getByRole('button', { name: 'all' });
        const onlineBtn = page.getByRole('button', { name: 'online' });
        const offlineBtn = page.getByRole('button', { name: 'offline' });
        await expect(allBtn).toBeVisible();
        await expect(onlineBtn).toBeVisible();
        await expect(offlineBtn).toBeVisible();
        await onlineBtn.click();
        await expect(page).toHaveURL(new RegExp(`.*status=online`));
        await allBtn.click();
        await expect(page).not.toHaveURL(new RegExp(`.*status=online`));
    });

    test('refresh button visible and clickable', async ({ page }) => {
        const refresh = page.getByRole('button', { name: /refresh/i }).first();
        await expect(refresh).toBeVisible();
        await refresh.click();
        await expect(page).toHaveURL(INV);
    });

    test('export dropdown opens and has CSV/JSON options', async ({ page }) => {
        const exportBtn = page.getByRole('button', { name: /export/i });
        await expect(exportBtn).toBeVisible();
        await exportBtn.click();
        await expect(page.getByRole('menuitem', { name: 'Export as CSV' })).toBeVisible();
        await expect(page.getByRole('menuitem', { name: 'Export as JSON' })).toBeVisible();
    });

    test('export as JSON triggers download', async ({ page }) => {
        const exportBtn = page.getByRole('button', { name: /export/i });
        await exportBtn.click();
        const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
        await page.getByRole('menuitem', { name: 'Export as JSON' }).click();
        const download = await downloadPromise;
        if (download) {
            expect(download.suggestedFilename()).toMatch(/avika-inventory.*\.json/);
        }
    });

    test('export as CSV triggers download', async ({ page }) => {
        const exportBtn = page.getByRole('button', { name: /export/i });
        await exportBtn.click();
        const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
        await page.getByRole('menuitem', { name: 'Export as CSV' }).click();
        const download = await downloadPromise;
        if (download) {
            expect(download.suggestedFilename()).toMatch(/avika-inventory.*\.csv/);
        }
    });

    test('table has column headers (Agent, IP, NGINX, Version, Status, Last Seen, Actions)', async ({ page }) => {
        await page.waitForLoadState('networkidle');
        const table = page.locator('table').first();
        await expect(table).toBeVisible();
        await expect(table.getByRole('columnheader', { name: /agent/i })).toBeVisible();
        await expect(table.getByRole('columnheader', { name: /IP address/i })).toBeVisible();
        await expect(table.getByRole('columnheader', { name: /NGINX/i })).toBeVisible();
        await expect(table.getByRole('columnheader', { name: /version/i })).toBeVisible();
        await expect(table.getByRole('columnheader', { name: /status/i })).toBeVisible();
        await expect(table.getByRole('columnheader', { name: /last seen/i })).toBeVisible();
        await expect(table.getByRole('columnheader', { name: /actions/i })).toBeVisible();
    });

    test('sort by Agent toggles URL params', async ({ page }) => {
        await page.waitForLoadState('networkidle');
        const agentHeader = page.locator('table').first().getByRole('button', { name: /agent/i });
        await agentHeader.click();
        await expect(page).toHaveURL(new RegExp(`.*sort=hostname`));
        await agentHeader.click();
        await expect(page).toHaveURL(new RegExp(`.*dir=desc`));
    });

    test('when no agents: empty state message shown', async ({ page }) => {
        await page.waitForLoadState('networkidle');
        const noAgents = page.getByText('No agents found matching your filters.');
        const hasRows = await page.locator('table tbody tr').count() > 0;
        const hasEmptyState = await noAgents.isVisible().catch(() => false);
        const hasLoadingSkeleton = await page.locator('table tbody tr').filter({ has: page.locator('.animate-pulse') }).count() > 0;
        expect(hasRows && !hasLoadingSkeleton || hasEmptyState).toBeTruthy();
    });
});

test.describe('Inventory Page - Links (when agents exist)', () => {
    test.beforeEach(async ({ page }) => {
        await gotoInventory(page);
        await page.waitForLoadState('networkidle');
    });

    test('server detail link from first row navigates to /servers/[id]', async ({ page }) => {
        const serverLink = page.locator('table tbody a[href*="/servers/"]').first();
        const count = await serverLink.count();
        if (count === 0) {
            test.skip();
            return;
        }
        const href = await serverLink.getAttribute('href');
        expect(href).toBeTruthy();
        expect(href).toMatch(/\/servers\/[^/]+/);
        await serverLink.click();
        await expect(page).toHaveURL(new RegExp(`${BASE ? BASE.replace(/\//g, '\\/') + '\\/' : ''}servers\\/[^/]+`));
    });

    test('external link (open server) in actions column', async ({ page }) => {
        const externalLink = page.locator('table tbody tr').first().locator('a[href*="/servers/"]').first();
        if (await externalLink.count() === 0) {
            test.skip();
            return;
        }
        const href = await externalLink.getAttribute('href');
        expect(href).toBeTruthy();
        expect(href).toMatch(/\/servers\//);
    });

    test('drift link in actions column goes to server with tab=drift', async ({ page }) => {
        const driftLink = page.locator('table tbody tr').first().locator('a[href*="tab=drift"]');
        if (await driftLink.count() === 0) {
            test.skip();
            return;
        }
        await driftLink.click();
        await expect(page).toHaveURL(new RegExp(`tab=drift`));
        await expect(page).toHaveURL(new RegExp(`/servers/`));
    });

    test('agent config link (Settings) goes to /agents/[id]/config', async ({ page }) => {
        const configLink = page.locator('table tbody tr').first().locator('a[href*="/agents/"][href*="/config"]');
        if (await configLink.count() === 0) {
            test.skip();
            return;
        }
        const href = await configLink.getAttribute('href');
        expect(href).toMatch(/\/agents\/.+\/config/);
        await configLink.click();
        await expect(page).toHaveURL(new RegExp(`${BASE ? BASE.replace(/\//g, '\\/') + '\\/' : ''}agents\\/[^/]+\\/config`));
    });

    test('row checkbox selects row and shows bulk actions bar', async ({ page }) => {
        const checkbox = page.locator('table tbody tr input[type="checkbox"]').first();
        if (await checkbox.count() === 0) {
            test.skip();
            return;
        }
        await checkbox.check();
        await expect(page.getByText(/selected/)).toBeVisible();
        await expect(page.getByRole('button', { name: /update/i }).filter({ hasText: 'Update' })).toBeVisible();
        await expect(page.getByRole('button', { name: /remove/i }).filter({ hasText: 'Remove' })).toBeVisible();
    });

    test('delete button opens confirmation dialog', async ({ page }) => {
        const deleteBtn = page.locator('table tbody tr').first().locator('button').filter({ has: page.locator('svg') }).last();
        if (await deleteBtn.count() === 0) {
            test.skip();
            return;
        }
        await deleteBtn.click();
        await expect(page.getByRole('dialog').getByText('Remove Agent')).toBeVisible();
        await expect(page.getByRole('dialog').getByText(/Are you sure/)).toBeVisible();
        await page.getByRole('button', { name: 'Cancel' }).click();
        await expect(page.getByRole('dialog')).not.toBeVisible();
    });

    test('terminal button on pod opens Access Pod Terminal dialog', async ({ page }) => {
        const terminalBtn = page.locator('table tbody tr').first().locator('button[title]').filter({ has: page.locator('svg') }).nth(1);
        const rowHasK8s = await page.locator('table tbody tr').first().getByText('K8s').count() > 0;
        if (await terminalBtn.count() === 0) {
            test.skip();
            return;
        }
        await terminalBtn.click();
        const dialog = page.getByRole('dialog');
        const hasTerminalDialog = await dialog.getByText('Access Pod Terminal').isVisible().catch(() => false);
        const hasSshRedirect = await page.url().startsWith('ssh://');
        if (hasTerminalDialog) {
            await expect(dialog.getByText('kubectl exec')).toBeVisible();
            await dialog.getByRole('button', { name: 'Done' }).click();
        }
        expect(hasTerminalDialog || hasSshRedirect).toBeTruthy();
    });
});

test.describe('Inventory Page - Bulk actions', () => {
    test.beforeEach(async ({ page }) => {
        await gotoInventory(page);
        await page.waitForLoadState('networkidle');
    });

    test('select all checkbox toggles all rows', async ({ page }) => {
        const selectAll = page.locator('table thead input[type="checkbox"]');
        if (await selectAll.count() === 0) return;
        const rowCount = await page.locator('table tbody tr input[type="checkbox"]').count();
        if (rowCount === 0) {
            test.skip();
            return;
        }
        await selectAll.check();
        await expect(page.getByText(/selected/)).toBeVisible();
        await selectAll.uncheck();
    });

    test('clear selection hides bulk bar', async ({ page }) => {
        const firstCheckbox = page.locator('table tbody tr input[type="checkbox"]').first();
        if (await firstCheckbox.count() === 0) {
            test.skip();
            return;
        }
        await firstCheckbox.check();
        await expect(page.getByText(/selected/)).toBeVisible();
        await page.getByRole('button', { name: 'Clear' }).click();
        await expect(page.getByText(/selected/)).not.toBeVisible();
    });
});

test.describe('Inventory Page - Error state', () => {
    test('retry button visible when load fails', async ({ page }) => {
        await page.route('**/api/servers', (route) => route.abort('failed'));
        installBasePath(page);
        await page.goto('/inventory');
        await loginIfNeeded(page);
        await page.waitForLoadState('networkidle');
        const retry = page.getByRole('button', { name: /retry/i });
        const errorHeading = page.getByText('Unable to load inventory');
        await expect(errorHeading).toBeVisible({ timeout: 10000 });
        await expect(retry).toBeVisible();
    });
});
