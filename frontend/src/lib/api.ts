/**
 * API utility functions with base path support
 */

// Base path from environment (set at build time)
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

// Feature flag for local development without backend
const MOCK_BACKEND = process.env.NEXT_PUBLIC_MOCK_BACKEND === "true";

/**
 * Fetch wrapper that automatically prepends the base path to API routes
 * Usage: apiFetch('/api/servers') -> fetches BASE_PATH + '/api/servers'
 */
export async function apiFetch(
  path: string,
  options?: RequestInit
): Promise<Response> {
  if (MOCK_BACKEND) {
    return handleMockResponse(path, options);
  }

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

/**
 * Basic in-memory interceptor for Mock Backend
 */
async function handleMockResponse(path: string, options?: RequestInit): Promise<Response> {
  // Simulate network latency
  await new Promise(resolve => setTimeout(resolve, 300));

  let data: any = { success: true, message: "Mock response" };
  const route = path.replace(BASE_PATH, "");

  if (route.startsWith("/api/auth/me")) {
    data = { authenticated: true, user: { username: "mockuser", role: "admin" }, token: "mock_token" };
  } else if (route.startsWith("/api/config")) {
    data = { gateway: { wsUrl: "ws://localhost:5021", httpUrl: "http://localhost:5021" } };
  } else if (route.startsWith("/api/analytics")) {
    data = {
      totals: {
        requests_total: 15420,
        requests_2xx: 14000,
        requests_3xx: 400,
        requests_4xx: 800,
        requests_5xx: 220,
        bytes_sent: 104857600
      },
      timeseries: []
    };
  } else if (route.startsWith("/api/system")) {
    data = {
      memory_used_mb: 2048,
      memory_total_mb: 8192,
      cpu_usage_percent: 45.2,
      go_routines: 120,
      db_connections: 5
    };
  } else if (route.startsWith("/api/projects")) {
    data = [
      { id: "default", name: "Default Project", description: "Mock default" }
    ];
  } else if (route.startsWith("/api/agents")) {
    data = {
      "status": "online",
      "version": "1.1.0"
    };
  } else if (route.startsWith("/api/servers")) {
    data = {
      agents: [
        { id: "mock-agent-1", hostname: "web-01.local", active: true, capabilities: ["nginx", "waf"] }
      ]
    };
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
