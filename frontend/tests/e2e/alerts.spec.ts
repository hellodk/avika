import { test, expect } from '@playwright/test';
import { installBasePath, withBase } from './helpers';

const ALERTS = withBase('/alerts');

const MOCK_RULES = [
    {
        id: 'rule-1',
        name: 'High CPU Usage',
        metric_type: 'cpu',
        threshold: 80,
        comparison: 'gt',
        window_sec: 300,
        enabled: true,
        recipients: 'admin@example.com'
    }
];

test.describe('Alerts Page', () => {
    test.beforeEach(async ({ page }) => {
        // Mock the alerts API (both for inbox and rules)
        await page.route('**/api/alerts**', (route) => {
            const method = route.request().method();
            if (method === 'GET') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(MOCK_RULES),
                });
            }
            if (method === 'POST') {
                return route.fulfill({ status: 200 });
            }
            return route.continue();
        });

        installBasePath(page);
        await page.goto('/alerts');
    });

    test('should load alerts page and display inbox', async ({ page }) => {
        await expect(page).toHaveURL(ALERTS);
        await expect(page.getByText('High CPU Usage')).toBeVisible();
    });

    test('should switch to rules configuration tab', async ({ page }) => {
        await page.getByRole('tab', { name: /Configure rules/i }).click();
        await expect(page.getByText('Alert Rules')).toBeVisible();
        await expect(page.getByRole('button', { name: /Add Rule/i })).toBeVisible();
    });

    test('should create a new alert rule', async ({ page }) => {
        await page.getByRole('tab', { name: /Configure rules/i }).click();
        await page.getByRole('button', { name: /Add Rule/i }).click();
        
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByText('Create Alert Rule')).toBeVisible();
        
        await dialog.locator('#name').fill('Memory Spike');
        // Select metric (CPU is default or placeholder)
        await dialog.getByLabel('Metric').click();
        await page.getByRole('option', { name: 'Memory Usage (%)' }).click();
        
        await dialog.locator('#threshold').fill('90');
        await dialog.locator('#window').fill('60');
        await dialog.locator('#recipients').fill('devops@avika.ai');
        
        await dialog.getByRole('button', { name: /Save Rule/i }).click();
        
        await expect(dialog).not.toBeVisible();
        await expect(page.getByText('Rule created')).toBeVisible();
    });

    test('should delete an existing alert rule', async ({ page }) => {
        await page.getByRole('tab', { name: /Configure rules/i }).click();
        
        // Mock the DELETE call
        await page.route('**/api/alerts/rule-1', (route) => {
            if (route.request().method() === 'DELETE') {
                return route.fulfill({ status: 200 });
            }
            return route.continue();
        });

        // Handle confirm dialog
        page.on('dialog', dialog => dialog.accept());
        
        const deleteBtn = page.locator('table tbody tr').first().locator('button').filter({ has: page.locator('svg[class*="lucide-trash2"]') });
        await deleteBtn.click();
        
        await expect(page.getByText('Rule deleted')).toBeVisible();
    });
});
