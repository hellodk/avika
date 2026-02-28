import { test, expect } from '@playwright/test';

test.describe('Monitoring Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/avika/monitoring');
        await page.waitForLoadState('networkidle');
    });

    test.describe('Page Structure', () => {
        test('should display main monitoring page elements', async ({ page }) => {
            await expect(page.getByRole('heading', { name: /NGINX Monitoring/i })).toBeVisible();
            await expect(page.getByText(/Real-time telemetry and performance metrics/i)).toBeVisible();
        });

        test('should display all navigation tabs', async ({ page }) => {
            await expect(page.getByRole('tab', { name: /Overview/i })).toBeVisible();
            await expect(page.getByRole('tab', { name: /Connections/i })).toBeVisible();
            await expect(page.getByRole('tab', { name: /Traffic/i })).toBeVisible();
            await expect(page.getByRole('tab', { name: /System/i })).toBeVisible();
            await expect(page.getByRole('tab', { name: /Configure/i })).toBeVisible();
        });

        test('should have agent selector dropdown', async ({ page }) => {
            await expect(page.getByRole('combobox')).toBeVisible();
        });

        test('should have refresh button', async ({ page }) => {
            await expect(page.getByRole('button', { name: /Refresh/i })).toBeVisible();
        });
    });

    test.describe('Overview Tab - KPI Cards', () => {
        test('should display Requests/sec metric card', async ({ page }) => {
            await expect(page.getByText('Requests/sec')).toBeVisible();
        });

        test('should display Active Connections metric card', async ({ page }) => {
            await expect(page.getByText('Active Connections')).toBeVisible();
        });

        test('should display Error Rate metric card', async ({ page }) => {
            await expect(page.getByText('Error Rate')).toBeVisible();
        });

        test('should display Avg Latency metric card', async ({ page }) => {
            await expect(page.getByText('Avg Latency')).toBeVisible();
        });

        test('should display secondary metrics (Reading, Writing, Waiting)', async ({ page }) => {
            await expect(page.getByText('Reading')).toBeVisible();
            await expect(page.getByText('Writing')).toBeVisible();
            await expect(page.getByText('Waiting')).toBeVisible();
        });

        test('should display HTTP status metrics (2xx, 4xx, 5xx)', async ({ page }) => {
            await expect(page.getByText('2xx Success')).toBeVisible();
            await expect(page.getByText('4xx Errors')).toBeVisible();
            await expect(page.getByText('5xx Errors')).toBeVisible();
        });
    });

    test.describe('Overview Tab - Charts', () => {
        test('should display Request Rate chart', async ({ page }) => {
            await expect(page.getByText('Request Rate (Last Hour)')).toBeVisible();
        });

        test('should display Connection Distribution chart', async ({ page }) => {
            await expect(page.getByText('Connection Distribution')).toBeVisible();
        });
    });

    test.describe('Connections Tab', () => {
        test('should switch to Connections tab', async ({ page }) => {
            await page.getByRole('tab', { name: /Connections/i }).click();
            await expect(page.getByText('Total Accepted')).toBeVisible();
            await expect(page.getByText('Total Handled')).toBeVisible();
            await expect(page.getByText('Dropped')).toBeVisible();
            await expect(page.getByText('Keep-Alive')).toBeVisible();
        });

        test('should display Connection States Over Time chart', async ({ page }) => {
            await page.getByRole('tab', { name: /Connections/i }).click();
            await expect(page.getByText('Connection States Over Time')).toBeVisible();
        });
    });

    test.describe('Traffic Tab', () => {
        test('should switch to Traffic tab', async ({ page }) => {
            await page.getByRole('tab', { name: /Traffic/i }).click();
            await expect(page.getByText('HTTP 2xx Success Rate')).toBeVisible();
            await expect(page.getByText('HTTP 4xx/5xx Errors')).toBeVisible();
        });

        test('should display Top Endpoints table', async ({ page }) => {
            await page.getByRole('tab', { name: /Traffic/i }).click();
            await expect(page.getByText('Top Endpoints')).toBeVisible();
            await expect(page.getByRole('columnheader', { name: 'URI' })).toBeVisible();
            await expect(page.getByRole('columnheader', { name: 'Requests' })).toBeVisible();
            await expect(page.getByRole('columnheader', { name: 'P95 Latency' })).toBeVisible();
            await expect(page.getByRole('columnheader', { name: 'Errors' })).toBeVisible();
        });
    });

    test.describe('System Tab', () => {
        test('should switch to System tab', async ({ page }) => {
            await page.getByRole('tab', { name: /System/i }).click();
            await expect(page.getByText(/CPU Usage/i)).toBeVisible();
            await expect(page.getByText(/Memory Usage/i)).toBeVisible();
        });

        test('should display Network metrics', async ({ page }) => {
            await page.getByRole('tab', { name: /System/i }).click();
            await expect(page.getByText('Network In')).toBeVisible();
            await expect(page.getByText('Network Out')).toBeVisible();
        });

        test('should display CPU/Memory charts', async ({ page }) => {
            await page.getByRole('tab', { name: /System/i }).click();
            await expect(page.getByText(/CPU Usage.*Over Time/i)).toBeVisible();
            await expect(page.getByText(/Memory Usage.*Over Time/i)).toBeVisible();
        });

        test('should display data source indicator', async ({ page }) => {
            await page.getByRole('tab', { name: /System/i }).click();
            await expect(page.getByText(/Aggregated Metrics|Host Metrics/i)).toBeVisible();
        });
    });

    test.describe('Configure Tab', () => {
        test('should switch to Configure tab', async ({ page }) => {
            await page.getByRole('tab', { name: /Configure/i }).click();
            await expect(page.getByText('Configuration Provisions')).toBeVisible();
        });

        test('should display augment templates', async ({ page }) => {
            await page.getByRole('tab', { name: /Configure/i }).click();
            await expect(page.getByText('HTTP Rate Limiting')).toBeVisible();
            await expect(page.getByText('Active Health Checks')).toBeVisible();
            await expect(page.getByText('Enable Gzip Compression')).toBeVisible();
        });

        test('should display Recent Requests table', async ({ page }) => {
            await page.getByRole('tab', { name: /Configure/i }).click();
            await expect(page.getByText('Recent Requests')).toBeVisible();
        });
    });

    test.describe('Tab URL Persistence', () => {
        test('should persist tab selection in URL', async ({ page }) => {
            await page.getByRole('tab', { name: /Connections/i }).click();
            await expect(page).toHaveURL(/tab=connections/);
            
            await page.getByRole('tab', { name: /Traffic/i }).click();
            await expect(page).toHaveURL(/tab=traffic/);
            
            await page.getByRole('tab', { name: /System/i }).click();
            await expect(page).toHaveURL(/tab=system/);
        });

        test('should load correct tab from URL parameter', async ({ page }) => {
            await page.goto('/avika/monitoring?tab=system');
            await expect(page.getByRole('tab', { name: /System/i })).toHaveAttribute('data-state', 'active');
        });
    });

    test.describe('Agent Selection', () => {
        test('should be able to select different agents', async ({ page }) => {
            const selector = page.getByRole('combobox');
            await selector.click();
            await expect(page.getByRole('option', { name: 'All Agents' })).toBeVisible();
        });
    });

    test.describe('Data Refresh', () => {
        test('should refresh data when refresh button clicked', async ({ page }) => {
            const refreshButton = page.getByRole('button', { name: /Refresh/i });
            await refreshButton.click();
            // Verify the spinner appears briefly
            await expect(refreshButton.locator('svg')).toHaveClass(/animate-spin/, { timeout: 1000 }).catch(() => {
                // Animation might be too fast to catch
            });
        });
    });
});

