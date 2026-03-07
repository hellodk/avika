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

/** Log in via UI if the page is on /login; uses E2E_LOGIN_* credentials. */
export async function loginIfNeeded(page: { url: () => Promise<string>; goto: (url: string) => Promise<unknown>; fill: (selector: string, value: string) => Promise<void>; click: (selector: string) => Promise<void>; waitForURL: (urlOrPredicate: string | ((u: URL) => boolean), opts?: { timeout?: number }) => Promise<void> }): Promise<void> {
  const url = await page.url();
  if (!url.includes("/login")) return;
  await page.goto("/login");
  await page.fill('input[id="username"]', E2E_LOGIN_USERNAME);
  await page.fill('input[id="password"]', E2E_LOGIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15000 });
}

