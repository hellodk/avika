export const BASE_PATH = process.env.BASE_PATH || process.env.NEXT_PUBLIC_BASE_PATH || "";

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

