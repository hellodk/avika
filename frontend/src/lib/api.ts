/**
 * API utility functions with base path support
 */

// Base path from environment (set at build time)
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

/**
 * Fetch wrapper that automatically prepends the base path to API routes
 * Usage: apiFetch('/api/servers') -> fetches BASE_PATH + '/api/servers'
 */
export async function apiFetch(
  path: string,
  options?: RequestInit
): Promise<Response> {
  // Prepend base path if the path starts with /
  const url = path.startsWith("/") ? `${BASE_PATH}${path}` : path;
  return fetch(url, options);
}

/**
 * Helper to build full URL with base path
 */
export function apiUrl(path: string): string {
  return path.startsWith("/") ? `${BASE_PATH}${path}` : path;
}
