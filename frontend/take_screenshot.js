const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    
    console.log("Navigating to login...");
    await page.goto('https://ncn112.com/avika/login');
    
    console.log("Logging in...");
    await page.fill('input[id="username"]', 'admin');
    await page.fill('input[id="password"]', 'admin');
    await page.click('button[type="submit"]');
    
    // Wait for redirect to dashboard
    await page.waitForURL('**/avika');
    
    console.log("Navigating to inventory...");
    await page.goto('https://ncn112.com/avika/inventory');
    
    // Wait for data to load
    await page.waitForSelector('text=agent fleet');
    await page.waitForTimeout(3000); // UI breathing room
    
    console.log("Taking screenshot...");
    await page.screenshot({ 
        path: '/home/dk/.gemini/antigravity/brain/f4718c3f-5214-4d16-8383-c4411a28ade3/inventory_screenshot.png', 
        fullPage: true 
    });
    
    console.log("Done.");
    await browser.close();
})();
