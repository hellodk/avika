import { test, expect } from '@playwright/test';

test.describe('Web Terminal', () => {
    test('should open terminal and execute command with screenshots', async ({ page }) => {
        // Navigate to inventory
        await page.goto('/inventory');
        await page.waitForSelector('h1:has-text("Inventory")', { timeout: 15000 });
        await page.waitForTimeout(2000);
        
        // Screenshot 1: Inventory page
        await page.screenshot({ 
            path: 'test-results/screenshot_1_inventory.png', 
            fullPage: true 
        });
        console.log('Screenshot 1: Inventory page saved');
        
        // Wait for table to load
        await page.waitForSelector('table tbody tr', { timeout: 15000 });
        
        // Find action buttons in first row
        const firstRow = page.locator('table tbody tr').first();
        await expect(firstRow).toBeVisible();
        
        // Screenshot 2: Detail of first row
        await firstRow.screenshot({ path: 'test-results/screenshot_2_row.png' });
        console.log('Screenshot 2: Row detail saved');
        
        // Get all action buttons in the first row's actions column
        const actionButtons = firstRow.locator('td:last-child button');
        const buttonCount = await actionButtons.count();
        console.log(`Found ${buttonCount} action buttons`);
        
        // Click the first action button (usually opens a dialog)
        if (buttonCount > 0) {
            await actionButtons.first().click();
            await page.waitForTimeout(1000);
            
            // Screenshot 3: After clicking action button (dialog should open)
            await page.screenshot({ 
                path: 'test-results/screenshot_3_dialog.png', 
                fullPage: true 
            });
            console.log('Screenshot 3: Dialog saved');
            
            // Look for Web Terminal button in the dialog
            const terminalButton = page.getByRole('button', { name: /web terminal/i })
                .or(page.getByRole('button', { name: /terminal/i }))
                .or(page.locator('button:has-text("Web Terminal")'))
                .or(page.locator('button:has-text("Terminal")'));
            
            const terminalBtnVisible = await terminalButton.first().isVisible().catch(() => false);
            
            if (terminalBtnVisible) {
                console.log('Found Terminal button, clicking...');
                await terminalButton.first().click();
                await page.waitForTimeout(3000);
                
                // Screenshot 4: Terminal overlay
                await page.screenshot({ 
                    path: 'test-results/screenshot_4_terminal.png', 
                    fullPage: true 
                });
                console.log('Screenshot 4: Terminal overlay saved');
                
                // Wait for terminal to fully initialize and show prompt
                await page.waitForTimeout(3000);
                
                // Take screenshot showing the shell prompt
                await page.screenshot({ 
                    path: 'test-results/screenshot_5_prompt.png', 
                    fullPage: true 
                });
                console.log('Screenshot 5: Terminal with prompt saved');
                
                // Click on the terminal area to focus it
                const terminalArea = page.locator('.xterm-screen, .xterm-helper-textarea, [class*="xterm"]').first();
                if (await terminalArea.isVisible({ timeout: 2000 }).catch(() => false)) {
                    await terminalArea.click();
                    console.log('Clicked on terminal area to focus');
                } else {
                    // Try clicking on the terminal overlay itself
                    await page.locator('[ref="terminalRef"], .bg-\\[\\#0a0a0a\\]').first().click();
                    console.log('Clicked on terminal container');
                }
                await page.waitForTimeout(500);
                
                // Type echo command (using slower typing to let xterm render)
                console.log('Typing command: echo Hello');
                await page.keyboard.type('echo Hello', { delay: 100 });
                await page.waitForTimeout(500);
                await page.keyboard.press('Enter');
                await page.waitForTimeout(2000);
                
                // Screenshot 6: After echo command
                await page.screenshot({ 
                    path: 'test-results/screenshot_6_echo.png', 
                    fullPage: true 
                });
                console.log('Screenshot 6: After echo command saved');
                
                // Type whoami command
                console.log('Typing command: whoami');
                await page.keyboard.type('whoami', { delay: 50 });
                await page.waitForTimeout(500);
                await page.keyboard.press('Enter');
                await page.waitForTimeout(2000);
                
                // Screenshot 7: After whoami command
                await page.screenshot({ 
                    path: 'test-results/screenshot_7_whoami.png', 
                    fullPage: true 
                });
                console.log('Screenshot 7: After whoami command saved');
                
                // Type ls command
                console.log('Typing command: ls');
                await page.keyboard.type('ls', { delay: 50 });
                await page.waitForTimeout(500);
                await page.keyboard.press('Enter');
                await page.waitForTimeout(2000);
                
                // Screenshot 8: After ls command
                await page.screenshot({ 
                    path: 'test-results/screenshot_8_ls.png', 
                    fullPage: true 
                });
                console.log('Screenshot 8: After ls command saved');
            } else {
                console.log('Terminal button not found in dialog');
                // List all visible buttons
                const allButtons = page.locator('button:visible');
                const count = await allButtons.count();
                console.log(`Found ${count} visible buttons`);
                for (let i = 0; i < Math.min(count, 10); i++) {
                    const text = await allButtons.nth(i).textContent().catch(() => 'N/A');
                    console.log(`Button ${i}: ${text}`);
                }
            }
        }
        
        // Final screenshot
        await page.screenshot({ 
            path: 'test-results/screenshot_final.png', 
            fullPage: true 
        });
        console.log('Final screenshot saved');
    });
});
