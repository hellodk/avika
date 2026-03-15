import { NextRequest, NextResponse } from "next/server";
import { getGatewayUrl } from "@/lib/gateway-url";
import { normalizeServerId } from "@/lib/api";

const GATEWAY_URL = getGatewayUrl();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const id = normalizeServerId(rawId);
    const sessionCookie = request.cookies.get("avika_session")?.value;
    const encodedId = encodeURIComponent(id);
    const gatewayResponse = await fetch(`${GATEWAY_URL}/api/agents/${encodedId}/config`, {
      method: "GET",
      headers: sessionCookie ? { Cookie: `avika_session=${sessionCookie}` } : {},
    });
    const data = await gatewayResponse.json();
    return NextResponse.json(data, { status: gatewayResponse.status });
  } catch (error) {
    console.error("Failed to fetch agent runtime config:", error);
    return NextResponse.json({ error: "Failed to fetch agent runtime config" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const id = normalizeServerId(rawId);
    const body = await request.json();
    const encodedId = encodeURIComponent(id);
    const sessionCookie = request.cookies.get("avika_session")?.value;
    const cookieHeader =
      sessionCookie != null
        ? `avika_session=${sessionCookie}`
        : request.headers.get("cookie") ?? undefined;
    const gatewayResponse = await fetch(`${GATEWAY_URL}/api/agents/${encodedId}/config`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await gatewayResponse.json();
    return NextResponse.json(data, { status: gatewayResponse.status });
  } catch (error) {
    console.error("Failed to update agent runtime config:", error);
    return NextResponse.json({ error: "Failed to update agent runtime config" }, { status: 500 });
  }
}

