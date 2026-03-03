import { NextRequest, NextResponse } from "next/server";
import { getGatewayUrl } from "@/lib/gateway-url";

const GATEWAY_URL = getGatewayUrl();

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get("avika_session")?.value;
    const gatewayResponse = await fetch(`${GATEWAY_URL}/api/llm/config`, {
      method: "GET",
      headers: sessionCookie ? { Cookie: `avika_session=${sessionCookie}` } : {},
    });
    const data = await gatewayResponse.json();
    return NextResponse.json(data, { status: gatewayResponse.status });
  } catch (error) {
    console.error("Failed to fetch LLM config:", error);
    return NextResponse.json({ error: "Failed to fetch LLM config" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get("avika_session")?.value;
    const body = await request.json();
    const gatewayResponse = await fetch(`${GATEWAY_URL}/api/llm/config`, {
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
    console.error("Failed to update LLM config:", error);
    return NextResponse.json({ error: "Failed to update LLM config" }, { status: 500 });
  }
}

