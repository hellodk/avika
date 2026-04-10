import { NextRequest, NextResponse } from "next/server";
import { getGatewayUrl } from "@/lib/gateway-url";

export const dynamic = "force-dynamic";

const GATEWAY_URL = getGatewayUrl();
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/avika";

// Loopback hosts almost certainly use self-signed certs.
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

interface InstallInfo {
  version?: string;
  tls_self_signed?: boolean;
  grpc_addr?: string;
}

/**
 * GET /updates/install
 *
 * Returns a self-contained bash script that installs the Avika agent.
 * All deployment-specific values (UPDATE_SERVER, GATEWAY_SERVER, INSECURE_CURL)
 * are baked in at generation time — the user just runs:
 *
 *   curl -kfsSL https://example.com/avika/updates/install | sudo bash
 */
export async function GET(request: NextRequest) {
  // 1. Compute the external URL from the incoming request.
  const proto =
    request.headers.get("x-forwarded-proto") ||
    (request.nextUrl.protocol === "https:" ? "https" : "http");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost";
  const hostname = host.split(":")[0];
  const updateServer = `${proto}://${host}${BASE_PATH}/updates`;

  // 2. Fetch install info from the gateway (TLS status, gRPC addr, version).
  let installInfo: InstallInfo = {};
  try {
    const res = await fetch(`${GATEWAY_URL}/api/system/install-info`, {
      cache: "no-store",
      headers: {
        // Use the incoming cookie so the gateway authenticates the request.
        Cookie: request.headers.get("cookie") || "",
      },
    });
    if (res.ok) {
      installInfo = await res.json();
    }
  } catch {
    // Non-fatal — we'll use safe defaults.
  }

  // 3. Compute GATEWAY_SERVER.
  let gatewayServer = installInfo.grpc_addr || "";
  if (!gatewayServer) {
    // Fallback: for loopback hosts use the gateway's internal gRPC port;
    // for production hosts assume gRPC is on :443 (HAProxy multiplexing).
    const isLoopback = LOOPBACK_HOSTS.has(hostname);
    gatewayServer = isLoopback ? `${hostname}:5020` : `${hostname}:443`;
  }

  // 4. Determine if we need insecure curl.
  const isLoopback = LOOPBACK_HOSTS.has(hostname);
  const insecureCurl = installInfo.tls_self_signed === true || isLoopback;

  // 5. Gateway version for the script comment.
  const version = installInfo.version || "unknown";

  // 6. Generate the install script.
  const script = `#!/bin/bash
# Avika Agent installer — auto-generated for ${host}
# Gateway version: ${version}
# Generated: ${new Date().toISOString()}
set -e

UPDATE_SERVER="${updateServer}"
GATEWAY_SERVER="${gatewayServer}"
INSECURE_CURL="${insecureCurl}"

export UPDATE_SERVER GATEWAY_SERVER INSECURE_CURL

CURL_OPTS="-fsSL"
[ "$INSECURE_CURL" = "true" ] && CURL_OPTS="-kfsSL"

echo "[INFO] Installing Avika Agent..."
echo "[INFO] Update server: $UPDATE_SERVER"
echo "[INFO] Gateway server: $GATEWAY_SERVER"

# Download and execute the deploy script
curl $CURL_OPTS "$UPDATE_SERVER/deploy-agent.sh" | bash
`;

  return new NextResponse(script, {
    headers: {
      "Content-Type": "application/x-sh",
      "Content-Disposition": "inline; filename=install.sh",
      "Cache-Control": "no-cache, no-store",
    },
  });
}
