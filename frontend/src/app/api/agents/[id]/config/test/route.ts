import { NextRequest, NextResponse } from "next/server";
import { getGatewayUrl } from "@/lib/gateway-url";
import { normalizeServerId } from "@/lib/api";

const GATEWAY_URL = getGatewayUrl();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const id = normalizeServerId(rawId);
    const sessionCookie = request.cookies.get("avika_session")?.value;
    const body = await request.json();
    const encodedId = encodeURIComponent(id);
    const gatewayResponse = await fetch(`${GATEWAY_URL}/api/agents/${encodedId}/config/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sessionCookie ? { Cookie: `avika_session=${sessionCookie}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await gatewayResponse.json();
    return NextResponse.json(data, { status: gatewayResponse.status });
  } catch (error) {
    console.error("Failed to test agent config connection:", error);
    return NextResponse.json({ error: "Failed to test connection" }, { status: 500 });
  }
}

