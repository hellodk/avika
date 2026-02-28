import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: [
        ['html', { outputFolder: 'playwright-report' }],
        ['junit', { outputFile: 'test-results/e2e-results.xml' }],
        ['list'],
    ],
    outputDir: 'test-results',
    use: {
        baseURL: process.env.BASE_URL || 'http://localhost:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    expect: {
        timeout: 10000,
    },
    timeout: 30000,
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
        },
        {
            name: 'mobile-chrome',
            use: { ...devices['Pixel 5'] },
        },
    ],
    /* Run your local dev server before starting the tests */
    webServer: process.env.CI ? undefined : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120000,
    },
});