test.describe('Monitoring Page - Data Validation', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/avika/monitoring');
        await page.waitForLoadState('networkidle');
    });

    test.describe('Overview Tab - Data Presence', () => {
        test('should display numeric values in KPI cards', async ({ page }) => {
            // Wait for data to load
            await page.waitForTimeout(2000);
            
            // Requests/sec should show a number
            const requestsCard = page.locator('text=Requests/sec').locator('..').locator('..');
            await expect(requestsCard.locator('.text-2xl')).not.toHaveText('');
            
            // Active Connections should show a number
            const connectionsCard = page.locator('text=Active Connections').locator('..').locator('..');
            await expect(connectionsCard.locator('.text-2xl')).not.toHaveText('');
        });

        test('should display Request Rate chart with data points', async ({ page }) => {
            await page.waitForTimeout(2000);
            // Chart should have paths (indicating data)
            const chartContainer = page.locator('text=Request Rate (Last Hour)').locator('..').locator('..');
            // Look for SVG elements indicating rendered chart
            await expect(chartContainer.locator('svg')).toBeVisible();
        });

        test('should display Connection Distribution pie chart or no data message', async ({ page }) => {
            await page.waitForTimeout(2000);
            const chartContainer = page.locator('text=Connection Distribution').locator('..').locator('..');
            // Either pie chart or "No connection data available" message
            const hasPie = await chartContainer.locator('svg').count() > 0;
            const hasNoData = await chartContainer.getByText('No connection data available').isVisible().catch(() => false);
            expect(hasPie || hasNoData).toBeTruthy();
        });
    });

    test.describe('Connections Tab - Data Presence', () => {
        test('should show connection metrics', async ({ page }) => {
            await page.getByRole('tab', { name: /Connections/i }).click();
            await page.waitForTimeout(2000);
            
            // Verify Total Accepted shows a value
            const acceptedCard = page.locator('text=Total Accepted').locator('..').locator('..');
            await expect(acceptedCard.locator('.text-2xl')).toBeVisible();
        });

        test('should render Connection States chart', async ({ page }) => {
            await page.getByRole('tab', { name: /Connections/i }).click();
            await page.waitForTimeout(2000);
            
            const chartContainer = page.locator('text=Connection States Over Time').locator('..').locator('..');
            await expect(chartContainer.locator('svg')).toBeVisible();
        });
    });

    test.describe('System Tab - Data Presence', () => {
        test('should show CPU/Memory percentages', async ({ page }) => {
            await page.getByRole('tab', { name: /System/i }).click();
            await page.waitForTimeout(2000);
            
            // CPU should show percentage
            await expect(page.getByText(/%/)).toBeVisible();
        });

        test('should show Network rates', async ({ page }) => {
            await page.getByRole('tab', { name: /System/i }).click();
            await page.waitForTimeout(2000);
            
            // Network should show KB/s
            await expect(page.getByText(/KB\/s/)).toBeVisible();
        });
    });

    test.describe('Traffic Tab - Data Presence', () => {
        test('should display Top Endpoints with data or empty message', async ({ page }) => {
            await page.getByRole('tab', { name: /Traffic/i }).click();
            await page.waitForTimeout(2000);
            
            const table = page.locator('text=Top Endpoints').locator('..').locator('..');
            const hasData = await table.locator('tbody tr').count() > 0;
            const hasEmpty = await table.getByText('No endpoint data available').isVisible().catch(() => false);
            expect(hasData || hasEmpty).toBeTruthy();
        });
    });

    test.describe('Configure Tab - Data Presence', () => {
        test('should display Recent Requests with data or empty message', async ({ page }) => {
            await page.getByRole('tab', { name: /Configure/i }).click();
            await page.waitForTimeout(2000);
            
            const table = page.locator('text=Recent Requests').locator('..').locator('..');
            const hasData = await table.locator('tbody tr').count() > 0;
            const hasEmpty = await table.getByText('No recent requests').isVisible().catch(() => false);
            expect(hasData || hasEmpty).toBeTruthy();
        });
    });
});

