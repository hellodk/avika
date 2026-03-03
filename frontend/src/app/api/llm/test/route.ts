import { NextRequest, NextResponse } from "next/server";
import { getGatewayUrl } from "@/lib/gateway-url";

const GATEWAY_URL = getGatewayUrl();

export async function POST(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get("avika_session")?.value;
    const gatewayResponse = await fetch(`${GATEWAY_URL}/api/llm/test`, {
      method: "POST",
      headers: sessionCookie ? { Cookie: `avika_session=${sessionCookie}` } : {},
    });
    const data = await gatewayResponse.json();
    return NextResponse.json(data, { status: gatewayResponse.status });
  } catch (error) {
    console.error("Failed to test LLM:", error);
    return NextResponse.json({ error: "Failed to test LLM" }, { status: 500 });
  }
}

