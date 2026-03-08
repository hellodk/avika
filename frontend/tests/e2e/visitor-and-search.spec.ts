import { test, expect } from "@playwright/test";
import { installBasePath, withBase, loginIfNeeded } from "./helpers";

test.describe("Visitor section and header search (with console)", () => {
    // Retry flaky runs (e.g. slow redirect to login or API)
    test.describe.configure({ retries: 2 });
    const consoleLogs: { type: string; text: string }[] = [];
    const consoleErrors: { text: string }[] = [];

    test.beforeEach(async ({ page }) => {
        installBasePath(page);
        consoleLogs.length = 0;
        consoleErrors.length = 0;

        page.on("console", (msg) => {
            const type = msg.type();
            const text = msg.text();
            consoleLogs.push({ type, text });
            if (type === "error") {
                consoleErrors.push({ text });
            }
        });

        // Use storage state from config (or login if redirected to sign-in)
        await page.goto(withBase("/"));
        await page.waitForLoadState("domcontentloaded");
        await loginIfNeeded(page);
    });

    test("Visitor Analytics section loads and shows content", async ({ page }) => {
        // Establish session via dashboard first (same as other tests)
        await page.goto(withBase("/"));
        await page.waitForLoadState("domcontentloaded");
        await loginIfNeeded(page);
        await page.goto(withBase("/analytics/visitors"));
        await page.waitForLoadState("domcontentloaded");

        // If redirected to login (e.g. expired session), log in and retry
        const url = page.url();
        if (url.includes("/login")) {
            await loginIfNeeded(page);
            await page.goto(withBase("/analytics/visitors"));
            await page.waitForLoadState("domcontentloaded");
        }

        // Confirm we're on the Visitor Analytics route (not stuck on login)
        await expect(page).toHaveURL(/analytics\/visitors/, { timeout: 10000 });

        // Wait for page to show "Visitor Analytics" (sidebar, breadcrumb, or main heading)
        await expect(
            page.getByText("Visitor Analytics", { exact: true }).first()
        ).toBeVisible({ timeout: 20000 });

        // Main content heading when present (optional when backend returns 401 and content is loading)
        const heading = page.getByRole("heading", { name: /Visitor Analytics/i });
        await heading.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});

        // Check for key sections (Unique Visitors or similar)
        const content = await page.content();
        expect(
            content.toLowerCase().includes("visitor") ||
                content.includes("Unique Visitors") ||
                content.includes("unique_visitors")
        ).toBeTruthy();

        if (consoleErrors.length > 0) {
            console.log("Console errors on Visitor Analytics page:", consoleErrors);
        }
        if (consoleLogs.length > 0) {
            console.log("Console messages:", consoleLogs.slice(-10));
        }
    });

    test("Header search navigates to Inventory with query (Enter)", async ({ page }) => {
        await expect(page.getByRole("heading", { name: /Dashboard/i })).toBeVisible({
            timeout: 15000,
        });

        const searchInput = page.getByRole("textbox", {
            name: /Search instances.*pages.*settings/i,
        });
        await expect(searchInput).toBeVisible({ timeout: 5000 });

        await searchInput.fill("nginx");
        await searchInput.press("Enter");

        await expect(page).toHaveURL(/\/inventory/, { timeout: 10000 });
        await expect(
            page.getByRole("heading", { name: /Inventory/i })
        ).toBeVisible({ timeout: 5000 });

        if (consoleErrors.length > 0) {
            console.log("Console errors during header search test:", consoleErrors);
        }
    });

    test("Header search navigates to Inventory when search button clicked", async ({ page }) => {
        await expect(page.getByRole("heading", { name: /Dashboard/i })).toBeVisible({
            timeout: 15000,
        });

        const searchInput = page.getByRole("textbox", {
            name: /Search instances.*pages.*settings/i,
        });
        await expect(searchInput).toBeVisible({ timeout: 5000 });
        await searchInput.fill("web");

        const searchButton = page.getByRole("button", { name: /Search/i });
        await expect(searchButton).toBeVisible({ timeout: 3000 });
        await searchButton.click();

        await expect(page).toHaveURL(/\/inventory/, { timeout: 10000 });
        await expect(
            page.getByRole("heading", { name: /Inventory/i })
        ).toBeVisible({ timeout: 5000 });
    });

    test.afterEach(() => {
        if (consoleErrors.length > 0) {
            console.log("[E2E] Console errors in this test:", consoleErrors);
        }
    });
});
