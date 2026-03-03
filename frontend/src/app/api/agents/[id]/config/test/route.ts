import { NextRequest, NextResponse } from "next/server";
import { getGatewayUrl } from "@/lib/gateway-url";

const GATEWAY_URL = getGatewayUrl();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionCookie = request.cookies.get("avika_session")?.value;
    const body = await request.json();
    const gatewayResponse = await fetch(`${GATEWAY_URL}/api/agents/${id}/config/test`, {
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

