import { test, expect } from '@playwright/test';
import { installBasePath, withBase } from './helpers';

const PROVISIONS = withBase('/provisions');

const MOCK_AGENTS = [
    { agent_id: 'agent-1', hostname: 'nginx-prod', ip: '10.0.0.1' },
    { agent_id: 'agent-2', hostname: 'nginx-dev', ip: '10.0.0.2' }
];

test.describe('Provisions Page', () => {
    test.beforeEach(async ({ page }) => {
        // Mock requirements
        await page.route('**/api/servers**', (route) => {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(MOCK_AGENTS),
            });
        });

        await page.route('**/api/provisions', (route) => {
            if (route.request().method() === 'POST') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ preview: 'limit_req_zone $binary_remote_addr zone=mylimit:10m rate=60r/m;' }),
                });
            }
            return route.continue();
        });

        installBasePath(page);
        await page.goto('/provisions');
    });

    test('should load provisions page and display templates', async ({ page }) => {
        await expect(page).toHaveURL(PROVISIONS);
        await expect(page.getByText('Rate Limiting')).toBeVisible();
        await expect(page.getByText('Health Checks')).toBeVisible();
    });

    test('should complete Rate Limiting provision wizard', async ({ page }) => {
        // 1. Select Template
        await page.getByText('Rate Limiting').click();
        await expect(page.getByText('Step 1: Select Target Instance')).toBeVisible();
        
        // 2. Step 1: Select Agent
        await page.getByText('nginx-prod').click();
        await page.getByRole('button', { name: /Next/i }).click();
        
        // 3. Step 2: Configure
        await expect(page.getByText('Step 2: Configuration Details')).toBeVisible();
        const rpmInput = page.locator('input[type="number"]').first();
        await rpmInput.fill('120');
        await page.getByRole('button', { name: /Preview & Apply/i }).click();
        
        // 4. Step 3: Preview & Confirm
        await expect(page.getByText('Step 3: Preview Configuration')).toBeVisible();
        await expect(page.locator('pre')).toContainText('rate=60r/m'); // From mock
        
        // Handle alert dialog
        page.on('dialog', async dialog => {
            expect(dialog.message()).toContain('Provision applied successfully');
            await dialog.accept();
        });
        
        await page.getByRole('button', { name: /Confirm & Apply/i }).click();
        
        // 5. Verify reset back to template selection
        await expect(page.getByText('HTTP Provisions')).toBeVisible();
    });
});
