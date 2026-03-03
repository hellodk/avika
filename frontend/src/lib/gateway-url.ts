import { headers } from "next/headers";

/**
 * Get the gateway URL for server-side API routes.
 * Priority: 
 * 1. GATEWAY_HTTP_URL env var
 * 2. GATEWAY_URL env var
 * 3. Default dev URL (localhost:5021) - 5021 is the correct HTTP port, not 5050
 */
export function getGatewayUrl(): string {
    return process.env.GATEWAY_HTTP_URL || process.env.GATEWAY_URL || "http://localhost:5021";
}
