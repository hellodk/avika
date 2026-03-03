import { NextRequest, NextResponse } from "next/server";
import { getGatewayUrl } from "@/lib/gateway-url";

const GATEWAY_URL = getGatewayUrl();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params;
    const sessionCookie = request.cookies.get("avika_session")?.value;
    const gatewayResponse = await fetch(`${GATEWAY_URL}/api/integrations/${type}/test`, {
      method: "POST",
      headers: sessionCookie ? { Cookie: `avika_session=${sessionCookie}` } : {},
    });
    const data = await gatewayResponse.json();
    return NextResponse.json(data, { status: gatewayResponse.status });
  } catch (error) {
    console.error("Failed to test integration:", error);
    return NextResponse.json({ error: "Failed to test integration" }, { status: 500 });
  }
}

