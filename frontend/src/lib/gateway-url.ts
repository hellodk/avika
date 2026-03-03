/**
 * Centralized gateway URL resolution for server-side API routes.
 *
 * Priority:
 *   1. GATEWAY_HTTP_URL   – explicit HTTP endpoint for the gateway
 *   2. GATEWAY_URL        – general gateway address (may include scheme)
 *   3. Default            – http://localhost:5021  (local dev)
 */
export function getGatewayUrl(): string {
    return (
        process.env.GATEWAY_HTTP_URL ||
        process.env.GATEWAY_URL ||
        "http://localhost:5021"
    );
}
