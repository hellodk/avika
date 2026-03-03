import { chromium, type FullConfig } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { withBase } from "./helpers";

export default async function globalSetup(config: FullConfig) {
  const project = config.projects[0];
  const baseURL = (project?.use?.baseURL as string) || "http://localhost:3000";

  const authDir = path.join(process.cwd(), "tests/e2e/.auth");
  const statePath = path.join(authDir, "state.json");

  await fs.mkdir(authDir, { recursive: true });

  // Reuse existing auth state when available to avoid flaky UI logins.
  try {
    await fs.stat(statePath);
    return;
  } catch {
    // continue with UI login
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Navigate to login under basePath (e.g. /avika/login in K8s)
  const loginURL = new URL(withBase("/login"), baseURL).toString();
  await page.goto(loginURL, { waitUntil: "domcontentloaded" });

  await page.fill('input[id="username"]', "admin");
  await page.fill('input[id="password"]', "admin");
  const loginResponsePromise = page.waitForResponse(
    (r) => r.url().includes("/api/auth/login") && r.request().method() === "POST",
    { timeout: 30000 }
  );
  await page.click('button[type="submit"]');
  const loginResp = await loginResponsePromise;
  const loginJSON = await loginResp.json().catch(() => null);
  if (!loginJSON || loginJSON.success !== true) {
    throw new Error(`Global setup login failed: ${JSON.stringify(loginJSON)}`);
  }

  // Wait for redirect away from login and dashboard render.
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector('h1:has-text("Dashboard")', { timeout: 30000 });

  await page.context().storageState({ path: statePath });
  await browser.close();
}

