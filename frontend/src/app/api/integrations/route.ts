import { NextRequest, NextResponse } from "next/server";
import { getGatewayUrl } from "@/lib/gateway-url";

const GATEWAY_URL = getGatewayUrl();

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get("avika_session")?.value;
    const gatewayResponse = await fetch(`${GATEWAY_URL}/api/integrations`, {
      method: "GET",
      headers: sessionCookie ? { Cookie: `avika_session=${sessionCookie}` } : {},
    });
    const data = await gatewayResponse.json();
    return NextResponse.json(data, { status: gatewayResponse.status });
  } catch (error) {
    console.error("Failed to fetch integrations:", error);
    return NextResponse.json({ error: "Failed to fetch integrations" }, { status: 500 });
  }
}

