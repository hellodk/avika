/**
 * Centralized gateway HTTP URL for server-side API routes (fetch to gateway REST API).
 * Use this for all HTTP calls to the gateway (e.g. /api/auth/sso-config, /api/servers/[id]/config).
 *
 * gRPC uses GATEWAY_GRPC_ADDR (port 5020) via getAgentServiceClient() in grpc-client.ts — do not use this URL for gRPC.
 *
 * Priority:
 *   1. GATEWAY_HTTP_URL   – HTTP endpoint (e.g. http://localhost:5021)
 *   2. GATEWAY_URL        – fallback (must be HTTP base URL)
 *   3. Default            – http://localhost:5021
 */
export function getGatewayUrl(): string {
    return (
        process.env.GATEWAY_HTTP_URL ||
        process.env.GATEWAY_URL ||
        "http://localhost:5021"
    );
}