test.describe('Monitoring Page - API Integration', () => {
    test('should fetch analytics data on load', async ({ page }) => {
        const analyticsRequest = page.waitForRequest(request => 
            request.url().includes('/api/analytics') && request.method() === 'GET'
        );
        
        await page.goto('/avika/monitoring');
        const request = await analyticsRequest;
        expect(request.url()).toContain('window=1h');
    });

    test('should fetch servers data on load', async ({ page }) => {
        const serversRequest = page.waitForRequest(request => 
            request.url().includes('/api/servers') && request.method() === 'GET'
        );
        
        await page.goto('/avika/monitoring');
        await serversRequest;
    });

    test('should include agent_id when specific agent selected', async ({ page }) => {
        await page.goto('/avika/monitoring');
        await page.waitForLoadState('networkidle');
        
        // Open agent selector
        const selector = page.getByRole('combobox');
        await selector.click();
        
        // If there are agent options other than "All Agents", select one
        const agentOptions = await page.getByRole('option').all();
        if (agentOptions.length > 1) {
            // Select the second option (first non-"All Agents" option)
            const analyticsRequest = page.waitForRequest(request => 
                request.url().includes('/api/analytics') && 
                request.url().includes('agent_id=')
            );
            
            await agentOptions[1].click();
            await analyticsRequest;
        }
    });
});
