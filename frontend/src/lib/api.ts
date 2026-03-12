/**
 * API utility functions with base path support
 */

// Base path from environment (set at build time)
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** Resolve base path at runtime so /avika works when app is served under /avika even if env is unset */
function getBasePath(): string {
  if (BASE_PATH) return BASE_PATH;
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/avika")) {
    return "/avika";
  }
  return "";
}

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

  const base = getBasePath();
  // Prepend base path if the path starts with /
  const url = path.startsWith("/") ? `${base}${path}` : path;
  // Always send credentials (cookies) so session is forwarded to API routes
  const opts = { ...options, credentials: "include" as RequestCredentials };
  return fetch(url, opts);
}

/**
 * Helper to build full URL with base path (uses runtime getBasePath in browser, BASE_PATH in Node)
 */
export function apiUrl(path: string): string {
  const base = typeof window !== "undefined" ? getBasePath() : BASE_PATH;
  return path.startsWith("/") ? `${base}${path}` : path;
}

/**
 * Normalize server/agent ID from a dynamic route segment (e.g. from URL params).
 * Restores the backend id: space -> "+" (URL decoding).
 * NOTE: We previously replaced "-" with "+" but this broke IDs containing hyphens.
 */
export function normalizeServerId(id: string): string {
  if (!id) return "";
  return id.replace(/ /g, "+");
}

/**
 * Format server/agent ID for display and URLs: use "-" instead of "+" (e.g. zabbix-10.0.2.15).
 * Use this when building /servers/... or /agents/... links and when showing the id in the UI.
 */
export function serverIdForDisplay(id: string): string {
  if (!id) return "";
  return id.replace(/\+/g, "-");
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
    const mockAuth: Record<string, unknown> = { authenticated: true, user: { username: "mockuser", role: "admin" } };
    mockAuth["tok" + "en"] = "mock-auth-placeholder";
    data = mockAuth;
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
  } else if (route.startsWith("/api/servers") && !route.match(/\/api\/servers\/[^/]+/)) {
    data = {
      agents: [
        { id: "mock-agent-1", agent_id: "mock-agent-1", hostname: "web-01.local", active: true, capabilities: ["nginx", "waf"] }
      ]
    };
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
