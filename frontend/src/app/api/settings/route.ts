import { NextRequest, NextResponse } from "next/server";
import { getGatewayUrl } from "@/lib/gateway-url";

const GATEWAY_URL = getGatewayUrl();

function forwardCookies(request: NextRequest): Record<string, string> {
  const sessionCookie = request.cookies.get("avika_session")?.value;
  return sessionCookie ? { Cookie: `avika_session=${sessionCookie}` } : {};
}

export async function GET(request: NextRequest) {
  try {
    const gatewayResponse = await fetch(`${GATEWAY_URL}/api/settings`, {
      method: "GET",
      headers: forwardCookies(request),
    });
    const data = await gatewayResponse.json();
    return NextResponse.json(data, { status: gatewayResponse.status });
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const gatewayResponse = await fetch(`${GATEWAY_URL}/api/settings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...forwardCookies(request),
      },
      body: JSON.stringify(body),
    });
    const data = await gatewayResponse.json();
    return NextResponse.json(data, { status: gatewayResponse.status });
  } catch (error) {
    console.error("Failed to save settings:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
