import { NextRequest, NextResponse } from "next/server";
import { getGatewayUrl } from "@/lib/gateway-url";

const GATEWAY_URL = getGatewayUrl();

export async function GET() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const gatewayRes = await fetch(`${GATEWAY_URL}/ready`, {
      signal: controller.signal,
      cache: 'no-store'
    }).catch(() => null);

    clearTimeout(timeoutId);

    if (gatewayRes) {
      const data = await gatewayRes.json().catch(() => ({}));
      return NextResponse.json({
        status: data.status || (gatewayRes.ok ? "ready" : "not_ready"),
        database: data.database || (gatewayRes.ok ? "connected" : "disconnected"),
        clickhouse: data.clickhouse || (gatewayRes.ok ? "connected" : "disconnected"),
        timestamp: new Date().toISOString()
      }, { status: gatewayRes.ok ? 200 : 503 });
    }

    return NextResponse.json({
      status: "not_ready",
      database: "disconnected",
      clickhouse: "disconnected",
      timestamp: new Date().toISOString()
    }, { status: 503 });
  } catch (error) {
    return NextResponse.json({
      status: "not_ready",
      database: "unknown",
      clickhouse: "unknown",
      error: "Health check failed",
      timestamp: new Date().toISOString()
    }, { status: 503 });
  }
}
