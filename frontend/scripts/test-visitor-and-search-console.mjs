#!/usr/bin/env node
/**
 * Launch browser in headed mode, stream console to terminal, and test:
 * - Visitor Analytics section (/analytics/visitors)
 * - Header search (type query + Enter → Inventory with ?q=)
 *
 * Usage (from frontend/):
 *   BASE_PATH=/avika node scripts/test-visitor-and-search-console.mjs
 *
 * Prerequisites: dev server running (npm run dev), auth if required.
 * If you see the login page, log in manually; the script will then continue.
 */

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseURL = process.env.BASE_URL || "http://localhost:3000";
const basePath = process.env.BASE_PATH || "";
const statePath = path.join(__dirname, "../tests/e2e/.auth/state.json");

function url(path) {
    const p = path.startsWith("/") ? path : `/${path}`;
    return basePath ? `${baseURL}${basePath}${p}` : `${baseURL}${p}`;
}

async function main() {
    console.log("Launching browser (headed) with console forwarded to this terminal.\n");
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        storageState: statePath,
        ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    const logs = [];
    page.on("console", (msg) => {
        const type = msg.type();
        const text = msg.text();
        logs.push({ type, text });
        const prefix = type === "error" ? "[CONSOLE ERROR]" : `[console.${type}]`;
        console.log(`${prefix} ${text}`);
    });

    try {
        // 1) Dashboard and header search
        console.log("\n--- 1) Opening dashboard ---");
        await page.goto(url("/"), { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.waitForTimeout(2000);

        const onLogin = await page.locator('h2:has-text("Sign In")').isVisible().catch(() => false);
        if (onLogin) {
            console.log("Login page detected. Logging in with admin/admin ...");
            await page.locator('input[id="username"]').fill("admin");
            await page.locator('input[id="password"]').fill("admin");
            await page.locator('button[type="submit"]').click();
            await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15000 });
            await page.waitForLoadState("domcontentloaded");
            console.log("Logged in.");
        }

        const heading = page.getByRole("heading", { name: /Dashboard|Visitor|Inventory/i });
        await heading.first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});

        const searchInput = page.getByRole("textbox", { name: /Search agents/i });
        if (await searchInput.isVisible().catch(() => false)) {
            console.log("\n--- 2) Testing header search: typing 'nginx' + Enter ---");
            await searchInput.fill("nginx");
            await searchInput.press("Enter");
            await page.waitForTimeout(1500);
            const currentUrl = page.url();
            if (currentUrl.includes("/inventory") && currentUrl.includes("q=")) {
                console.log("PASS: Header search navigated to Inventory with query.");
            } else {
                console.log("FAIL: Header search did not navigate. URL:", currentUrl);
            }
        } else {
            console.log("Header search input not found (e.g. narrow viewport).");
        }

        // 3) Visitor Analytics
        console.log("\n--- 3) Opening Visitor Analytics ---");
        await page.goto(url("/analytics/visitors"), { waitUntil: "domcontentloaded", timeout: 15000 });
        await page.waitForTimeout(2000);

        const visitorHeading = page.getByRole("heading", { name: /Visitor Analytics/i });
        const visible = await visitorHeading.isVisible().catch(() => false);
        if (visible) {
            console.log("PASS: Visitor Analytics section loaded.");
        } else {
            const body = await page.locator("body").textContent().catch(() => "");
            console.log(
                body.includes("Visitor") || body.includes("Unique Visitors")
                    ? "PASS: Visitor-related content found on page."
                    : "FAIL: Visitor Analytics heading not found. Page may be login or error."
            );
        }
    } catch (e) {
        console.error("Error:", e.message);
    }

    const errCount = logs.filter((l) => l.type === "error").length;
    console.log("\n--- Console summary ---");
    console.log(`Total console messages: ${logs.length}, Errors: ${errCount}`);
    if (errCount > 0) {
        console.log("Errors:");
        logs.filter((l) => l.type === "error").forEach((l) => console.log("  ", l.text));
    }

    console.log("\nBrowser will stay open for 10s. Close it or inspect.");
    await page.waitForTimeout(10000);
    await browser.close();
}

main();
