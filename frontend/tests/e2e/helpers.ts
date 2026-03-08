export const BASE_PATH = process.env.BASE_PATH || process.env.NEXT_PUBLIC_BASE_PATH || "";

/** E2E login credentials (configurable via E2E_LOGIN_USERNAME / E2E_LOGIN_PASSWORD). */
export const E2E_LOGIN_USERNAME = process.env.E2E_LOGIN_USERNAME || "admin";
export const E2E_LOGIN_PASSWORD = process.env.E2E_LOGIN_PASSWORD || "admin";

export function withBase(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (!BASE_PATH) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized === "/") return BASE_PATH;
  return `${BASE_PATH}${normalized}`;
}

export function installBasePath(page: any) {
  const originalGoto = page.goto.bind(page);
  page.goto = (url: any, options?: any) => {
    const urlStr = typeof url === "string" ? url : url?.toString?.() ?? String(url);
    return originalGoto(withBase(urlStr), options);
  };
  return page;
}

/**
 * If the current page shows the login form, fill credentials and submit.
 * Uses E2E_LOGIN_USERNAME / E2E_LOGIN_PASSWORD (default admin/admin).
 * Waits for navigation away from login. No-op if already on app (no login form).
 */
export async function loginIfNeeded(page: any) {
  const signInHeading = page.getByRole("heading", { name: /Sign In/i });
  const usernameInput = page.locator('input[id="username"]');
  const visible = await signInHeading.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false);
  if (!visible) return;

  await usernameInput.waitFor({ state: "visible", timeout: 2000 });
  await usernameInput.fill(E2E_LOGIN_USERNAME);
  await page.locator('input[id="password"]').fill(E2E_LOGIN_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u: URL) => !u.pathname.includes("/login"), { timeout: 15000 });
  await page.waitForLoadState("domcontentloaded");
}

