import { NextRequest, NextResponse } from "next/server";
import { getGatewayUrl } from "@/lib/gateway-url";

const GATEWAY_URL = getGatewayUrl();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params;
    const sessionCookie = request.cookies.get("avika_session")?.value;
    const gatewayResponse = await fetch(`${GATEWAY_URL}/api/integrations/${type}`, {
      method: "GET",
      headers: sessionCookie ? { Cookie: `avika_session=${sessionCookie}` } : {},
    });
    const data = await gatewayResponse.json();
    return NextResponse.json(data, { status: gatewayResponse.status });
  } catch (error) {
    console.error("Failed to fetch integration:", error);
    return NextResponse.json({ error: "Failed to fetch integration" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params;
    const body = await request.json();
    const sessionCookie = request.cookies.get("avika_session")?.value;
    const gatewayResponse = await fetch(`${GATEWAY_URL}/api/integrations/${type}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(sessionCookie ? { Cookie: `avika_session=${sessionCookie}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await gatewayResponse.json();
    return NextResponse.json(data, { status: gatewayResponse.status });
  } catch (error) {
    console.error("Failed to update integration:", error);
    return NextResponse.json({ error: "Failed to update integration" }, { status: 500 });
  }
}

